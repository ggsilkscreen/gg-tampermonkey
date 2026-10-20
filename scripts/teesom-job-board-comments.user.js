// ==UserScript==
// @name         Teesom Job Board - Quick Comments V9.23
// @namespace    http://tampermonkey.net/
// @version      3.1.1
// @description  Adds a quick-comment button (yellow) plus a "?" question-email button to each row on the Teesom job board, and the same pair next to the WIP status on individual order pages - reading the currently-selected Sales Rep directly from that page's dropdown.
// @author       You
// @match        https://app.teesom.com/saiw/jobboard.asp*
// @match        https://app.teesom.com/saiw/orderentry.asp*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-job-board-comments.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-job-board-comments.user.js
// ==/UserScript==
(function() {
    'use strict';

    const WEBAPP_URL = 'https://script.google.com/a/macros/ggsilkscreen.com/s/AKfycbzGw0e2RgRf9jGX2n04cPknbRikPEzbJlJFZceyH5MVEcaenIlPNDmq1Ylgs4TpyWz9wA/exec';

    const COLOR_HAS_COMMENT = { bg: '#fff59d', fg: '#5c4d00', border: '#e6c200' };
    const COLOR_NO_COMMENT  = { bg: '#e0e0e0', fg: '#616161', border: '#bdbdbd' };
    const COLOR_QUESTION    = { bg: '#ffcdd2', fg: '#b71c1c', border: '#ef9a9a' };

    // Rep name (as shown on the row) -> email address. CONFIRM/CORRECT these -
    // guessed from patterns seen in other GG Silkscreen automations, not verified.
    const REP_EMAILS = {
        'Ricky Krueger': 'ricky@ggsilkscreen.com',
        'Erin Perry': 'erin@ggsilkscreen.com',
        'Ross Latrell': 'ross@ggsilkscreen.com'
    };

    // Populated once from a single summary fetch on page load: order number -> { comment, author, count }
    let latestCommentsByOrder = {};
    let summaryLoaded = false;

    // ---- Row detection ----
    function findOrderRows() {
        return Array.from(document.querySelectorAll('.jcwtsmjobrdrow[dbid]'));
    }

    function getOrderNumber(row) {
        const link = row.querySelector('a.ts_openurl');
        if (!link) return null;
        return link.textContent.trim().replace('#', '');
    }

    function getOrderOid(row) {
        const link = row.querySelector('a.ts_openurl');
        if (!link) return null;
        const href = link.getAttribute('href') || '';
        const match = href.match(/oid=([^&]+)/);
        return match ? match[1] : null;
    }

    // ---- Order entry page (single order per page, not a list) ----
    function getOrderEntryOid() {
        return new URLSearchParams(window.location.search).get('oid');
    }

    function getOrderEntryOrderNumber() {
        const el = document.getElementById('ordernumber');
        return el ? el.textContent.trim().replace('#', '') : null;
    }

    function getOrderEntryRepName() {
        const select = document.getElementById('salesrepchange');
        if (!select) return null;
        const selected = select.options[select.selectedIndex];
        return selected ? selected.textContent.trim() : null;
    }

    function injectOrderEntryComment() {
        if (document.querySelector('.tm-comment-wrapper')) return; // already added
        const anchor = document.getElementById('order-entry-stage-header-group');
        if (!anchor) {
            console.error('[Order Comments] could not find stage dropdown group to anchor next to on orderentry.asp');
            return;
        }
        const orderNumber = getOrderEntryOrderNumber();
        if (!orderNumber) {
            console.error('[Order Comments] could not determine order number on orderentry.asp');
            return;
        }
        const orderOid = getOrderEntryOid();
        const repName = getOrderEntryRepName();

        const wrapper = document.createElement('span');
        wrapper.className = 'tm-comment-wrapper';
        wrapper.style.display = 'inline-flex';
        wrapper.style.gap = '4px';
        wrapper.style.marginLeft = '10px';
        wrapper.style.verticalAlign = 'middle';

        const commentBtn = document.createElement('div');
        commentBtn.className = 'tm-comment-btn';
        commentBtn.dataset.orderNumber = orderNumber;
        commentBtn.style.padding = '4px 10px';
        commentBtn.style.borderRadius = '3px';
        commentBtn.style.fontSize = '12px';
        commentBtn.style.fontWeight = 'bold';
        commentBtn.style.cursor = 'pointer';
        commentBtn.style.maxWidth = '300px';
        commentBtn.style.whiteSpace = 'nowrap';
        commentBtn.style.overflow = 'hidden';
        commentBtn.style.textOverflow = 'ellipsis';

        applyButtonContent(commentBtn, orderNumber);

        commentBtn.addEventListener('click', function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            openCommentPopup(orderNumber);
        });

        const questionBtn = document.createElement('div');
        questionBtn.className = 'tm-question-btn';
        questionBtn.textContent = '?';
        questionBtn.title = repName ? ('Ask ' + repName + ' a question') : 'Ask a question';
        questionBtn.style.padding = '4px 10px';
        questionBtn.style.borderRadius = '3px';
        questionBtn.style.fontSize = '12px';
        questionBtn.style.fontWeight = 'bold';
        questionBtn.style.cursor = 'pointer';
        questionBtn.style.backgroundColor = '#bbdefb';
        questionBtn.style.color = '#0d47a1';
        questionBtn.style.border = '1px solid #64b5f6';

        questionBtn.addEventListener('click', function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            openQuestionPopup(orderNumber, repName, orderOid);
        });

        wrapper.appendChild(commentBtn);
        wrapper.appendChild(questionBtn);
        anchor.insertAdjacentElement('afterend', wrapper);
    }

    // ---- Author name (asked once, remembered per-browser) ----
    function getAuthorName(promptIfMissing) {
        let name = GM_getValue('tm_comment_author', '');
        if (!name && promptIfMissing) {
            name = window.prompt('Your name (used on comments you add):', '') || 'Unknown';
            GM_setValue('tm_comment_author', name);
        }
        return name;
    }

    // ---- One-time summary fetch: which orders have any comment at all ----
    function loadSummaryThenProcessRows() {
        const url = WEBAPP_URL + '?summary=1&_=' + Date.now();
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    latestCommentsByOrder = data.latest || {};
                    console.log('[Order Comments] summary loaded,', Object.keys(latestCommentsByOrder).length, 'order(s) with comments');
                } catch (err) {
                    console.error('[Order Comments] failed to parse summary response:', err, response.responseText);
                }
                summaryLoaded = true;
                processRows();
            },
            onerror: function(err) {
                console.error('[Order Comments] summary fetch failed:', err);
                summaryLoaded = true; // proceed anyway, everything shows gray
                processRows();
            }
        });
    }

    // ---- Button injection (instant, no per-row fetch) ----
    function applyButtonContent(btn, orderNumber) {
        const entry = latestCommentsByOrder[orderNumber];
        if (!entry) {
            btn.textContent = '+';
            btn.title = 'Add a comment';
            btn.style.backgroundColor = COLOR_NO_COMMENT.bg;
            btn.style.color = COLOR_NO_COMMENT.fg;
            btn.style.border = '1px solid ' + COLOR_NO_COMMENT.border;
        } else {
            const isQuestion = entry.comment && entry.comment.indexOf('Q: ') === 0;
            const color = isQuestion ? COLOR_QUESTION : COLOR_HAS_COMMENT;
            btn.textContent = entry.comment;
            btn.title = (entry.author || 'Unknown') + ': ' + entry.comment;
            btn.style.backgroundColor = color.bg;
            btn.style.color = color.fg;
            btn.style.border = '1px solid ' + color.border;
        }
    }

    function injectCommentButton(row) {
        if (row.querySelector('.tm-comment-wrapper')) return; // already added
        const repLine = row.querySelector('[title="Sales Rep"]');
        if (!repLine) return;

        const orderNumber = getOrderNumber(row);
        if (!orderNumber) return;
        const orderOid = getOrderOid(row);
        const repName = repLine.textContent.trim();

        const wrapper = document.createElement('div');
        wrapper.className = 'tm-comment-wrapper';
        wrapper.style.display = 'flex';
        wrapper.style.gap = '4px';
        wrapper.style.marginTop = '4px';

        const commentBtn = document.createElement('div');
        commentBtn.className = 'tm-comment-btn';
        commentBtn.dataset.orderNumber = orderNumber;
        commentBtn.style.flex = '1';
        commentBtn.style.minWidth = '0'; // needed for ellipsis to work correctly inside a flex item
        commentBtn.style.padding = '2px 8px';
        commentBtn.style.borderRadius = '3px';
        commentBtn.style.fontSize = '11px';
        commentBtn.style.fontWeight = 'bold';
        commentBtn.style.cursor = 'pointer';
        commentBtn.style.whiteSpace = 'nowrap';
        commentBtn.style.overflow = 'hidden';
        commentBtn.style.textOverflow = 'ellipsis';
        commentBtn.style.boxSizing = 'border-box';

        applyButtonContent(commentBtn, orderNumber);

        commentBtn.addEventListener('click', function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            openCommentPopup(orderNumber);
        });

        const questionBtn = document.createElement('div');
        questionBtn.className = 'tm-question-btn';
        questionBtn.textContent = '?';
        questionBtn.title = 'Ask ' + repName + ' a question';
        questionBtn.style.flex = '0 0 auto';
        questionBtn.style.padding = '2px 8px';
        questionBtn.style.borderRadius = '3px';
        questionBtn.style.fontSize = '11px';
        questionBtn.style.fontWeight = 'bold';
        questionBtn.style.cursor = 'pointer';
        questionBtn.style.backgroundColor = '#bbdefb';
        questionBtn.style.color = '#0d47a1';
        questionBtn.style.border = '1px solid #64b5f6';
        questionBtn.style.boxSizing = 'border-box';

        questionBtn.addEventListener('click', function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            openQuestionPopup(orderNumber, repName, orderOid);
        });

        wrapper.appendChild(commentBtn);
        wrapper.appendChild(questionBtn);
        repLine.insertAdjacentElement('afterend', wrapper);
    }

    // ---- Popup UI ----
    function closePopup() {
        const existing = document.getElementById('tm-comment-popup-backdrop');
        if (existing) existing.remove();
    }

    function openCommentPopup(orderNumber) {
        closePopup();

        const backdrop = document.createElement('div');
        backdrop.id = 'tm-comment-popup-backdrop';
        backdrop.style.position = 'fixed';
        backdrop.style.top = '0';
        backdrop.style.left = '0';
        backdrop.style.width = '100%';
        backdrop.style.height = '100%';
        backdrop.style.backgroundColor = 'rgba(0,0,0,0.4)';
        backdrop.style.zIndex = '999999';
        backdrop.style.display = 'flex';
        backdrop.style.alignItems = 'center';
        backdrop.style.justifyContent = 'center';
        backdrop.addEventListener('click', function(evt) {
            if (evt.target === backdrop) closePopup();
        });

        const box = document.createElement('div');
        box.style.backgroundColor = '#ffffff';
        box.style.borderRadius = '6px';
        box.style.padding = '20px';
        box.style.width = '420px';
        box.style.maxWidth = '90vw';
        box.style.maxHeight = '80vh';
        box.style.display = 'flex';
        box.style.flexDirection = 'column';
        box.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
        box.style.fontFamily = 'inherit';

        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h3 style="margin:0; font-size:16px;">Comments - Order #${orderNumber}</h3>
                <span id="tm-comment-close" style="cursor:pointer; font-size:20px; line-height:1;">&times;</span>
            </div>
            <div id="tm-comment-list" style="overflow-y:auto; flex:1; min-height:100px; max-height:300px; border:1px solid #eee; border-radius:4px; padding:8px; margin-bottom:10px; font-size:13px;">
                Loading...
            </div>
            <textarea id="tm-comment-input" placeholder="Add a comment..." style="width:100%; box-sizing:border-box; min-height:60px; padding:6px; font-size:13px; border:1px solid #ccc; border-radius:4px; resize:vertical;"></textarea>
            <button id="tm-comment-submit" style="margin-top:8px; align-self:flex-end; padding:6px 16px; background-color:#073763; color:white; border:none; border-radius:3px; cursor:pointer; font-size:13px; font-weight:bold;">Add Comment</button>
        `;

        backdrop.appendChild(box);
        document.body.appendChild(backdrop);

        box.querySelector('#tm-comment-close').addEventListener('click', closePopup);
        box.querySelector('#tm-comment-submit').addEventListener('click', function() {
            submitComment(orderNumber);
        });

        loadComments(orderNumber);
    }

    function renderComments(comments) {
        const list = document.getElementById('tm-comment-list');
        if (!list) return;
        if (!comments || comments.length === 0) {
            list.innerHTML = '<div style="color:#888;">No comments yet.</div>';
            return;
        }
        list.innerHTML = comments.map(c => {
            const when = c.timestamp ? new Date(c.timestamp).toLocaleString() : '';
            const isQuestion = c.comment && c.comment.indexOf('Q: ') === 0;
            const bg = isQuestion ? '#ffebee' : 'transparent';
            return `<div style="margin-bottom:8px; padding:6px; background-color:${bg}; border-radius:4px; border-bottom:1px solid #eee;">
                <div style="font-weight:bold;">${escapeHtml(c.author || 'Unknown')} <span style="font-weight:normal; color:#888; font-size:11px;">${escapeHtml(when)}</span></div>
                <div>${escapeHtml(c.comment)}</div>
            </div>`;
        }).join('');
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function loadComments(orderNumber) {
        const url = WEBAPP_URL + '?order=' + encodeURIComponent(orderNumber) + '&_=' + Date.now();
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    renderComments(data.comments);
                } catch (err) {
                    console.error('[Order Comments] failed to parse response:', err, response.responseText);
                    const list = document.getElementById('tm-comment-list');
                    if (list) list.innerHTML = '<div style="color:#c00;">Failed to load comments.</div>';
                }
            },
            onerror: function(err) {
                console.error('[Order Comments] fetch failed:', err);
                const list = document.getElementById('tm-comment-list');
                if (list) list.innerHTML = '<div style="color:#c00;">Failed to load comments.</div>';
            }
        });
    }

    function submitComment(orderNumber) {
        const input = document.getElementById('tm-comment-input');
        const text = input.value.trim();
        if (!text) return;

        const author = getAuthorName(true);

        // Close immediately and send in the background - no need to wait
        // and watch it complete (same pattern as questions).
        closePopup();

        // Update local state + refresh this row's button immediately,
        // without waiting for a fresh summary fetch.
        const existing = latestCommentsByOrder[orderNumber];
        latestCommentsByOrder[orderNumber] = {
            comment: text,
            author: author,
            count: existing ? existing.count + 1 : 1
        };
        const btn = document.querySelector('.tm-comment-btn[data-order-number="' + orderNumber + '"]');
        if (btn) applyButtonContent(btn, orderNumber);

        GM_xmlhttpRequest({
            method: 'POST',
            url: WEBAPP_URL,
            data: JSON.stringify({ order: orderNumber, comment: text, author: author }),
            headers: { 'Content-Type': 'application/json' },
            onload: function(response) {
                let data;
                try {
                    data = JSON.parse(response.responseText);
                } catch (err) {
                    console.error('[Order Comments] comment response parse failed:', err, response.responseText);
                    return;
                }
                if (data.success) {
                    console.log('[Order Comments] comment added for order', orderNumber);
                } else {
                    console.error('[Order Comments] comment failed to add:', data.error);
                }
            },
            onerror: function(err) {
                console.error('[Order Comments] comment submit failed:', err);
            }
        });
    }

    // ---- Question popup (sends an email to the row's sales rep) ----
    function openQuestionPopup(orderNumber, repName, orderOid) {
        closePopup();

        const repEmail = REP_EMAILS[repName];

        const backdrop = document.createElement('div');
        backdrop.id = 'tm-comment-popup-backdrop';
        backdrop.style.position = 'fixed';
        backdrop.style.top = '0';
        backdrop.style.left = '0';
        backdrop.style.width = '100%';
        backdrop.style.height = '100%';
        backdrop.style.backgroundColor = 'rgba(0,0,0,0.4)';
        backdrop.style.zIndex = '999999';
        backdrop.style.display = 'flex';
        backdrop.style.alignItems = 'center';
        backdrop.style.justifyContent = 'center';
        backdrop.addEventListener('click', function(evt) {
            if (evt.target === backdrop) closePopup();
        });

        const box = document.createElement('div');
        box.style.backgroundColor = '#ffffff';
        box.style.borderRadius = '6px';
        box.style.padding = '20px';
        box.style.width = '420px';
        box.style.maxWidth = '90vw';
        box.style.display = 'flex';
        box.style.flexDirection = 'column';
        box.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
        box.style.fontFamily = 'inherit';

        const missingEmailWarning = repEmail ? '' :
            '<div style="color:#c00; margin-bottom:8px; font-size:12px;">No email on file for ' + escapeHtml(repName) + ' - add one to REP_EMAILS in the script.</div>';

        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h3 style="margin:0; font-size:16px;">Ask ${escapeHtml(repName)} - Order #${orderNumber}</h3>
                <span id="tm-comment-close" style="cursor:pointer; font-size:20px; line-height:1;">&times;</span>
            </div>
            ${missingEmailWarning}
            <textarea id="tm-question-input" placeholder="Type your question..." style="width:100%; box-sizing:border-box; min-height:80px; padding:6px; font-size:13px; border:1px solid #ccc; border-radius:4px; resize:vertical;"></textarea>
            <button id="tm-question-submit" style="margin-top:8px; align-self:flex-end; padding:6px 16px; background-color:#0d47a1; color:white; border:none; border-radius:3px; cursor:pointer; font-size:13px; font-weight:bold;" ${repEmail ? '' : 'disabled'}>Send Question</button>
        `;

        backdrop.appendChild(box);
        document.body.appendChild(backdrop);

        box.querySelector('#tm-comment-close').addEventListener('click', closePopup);
        box.querySelector('#tm-question-submit').addEventListener('click', function() {
            submitQuestion(orderNumber, repEmail, repName, orderOid);
        });
    }

    function submitQuestion(orderNumber, repEmail, repName, orderOid) {
        const input = document.getElementById('tm-question-input');
        const text = input.value.trim();
        if (!text || !repEmail) return;

        const author = getAuthorName(true);

        // Close immediately and send in the background - no need to wait
        // and watch it complete.
        closePopup();

        // Update local state + refresh this row's button immediately,
        // without waiting for a fresh summary fetch (same pattern as
        // regular comments).
        const existing = latestCommentsByOrder[orderNumber];
        latestCommentsByOrder[orderNumber] = {
            comment: 'Q: ' + text,
            author: author,
            count: existing ? existing.count + 1 : 1
        };
        const btn = document.querySelector('.tm-comment-btn[data-order-number="' + orderNumber + '"]');
        if (btn) applyButtonContent(btn, orderNumber);

        GM_xmlhttpRequest({
            method: 'POST',
            url: WEBAPP_URL,
            data: JSON.stringify({ action: 'question', order: orderNumber, question: text, repEmail: repEmail, author: author, oid: orderOid }),
            headers: { 'Content-Type': 'application/json' },
            onload: function(response) {
                let data;
                try {
                    data = JSON.parse(response.responseText);
                } catch (err) {
                    console.error('[Order Comments] question response parse failed:', err, response.responseText);
                    return;
                }
                if (data.success) {
                    console.log('[Order Comments] question sent to', repEmail, 'for order', orderNumber);
                } else {
                    console.error('[Order Comments] question failed to send:', data.error);
                }
            },
            onerror: function(err) {
                console.error('[Order Comments] question send failed:', err);
            }
        });
    }

    // ---- Init ----
    const processedRows = new WeakSet();
    const isOrderEntryPage = /\/orderentry\.asp/.test(window.location.pathname);

    function processRows() {
        if (!summaryLoaded) return; // wait for the one-time summary fetch first

        if (isOrderEntryPage) {
            injectOrderEntryComment();
            return;
        }

        findOrderRows().forEach(row => {
            if (processedRows.has(row)) return;
            processedRows.add(row);
            injectCommentButton(row);
        });
    }

    loadSummaryThenProcessRows();
    const observer = new MutationObserver(processRows);
    observer.observe(document.body, { childList: true, subtree: true });
})();
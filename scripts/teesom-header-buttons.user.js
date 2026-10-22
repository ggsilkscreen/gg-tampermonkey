// ==UserScript==
// @name         Teesom Buttons v9.23
// @namespace    http://tampermonkey.net/
// @version      4.1.1
// @description  Adds SHOP MANUAL, TEESOM MANUAL, TRANSFERS (shows LOGIN NOW when signed out of the transfers site), (on an open order) COMPLETE & PRINT, (on the Job Board) SEND JOBS, (on the Order List) IMPORT CHIPPLY, and (on the Calendar) TIDY CALENDAR buttons to the top center of specific app.teesom.com pages, hides them from printed output if they ever appear anywhere else, and hides them while a popup/modal is genuinely visible so they don't render on top of it.
// @author       You
// @match        https://app.teesom.com/saiw/orderlist.asp*
// @match        https://app.teesom.com/saiw/jobboard.asp*
// @match        https://app.teesom.com/saiw/tasks.asp*
// @match        https://app.teesom.com/saiw/calendar.asp*
// @match        https://app.teesom.com/saiw/intro.asp*
// @match        https://app.teesom.com/saiw/orderentry.asp*
// @match        https://app.teesom.com/saiw/companysetup.asp*
// @match        https://app.teesom.com/saiw/print/salesorder.aspx*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      ggh.nacoteds.com
// @connect      manage.chipply.com
// @run-at       document-end
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-header-buttons.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-header-buttons.user.js
// ==/UserScript==
(function() {
    'use strict';

    const AUTO_PRINT_FLAG = 'tm-complete-print-auto-print';

    // ---------------------------------------------------------------
    // Print Invoice page: no button bar here, just auto-trigger the
    // print dialog if we were sent here by the COMPLETE & PRINT button.
    // ---------------------------------------------------------------
    if (/\/saiw\/print\/salesorder\.aspx/i.test(location.pathname)) {
        let shouldAutoPrint = false;
        try {
            shouldAutoPrint = sessionStorage.getItem(AUTO_PRINT_FLAG) === '1';
            if (shouldAutoPrint) sessionStorage.removeItem(AUTO_PRINT_FLAG);
        } catch (e) { /* ignore */ }

        if (shouldAutoPrint) {
            const start = Date.now();
            const timer = setInterval(() => {
                if (typeof window.PrintPage === 'function') {
                    clearInterval(timer);
                    setTimeout(() => window.PrintPage(), 600);
                } else if (Date.now() - start > 8000) {
                    clearInterval(timer);
                    const btn = Array.from(document.querySelectorAll('button')).find(
                        (e) => e.textContent.trim() === 'Print'
                    );
                    if (btn) btn.click();
                }
            }, 150);
        }
        return;
    }

    // Prevent duplicate injection if the script triggers twice
    if (document.getElementById('tm-manual-btn-bar')) return;

    // 0. Safety net: force the bar to never appear in print preview / printed
    // output / Ctrl+P, in case one of these pages is ever printed directly.
    if (!document.getElementById('tm-manual-btn-bar-style')) {
        const style = document.createElement('style');
        style.id = 'tm-manual-btn-bar-style';
        style.textContent = '@media print { #tm-manual-btn-bar { display: none !important; } }';
        document.head.appendChild(style);
    }

    // 1. Container bar - fixed, top center, floats above page content
    const bar = document.createElement('div');
    bar.id = 'tm-manual-btn-bar';
    bar.classList.add('DoNotPrint'); // matches the site's own print-exclusion class, belt-and-suspenders
    bar.style.position = 'fixed';
    bar.style.top = '8px';
    bar.style.left = '50%';
    bar.style.transform = 'translateX(-50%)';
    bar.style.zIndex = '999999';
    bar.style.display = 'flex';
    bar.style.gap = '10px';

    // 2. Shared button factory - same look as the Print for ESP button
    function makeButton(label, url) {
        const btn = document.createElement('a');
        btn.innerText = label;
        btn.href = url;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.style.padding = '5px 15px';
        btn.style.backgroundColor = '#073763';
        btn.style.color = 'white';
        btn.style.border = '1px solid #062f54';
        btn.style.borderRadius = '3px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '12px';
        btn.style.fontWeight = 'bold';
        btn.style.textDecoration = 'none';
        btn.style.display = 'inline-block';
        btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        btn.onmouseover = () => btn.style.backgroundColor = '#062f54';
        btn.onmouseout = () => btn.style.backgroundColor = '#073763';
        return btn;
    }

    // 2b. Same look, but a real <button> (not a link) with its own
    // green color, for the COMPLETE & PRINT action button.
    function makeActionButton(label, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerText = label;
        btn.style.padding = '5px 15px';
        btn.style.backgroundColor = '#1a891c';
        btn.style.color = 'white';
        btn.style.border = '1px solid #146614';
        btn.style.borderRadius = '3px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '12px';
        btn.style.fontWeight = 'bold';
        btn.style.display = 'inline-block';
        btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        btn.onmouseover = () => btn.style.backgroundColor = '#146614';
        btn.onmouseout = () => btn.style.backgroundColor = '#1a891c';
        btn.addEventListener('click', onClick);
        return btn;
    }

    // 2c. Same look as makeActionButton, but its own blue color, used for
    // the Job Board's SEND JOBS button so it doesn't look like the (order-only)
    // green COMPLETE & PRINT action.
    function makeBlueActionButton(label, onClick) {
        const btn = makeActionButton(label, onClick);
        btn.style.backgroundColor = '#0a58ca';
        btn.style.border = '1px solid #084298';
        btn.onmouseover = () => btn.style.backgroundColor = '#084298';
        btn.onmouseout = () => btn.style.backgroundColor = '#0a58ca';
        return btn;
    }

    // 3. Build and insert the buttons
    const shopManualBtn = makeButton('SHOP MANUAL', 'https://sites.google.com/ggsilkscreen.com/ggsilkscreenopsmanual');
    const teesomManualBtn = makeButton('TEESOM MANUAL', 'https://docs.teesom.com/en/tutorials/tutorial');
    const transfersBtn = makeButton('TRANSFERS', 'https://ggh.nacoteds.com/transfers');

    bar.appendChild(shopManualBtn);
    bar.appendChild(teesomManualBtn);
    bar.appendChild(transfersBtn);

    // 3a. TRANSFERS -> LOGIN NOW when not signed in to ggh.nacoteds.com.
    // LOGIN NOW still points at /transfers: the site redirects to its login
    // page and drops you back on Transfers after you sign in.
    // Re-checks whenever this tab regains focus, so logging in in another
    // tab flips the button back to TRANSFERS on its own.
    const TRANSFERS_URL = 'https://ggh.nacoteds.com/transfers';

    function setTransfersState(loggedIn) {
        const base  = loggedIn ? '#073763' : '#c0392b';
        const hover = loggedIn ? '#062f54' : '#962d22';
        transfersBtn.innerText = loggedIn ? 'TRANSFERS' : 'LOGIN NOW';
        transfersBtn.href = TRANSFERS_URL;
        transfersBtn.title = loggedIn ? '' : 'Not logged in to the transfers site - click to log in';
        transfersBtn.style.backgroundColor = base;
        transfersBtn.style.border = '1px solid ' + hover;
        transfersBtn.onmouseover = () => transfersBtn.style.backgroundColor = hover;
        transfersBtn.onmouseout  = () => transfersBtn.style.backgroundColor = base;
    }

    function checkTransfersLogin() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: TRANSFERS_URL,
            anonymous: false, // send your ggh.nacoteds.com cookies
            onload: (r) => {
                const sentToLogin  = /\/login\b/i.test(r.finalUrl || '') || r.status === 401 || r.status === 419;
                const hasLoginForm = /<input[^>]+type=["']?password/i.test(r.responseText || '');
                setTransfersState(!(sentToLogin || hasLoginForm));
            },
            onerror: () => { /* site unreachable - leave the button as-is */ }
        });
    }

    checkTransfersLogin();
    window.addEventListener('focus', checkTransfersLogin);

    // 3b. COMPLETE & PRINT - only meaningful on an open order (orderentry.asp
    // with the stage/status dropdowns present), so it's only added there.
    const STAGE_SELECT_ID = 'drpoechnagestage';
    const STAGE_COMPLETE_VALUE = 'G2HLH9U_BDMEVTSDQ_230119_140712_C5GWV473_8FAMP9GMC'; // "(6) Order is Completed ---> Ready for Pickup / Shipping"
    const STATUS_SELECT_ID = 'drpordstatusslk';
    const STATUS_COMPLETE_VALUE = 'completed';
    const STATUS_SHIPPED_VALUE = 'shipped';
    const CONFIRM_CHECKBOX_ID = 'inpneworder_confirmordv';
    const CONFIRM_SUBMIT_ID = 'submit_ord_complete';
    const MAIL_SEND_BTN_ID = 'btn_mail_send_preview';
    const PRINT_INVOICE_SELECTOR = 'li.row-j-action-btn-click[t="ovprint"]';
    const SHIPPED_CHECKBOX_ID = 'inpneworders_confirmord';
    const SHIPPED_SUBMIT_ID = 'submitnewsendordershipped';

    function waitFor(check, { timeout = 15000, interval = 150 } = {}) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timer = setInterval(() => {
                const el = check();
                if (el) {
                    clearInterval(timer);
                    resolve(el);
                } else if (Date.now() - start > timeout) {
                    clearInterval(timer);
                    reject(new Error('Timed out waiting for: ' + check.toString()));
                }
            }, interval);
        });
    }

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    function fireChange(el) {
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function isElVisible(el) {
        return !!el && el.offsetParent !== null;
    }

    function toast(msg, isError) {
        let box = document.getElementById('tm-complete-print-toast');
        if (!box) {
            box = document.createElement('div');
            box.id = 'tm-complete-print-toast';
            box.style.cssText =
                'position:fixed;bottom:20px;right:20px;z-index:999999;padding:12px 18px;' +
                'border-radius:6px;color:#fff;font:14px/1.4 sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);' +
                'max-width:320px;';
            document.body.appendChild(box);
        }
        box.style.background = isError ? '#c0392b' : '#2c7be5';
        box.textContent = msg;
        box.style.display = 'block';
        clearTimeout(box._hideTimer);
        box._hideTimer = setTimeout(() => (box.style.display = 'none'), 6000);
    }

    async function runCompleteAndPrint() {
        try {
            toast('Setting stage to (6) Order is Completed…');
            const stageSelect = document.getElementById(STAGE_SELECT_ID);
            if (!stageSelect) throw new Error('Stage dropdown not found');
            stageSelect.value = STAGE_COMPLETE_VALUE;
            fireChange(stageSelect);
            await sleep(1000);

            toast('Marking order status Completed…');
            const statusSelect = document.getElementById(STATUS_SELECT_ID);
            if (!statusSelect) throw new Error('Status dropdown not found');
            statusSelect.value = STATUS_COMPLETE_VALUE;
            fireChange(statusSelect);

            // "Confirm Order Complete" popup
            const checkbox = await waitFor(() => {
                const el = document.getElementById(CONFIRM_CHECKBOX_ID);
                return isElVisible(el) ? el : null;
            });
            if (!checkbox.checked) {
                checkbox.checked = true;
                fireChange(checkbox);
                checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            }
            await sleep(400);

            toast('Sending Order Complete / Final Payment email…');
            const submitBtn = await waitFor(() => {
                const el = document.getElementById(CONFIRM_SUBMIT_ID);
                return isElVisible(el) ? el : null;
            });
            submitBtn.click();

            // "Send Email" preview modal
            const sendBtn = await waitFor(() => {
                const el = document.getElementById(MAIL_SEND_BTN_ID);
                return isElVisible(el) ? el : null;
            });
            sendBtn.click();

            await sleep(1200);

            toast('Opening print invoice…');
            const printItem = document.querySelector(PRINT_INVOICE_SELECTOR);
            if (!printItem) throw new Error('Print Invoice menu item not found');

            // Tell the print tab (opened next) to auto-trigger the print dialog once it loads.
            try {
                sessionStorage.setItem(AUTO_PRINT_FLAG, '1');
            } catch (e) { /* sessionStorage unavailable, print tab will just need a manual click */ }
            printItem.click();

            toast('Done — the print dialog will open; choose 1 or 2 copies based on payment.');
        } catch (err) {
            console.error('[Teesom Complete & Print]', err);
            toast('Something went wrong: ' + err.message + ' (check console)', true);
        }
    }

    async function runMarkPickedUp() {
        try {
            toast('Marking order Shipped / Picked Up…');
            const statusSelect = document.getElementById(STATUS_SELECT_ID);
            if (!statusSelect) throw new Error('Status dropdown not found');
            statusSelect.value = STATUS_SHIPPED_VALUE;
            fireChange(statusSelect);

            // "Confirm Order Shipped / Picked up" popup - leave "Send Email ?" UNCHECKED, then Save.
            const checkbox = await waitFor(() => {
                const el = document.getElementById(SHIPPED_CHECKBOX_ID);
                return isElVisible(el) ? el : null;
            });
            if (checkbox.checked) {
                checkbox.checked = false;
                fireChange(checkbox);
                checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            }
            await sleep(300);

            const submitBtn = await waitFor(() => {
                const el = document.getElementById(SHIPPED_SUBMIT_ID);
                return isElVisible(el) ? el : null;
            });
            submitBtn.click();

            toast('Order marked Shipped / Picked Up.');
        } catch (err) {
            console.error('[Teesom Mark Picked Up]', err);
            toast('Something went wrong: ' + err.message + ' (check console)', true);
        }
    }

    function currentStatusValue() {
        const el = document.getElementById(STATUS_SELECT_ID);
        return el ? el.value : null;
    }

    if (document.getElementById(STAGE_SELECT_ID)) {
        const completeAndPrintBtn = makeActionButton('COMPLETE & PRINT', () => {
            if (currentStatusValue() === STATUS_COMPLETE_VALUE) {
                runMarkPickedUp();
            } else {
                runCompleteAndPrint();
            }
        });

        // Statuses where there's nothing for this button to do: already
        // Shipped/Picked up, or a quote sitting at Pending/Lost.
        const HIDDEN_STATUS_TEXTS = ['shipped / picked up', 'pending', 'lost'];

        function currentStatusText() {
            const el = document.getElementById(STATUS_SELECT_ID);
            const opt = el && el.selectedOptions && el.selectedOptions[0];
            return opt ? opt.textContent.trim().toLowerCase() : '';
        }

        function refreshActionButtonLabel() {
            const value = currentStatusValue();
            const text = currentStatusText();
            if (value === STATUS_COMPLETE_VALUE) {
                completeAndPrintBtn.style.display = 'inline-block';
                completeAndPrintBtn.textContent = 'PICKING UP';
            } else if (value === STATUS_SHIPPED_VALUE || value === 'voided' || HIDDEN_STATUS_TEXTS.includes(text)) {
                completeAndPrintBtn.style.display = 'none';
            } else {
                completeAndPrintBtn.style.display = 'inline-block';
                completeAndPrintBtn.textContent = 'COMPLETE & PRINT';
            }
        }
        refreshActionButtonLabel();
        setInterval(refreshActionButtonLabel, 1000);

        bar.appendChild(completeAndPrintBtn);
    }

    // ---------------------------------------------------------------
    // 3c. SEND JOBS - Job Board only. Gathers every order row's
    // "Customer View" link, strips the trailing &sview=y, packages
    // them into a form named "teesom_job_board", and shows a review
    // popup before anything is sent.
    //
    // How the link is found: each order row's action menu is
    // <ul class="dropdown-menu dropdown-menu-right" cview="...">   -
    // that "cview" attribute IS the oid used in the Customer View
    // link (https://app.teesom.com/saiw/viewso.asp?oid=<cview>), so
    // the link can be built directly without opening every row's
    // 3-dot menu one at a time.
    // ---------------------------------------------------------------
    if (/\/saiw\/jobboard\.asp/i.test(location.pathname)) {

        // Where the "Confirm & Send" button actually posts the JSON.
        // Leave blank to keep this a review/preview-only tool (the
        // button stays disabled and says so) until you have a real
        // endpoint to send to.
        const JOB_BOARD_SEND_ENDPOINT = 'https://ggh.nacoteds.com/api/orders/import';

        // API token for ggh.nacoteds.com - NOT stored in this file (the file is public on GitHub).
        // Asked for once per computer, then kept in Tampermonkey storage.
        // Change it any time: Tampermonkey icon -> this script -> "Set GG API token".
        function ggApiToken(forceAsk) {
            let t = forceAsk ? '' : GM_getValue('ggh_api_token', '');
            if (!t) {
                t = (window.prompt('One-time setup: paste the GG transfers API token (ask Ross):', '') || '').trim();
                if (t) GM_setValue('ggh_api_token', t);
            }
            return t;
        }
        GM_registerMenuCommand('Set GG API token', () => ggApiToken(true));

        function stripSview(url) {
            return url
                .replace(/([?&])sview=y(&|$)/i, (m, p1, p2) => (p2 === '&' ? p1 : ''))
                .replace(/[?&]$/, '');
        }

        function collectJobBoardLinks() {
            const menus = document.querySelectorAll('ul.dropdown-menu[cview]');
            const jobs = [];
            const seenLinks = new Set();
            menus.forEach((ul) => {
                const cview = ul.getAttribute('cview');
                if (!cview) return;
                const link = stripSview('https://app.teesom.com/saiw/viewso.asp?oid=' + cview);
                if (seenLinks.has(link)) return;
                seenLinks.add(link);

                const row = ul.closest('.jcwtsmjobrdrow');
                const order = row ? (row.querySelector('.row-j-num')?.textContent || '').trim() : '';
                const company = row ? (row.querySelector('.row-j-company:not(.row-j-contact)')?.textContent || '').trim() : '';
                const contact = row ? (row.querySelector('.row-j-contact')?.textContent || '').trim() : '';

                jobs.push({
                    order: order || null,
                    company: company || null,
                    contact: contact || null,
                    link: link
                });
            });
            return jobs;
        }

        function buildJobBoardForm(jobs) {
            const existing = document.getElementById('teesom_job_board');
            if (existing) existing.remove();

            const form = document.createElement('form');
            form.id = 'teesom_job_board';
            form.name = 'teesom_job_board';
            form.method = 'POST';
            form.action = JOB_BOARD_SEND_ENDPOINT || '#';
            form.style.display = 'none';

            jobs.forEach((j) => {
                const inp = document.createElement('input');
                inp.type = 'hidden';
                inp.name = 'urls[]';
                inp.value = j.link;
                form.appendChild(inp);
            });

            document.body.appendChild(form);
            return form;
        }

        function copyText(text, msgEl) {
            try {
                navigator.clipboard.writeText(text).then(
                    () => { msgEl.style.color = '#2e7d32'; msgEl.textContent = 'Copied to clipboard.'; },
                    () => { msgEl.style.color = '#b71c1c'; msgEl.textContent = 'Copy failed - select the text and press Ctrl+C.'; }
                );
            } catch (e) {
                msgEl.style.color = '#b71c1c';
                msgEl.textContent = 'Copy failed - select the text and press Ctrl+C.';
            }
        }

        function openJobBoardSendModal() {
            const jobs = collectJobBoardLinks();

            const existing = document.getElementById('tm-jobboard-send-modal');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'tm-jobboard-send-modal';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
            const panel = document.createElement('div');
            panel.style.cssText = 'background:#fff;width:640px;max-width:95vw;max-height:90vh;overflow:auto;border-radius:6px;padding:18px 20px;box-shadow:0 8px 30px rgba(0,0,0,.4);color:#222;';
            overlay.appendChild(panel);

            const h = document.createElement('div');
            h.textContent = 'Send Jobs — Customer View Links';
            h.style.cssText = 'font-size:18px;font-weight:bold;margin-bottom:4px;';
            panel.appendChild(h);

            const sub = document.createElement('div');
            sub.textContent = jobs.length + ' order(s) found on the current Job Board view (as filtered/sorted right now). Every &sview=y has been removed. Review the list, then Review & Send to see the exact JSON before anything goes out.';
            sub.style.cssText = 'font-size:12px;color:#666;margin-bottom:12px;';
            panel.appendChild(sub);

            const list = document.createElement('div');
            list.style.cssText = 'border:1px solid #ddd;border-radius:4px;max-height:340px;overflow:auto;margin-bottom:10px;';
            jobs.forEach((j, i) => {
                const row = document.createElement('div');
                row.style.cssText = 'padding:8px 10px;font-size:12px;' + (i % 2 ? 'background:#f7f7f7;' : '') + (i ? 'border-top:1px solid #eee;' : '');
                const orderLabel = document.createElement('b');
                orderLabel.textContent = '#' + (j.order || '?');
                row.appendChild(orderLabel);
                row.appendChild(document.createTextNode(' — ' + (j.company || '(no company)') + (j.contact ? ' (' + j.contact + ')' : '')));
                const linkLine = document.createElement('div');
                linkLine.style.cssText = 'color:#555;word-break:break-all;margin-top:2px;';
                linkLine.textContent = j.link;
                row.appendChild(linkLine);
                list.appendChild(row);
            });
            panel.appendChild(list);

            if (jobs.length === 0) {
                const warn = document.createElement('div');
                warn.textContent = 'No Customer View links were found on this page — make sure the Job Board has finished loading, then try again.';
                warn.style.cssText = 'color:#b71c1c;font-size:12px;margin-bottom:10px;';
                panel.appendChild(warn);
            }

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
            const cancel = document.createElement('button');
            cancel.textContent = 'Cancel';
            cancel.style.cssText = 'padding:7px 14px;border:1px solid #bbb;background:#f5f5f5;border-radius:3px;cursor:pointer;';
            const reviewSend = document.createElement('button');
            reviewSend.textContent = 'Review & Send';
            reviewSend.style.cssText = 'padding:7px 14px;border:0;background:#073763;color:#fff;border-radius:3px;cursor:pointer;';
            if (jobs.length === 0) { reviewSend.disabled = true; reviewSend.style.opacity = '.5'; reviewSend.style.cursor = 'not-allowed'; }
            btnRow.appendChild(cancel);
            btnRow.appendChild(reviewSend);
            panel.appendChild(btnRow);

            cancel.addEventListener('click', () => overlay.remove());
            overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay.remove(); });
            reviewSend.addEventListener('click', () => showJobBoardPayloadPreview(panel, overlay, jobs));

            document.body.appendChild(overlay);
        }

        function showJobBoardPayloadPreview(panel, overlay, jobs) {
            buildJobBoardForm(jobs);
            panel.textContent = '';

            const h = document.createElement('div');
            h.textContent = 'Confirm Send — teesom_job_board';
            h.style.cssText = 'font-size:18px;font-weight:bold;margin-bottom:4px;';
            panel.appendChild(h);

            const JOB_BOARD_SEND_ENDPOINT_LOCAL = JOB_BOARD_SEND_ENDPOINT;
            const sub = document.createElement('div');
            sub.textContent = JOB_BOARD_SEND_ENDPOINT_LOCAL
                ? 'This is exactly what will be sent. Nothing has been sent yet.'
                : 'This is what would be sent. Nothing has been sent — no send endpoint is configured yet (set JOB_BOARD_SEND_ENDPOINT in the script).';
            sub.style.cssText = 'font-size:12px;color:#666;margin-bottom:10px;';
            panel.appendChild(sub);

            // Matches the endpoint's expected body exactly: { "urls": [...] }.
            const payload = {
                urls: jobs.map((j) => j.link)
            };

            const ta = document.createElement('textarea');
            ta.value = JSON.stringify(payload, null, 2);
            ta.readOnly = true;
            ta.spellcheck = false;
            ta.style.cssText = 'width:100%;box-sizing:border-box;height:360px;font-family:Consolas,monospace;font-size:12px;padding:8px;border:1px solid #bbb;border-radius:3px;background:#f7f7f7;resize:vertical;';
            panel.appendChild(ta);

            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:12px;margin:8px 0;min-height:16px;color:#2e7d32;';
            panel.appendChild(msg);

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;';
            function mkBtn(label, style) {
                const b = document.createElement('button');
                b.textContent = label;
                b.style.cssText = 'padding:7px 14px;border-radius:3px;cursor:pointer;' + style;
                return b;
            }
            const back = mkBtn('Back to List', 'border:1px solid #bbb;background:#f5f5f5;');
            const copy = mkBtn('Copy JSON', 'border:1px solid #bbb;background:#f5f5f5;');
            const close = mkBtn('Close', 'border:1px solid #bbb;background:#f5f5f5;');
            const confirm = mkBtn(
                JOB_BOARD_SEND_ENDPOINT_LOCAL ? 'Confirm & Send' : 'Confirm & Send (no endpoint set)',
                'border:0;background:#073763;color:#fff;'
            );
            if (!JOB_BOARD_SEND_ENDPOINT_LOCAL) { confirm.disabled = true; confirm.style.opacity = '.5'; confirm.style.cursor = 'not-allowed'; }
            row.appendChild(back);
            row.appendChild(copy);
            row.appendChild(close);
            row.appendChild(confirm);
            panel.appendChild(row);

            back.addEventListener('click', () => { overlay.remove(); openJobBoardSendModal(); });
            copy.addEventListener('click', () => copyText(ta.value, msg));
            close.addEventListener('click', () => overlay.remove());
            confirm.addEventListener('click', function() {
                if (!JOB_BOARD_SEND_ENDPOINT_LOCAL) return;
                msg.style.color = '#2c7be5';
                msg.textContent = 'Sending…';
                confirm.disabled = true;
                // Cross-origin POST (app.teesom.com -> ggh.nacoteds.com) - uses
                // GM_xmlhttpRequest instead of fetch() so it isn't blocked by
                // the page's own CORS policy, same as the transfer stock
                // lookup script's calls to this same host.
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: JOB_BOARD_SEND_ENDPOINT_LOCAL,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + ggApiToken()
                    },
                    data: JSON.stringify(payload),
                    onload: function(response) {
                        confirm.disabled = false;
                        if (response.status >= 200 && response.status < 300) {
                            msg.style.color = '#2e7d32';
                            msg.textContent = 'Sent successfully (HTTP ' + response.status + ').';
                        } else {
                            console.error('[Teesom Send Jobs] HTTP', response.status, response.responseText);
                            msg.style.color = '#b71c1c';
                            msg.textContent = 'Send failed: HTTP ' + response.status + ' (check console)';
                        }
                    },
                    onerror: function(err) {
                        confirm.disabled = false;
                        console.error('[Teesom Send Jobs]', err);
                        msg.style.color = '#b71c1c';
                        msg.textContent = 'Send failed - see console.';
                    }
                });
            });
        }

        const sendJobsBtn = makeBlueActionButton('SEND JOBS', () => openJobBoardSendModal());
        bar.appendChild(sendJobsBtn);
    }

    // ================================================================
    // IMPORT CHIPPLY - Order List page only. Adds a purple IMPORT CHIPPLY
    // button to the bar. Pulls a closed Chipply webstore and builds the
    // Teesom order (jobs, garments, artwork, prices, shipping, payment).
    // ================================================================
    if (/\/saiw\/orderlist\.asp/i.test(location.pathname)) {
    (function () {
  // ---------- SETTINGS YOU MAY WANT TO CHANGE ----------
  const CFG = {
    orderDescPrefix: 'WEBSTORE # ',            // order description = prefix + Chipply sales order number
    embPriceList: 'EMB - 1. FLATS First Location',
    embStitches: 12000,                         // Chipply does not send stitch counts; default 12,000
    embStitchesByLoc: [ { re: /sleeve/i, n: 4000 } ],   // sleeve names etc. default to 4,000
    embColors: 1,
    hpColors: 1,
    // Heat press default size by location (first match wins, tested against the Teesom location name)
    hpSizes: [
      { re: /^Back/i, priceList: 'DTF- 11x11', h: 11, w: 11 },
      { re: /./,      priceList: 'DTF - 4x4',   h: 4,  w: 4 }   // breast, thigh, sleeve, everything else
    ],
    // Chipply process name -> Teesom imprint type (first match wins)
    types: [
      { re: /^\s*EMB/i, type: 'embroidery' },
      // Chipply often still says "screen printing" (SCR) for what you actually heat press, so SCR -> heat press
      { re: /^\s*(HP|DTF|HEAT|SCR|SCREEN)/i, type: 'heatpressing' }
    ],
    // Pricing
    importPrices: true,          // copy Chipply garment / decoration / option / shipping prices onto the Teesom order
    keepDigitizing: false,       // Teesom auto-adds a $75 DIGI line on NEW embroidery; false = set it to $0
    zeroVendorShip: true,        // Teesom auto-adds a "Vender Ship" line; set to $0 so totals match Chipply
    paymentCharge: /CHIPPLY PAY/i, // negative line that subtracts what the customer already paid in Chipply
    chargesJobName: 'SHIPPING & PAYMENTS',   // shipping + Chipply payment go in their own job at the bottom (set '' to put them in job 1)
    shippingCharge: /SHIP-C/i,   // which predefined Teesom "other charge" carries Chipply's shipping
    // Reorders: a Teesom design number (like EMB-ABC123-16882) typed anywhere in the Chipply process/art name,
    // description or production notes is LINKED (Link Existing Imprint) instead of creating new artwork.
    designRe: /\b[A-Z]{3}-[A-Z0-9]+-\d+\b/,
    rememberArt: true,           // also remember "Chipply art name -> Teesom design" per customer for future stores
    // Chipply sales rep -> Teesom rep is matched on the beginning of the name ("Erin P" -> "Erin Perry")
    // Chipply process name -> Teesom imprint location (first match wins)
    locations: [
      { re: /left thigh/i, loc: 'Thigh - Left' },
      { re: /right thigh/i, loc: 'Thigh - Right' },
      { re: /left (chest|breast)/i, loc: 'Breast - Left' },
      { re: /right (chest|breast)/i, loc: 'Breast - Right' },
      { re: /full back|back/i, loc: 'Back - Full' },
      { re: /left sleeve/i, loc: 'Sleeve - Left' },
      { re: /right sleeve/i, loc: 'Sleeve - Right' },
      { re: /hat|cap/i, loc: 'Hat - Front' }
    ],
    defaultLoc: 'Custom - See Notes'
  };
  // -----------------------------------------------------

  const W = unsafeWindow;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- Teesom helpers ----
  // Teesom's adm_getdata.asp only works through the page's own jQuery (it has a global request hook),
  // so every Teesom call goes through unsafeWindow.jQuery. The body is passed as a plain string.
  function tpost(url, data) {
    return new Promise((resolve, reject) => {
      W.jQuery.ajax({
        url, type: 'POST', dataType: 'text',
        data: new URLSearchParams(data).toString(),
        success: t => resolve(t),
        error: x => reject(new Error('Teesom request failed (' + x.status + ') ' + (data.ajxaction || url)))
      });
    });
  }
  // build a plain object inside the page's own JS world (safe to hand to Teesom's APIBasicPost)
  function pageObj(o) { const p = new W.Object(); Object.keys(o).forEach(k => { p[k] = o[k]; }); return p; }
  const adm = d => tpost('adm_getdata.asp', d);
  const itemApi = async d => JSON.parse(await tpost('apc/catalogs/item_load.ashx', d));

  // ---- Chipply (cross-site, uses your logged-in Chipply session) ----
  function getChipply(storeId) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://manage.chipply.com/api/Reports/WorkOrderPage',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ storeId: Number(storeId), catalogBatchId: 0, selectedProcesses: null, toggleOptions: null, colorSizesByProcess: {} }),
        withCredentials: true,
        onload: r => {
          if (r.status !== 200) return reject(new Error('Chipply answered ' + r.status + '. Are you logged in at manage.chipply.com?'));
          try {
            let j = JSON.parse(r.responseText);
            if (typeof j === 'string') j = JSON.parse(j);
            if (!j.report || !j.report.processes) throw new Error('no report');
            resolve(j);
          } catch (e) { reject(new Error('Chipply did not return a work order. Check the store number and that you are logged in.')); }
        },
        onerror: () => reject(new Error('Could not reach Chipply.'))
      });
    });
  }

  function parseStore(j) {
    const st = j.staticTop || {};
    const ot = ((j.accountingSummary || {}).totals || {}).orderTotals || {};
    return {
      name: st.name, saleOrder: st.saleOrder, customer: st.customerName, rep: st.salesPersonName, due: st.dueDate,
      shipping: Number(ot.shipping) || 0, tax: Number(ot.tax) || 0, itemsTotal: Number(ot.itemsTotal) || 0, collected: Number(ot.subTotal) || 0,
      processes: j.report.processes.map(p => {
        const pis = ((p.product.components || {}).processItems) || [];
        const arts = pis.filter(x => !x.isOption), opts = pis.filter(x => x.isOption);
        // Chipply lists size upcharges (2XL/3XL...) separately: style + size + extra per piece
        const sizeAdd = {};
        (p.product.sizeCharges || []).forEach(sc => { sizeAdd[String(sc.productStyle).toUpperCase() + '|' + String(sc.sizeName).toUpperCase().replace(/\s/g, '')] = Number(sc.additionalPrice) || 0; });
        const notes = [p.processName, p.processDescription, p.processProductionNote, p.jobProductionNote, p.storeProductionNote]
          .concat(pis.map(x => x.typeCode), pis.map(x => x.name), pis.map(x => x.notes)).filter(Boolean).join(' | ');
        return {
          name: String(p.processName || '').trim(),
          due: p.dueDate,
          notes,
          artName: arts.length ? String(arts[0].name || '').trim() : '',
          artTotal: arts.reduce((a, x) => a + (Number(x.total) || 0), 0),
          optTotal: opts.reduce((a, x) => a + (Number(x.total) || 0), 0),
          optNames: opts.map(x => String(x.name || '').trim()),
          items: p.product.vendors.flatMap(v => v.lineItems.map(li => ({
            style: v.styleName,
            color: li.colorName,
            sizes: li.sizes.filter(s => s.qty > 0).map(s => [s.size, s.qty]),
            prices: li.sizes.filter(s => s.qty > 0).map(s => [s.size, (Number(s.sizePrice) || 0) + (Number(s.itemAdditionalSizeCost) || 0) + (sizeAdd[String(v.styleName).toUpperCase() + '|' + String(s.size).toUpperCase().replace(/\s/g, '')] || 0)])
          }))).filter(i => i.sizes.length)
        };
      })
    };
  }

  // ---- Teesom: customers ----
  async function searchCustomers(q) {
    const html = await adm({ ajxaction: 'selectcustomercontact', srep: 'y', strs: q });
    const d = document.createElement('div'); d.innerHTML = html;
    const orderid = (d.querySelector('#hidden-order-id') || {}).getAttribute ? d.querySelector('#hidden-order-id').getAttribute('dbid') : null;
    const groups = {};
    d.querySelectorAll('[cmpid][ciname]').forEach(e => {
      const id = e.getAttribute('cmpid');
      (groups[id] = groups[id] || { compid: id, name: e.getAttribute('cmpnme'), contacts: [] })
        .contacts.push({ contid: e.getAttribute('dbid'), name: e.getAttribute('ciname') });
    });
    return { orderid, customers: Object.values(groups) };
  }

  // ---- Teesom: jobs / items / imprints ----
  const prodCache = {};
  async function loadStyle(style) {
    if (prodCache[style]) return prodCache[style];
    const res = await itemApi({ ajxaction: 'load-item-swap-items-search', search: style, catalogid: '' });
    const up = String(style).toUpperCase();
    const p = res.find(r => String(r.code).toUpperCase() === up && /sanmar/i.test(r.catalogname)) || res.find(r => String(r.code).toUpperCase() === up);
    if (!p) return (prodCache[style] = { err: 'style not found in Teesom' });
    const det = await itemApi({ ajxaction: 'load-detail-item', dbid: p.link, basicsonly: true });
    return (prodCache[style] = { det });
  }
  const normColor = s => String(s || '').replace(/\s+-\s+[A-Za-z0-9]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const SZ = { '2XL': 'XXL', '3XL': 'XXXL', '4XL': 'XXXXL' };
  const normSize = s => { s = String(s).toUpperCase().replace(/\s/g, ''); return SZ[s] || s; };

  async function addItem(orderid, jobid, it) {
    const c = await loadStyle(it.style);
    if (c.err) return { ok: false, why: c.err };
    const det = c.det, want = normColor(it.color);
    const col = det.items.find(i => normColor(i.color) === want) ||
                det.items.find(i => normColor(i.color).includes(want) || want.includes(normColor(i.color)));
    if (!col) return { ok: false, why: 'color "' + it.color + '" not found (Teesom has: ' + det.items.map(i => i.color).join(', ') + ')' };
    let sku = ''; const miss = [];
    for (const [sz, q] of it.sizes) {
      const s = col.sizes.find(x => normSize(x.size) === normSize(sz));
      if (!s) { miss.push(sz); continue; }
      sku += s.link + ';' + q + '|';
    }
    if (!sku) return { ok: false, why: 'size ' + miss.join(',') + ' not offered for that color' };
    await adm({ ajxaction: 'oeaddmodalselectproduct', orderid, jobid, masterid: det.link, addas: 'false', skustr: sku });
    return { ok: true, miss };
  }

  async function jobIds(orderid) {
    const html = await adm({ ajxaction: 'getorderdetail', orderlink: orderid, screen_width: 1920, screen_height: 1040 });
    const d = document.createElement('div'); d.innerHTML = html;
    return [...d.querySelectorAll('.jcwtblheaderrow_orderentry[dbid]')].map(e => e.getAttribute('dbid'));
  }
  const addJob = (orderid, name) => adm({ ajxaction: 'oenewjob', srep: 'y', oev: name, oel: orderid });

  // ---- Teesom: order rows, prices, rep, charges ----
  const num = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
  const r2 = n => Math.round(n * 100) / 100;
  async function orderRows(orderid) {
    const html = await adm({ ajxaction: 'getorderdetail', orderlink: orderid, screen_width: 1920, screen_height: 1040 });
    const d = document.createElement('div'); d.innerHTML = html;
    const out = []; let job = -1;
    d.querySelectorAll('.jcwtblheaderrow_orderentry[dbid], .order-detail-row').forEach(e => {
      if (e.classList.contains('jcwtblheaderrow_orderentry')) { job++; return; }
      const c = e.querySelector('.jcwcol[dbid]'); if (!c) return;
      out.push({ job, group: c.getAttribute('jgroup'), dbid: c.getAttribute('dbid'), text: e.textContent.replace(/\s+/g, ' ').trim() });
    });
    return out;
  }
  async function setPrice(orderid, row, retail) {
    const q = JSON.parse(await adm({ ajxaction: 'loadorderdetailrowquickamounts', dbid: row.dbid, ord: orderid }));
    await adm({
      ajxaction: 'ordrowdetailupdate', costprice: q.projectedcost, retailprice: r2(retail).toFixed(2), qty: q.qty, syncqty: q.syncqty,
      lockretail: 'y', lockcost: 'n', dbid: row.dbid, version: String(q.version == null ? 0 : q.version), ord: orderid
    });
    return q;
  }
  async function quick(orderid, row) { return JSON.parse(await adm({ ajxaction: 'loadorderdetailrowquickamounts', dbid: row.dbid, ord: orderid })); }

  async function setSalesRep(orderid, chipplyRep) {
    if (!chipplyRep) return 'no rep on the Chipply store';
    const html = await new Promise((res, rej) => W.jQuery.ajax({ url: 'orderentry.asp?oid=' + orderid, type: 'GET', dataType: 'text', success: res, error: x => rej(new Error('could not open new order (' + x.status + ')')) }));
    const d = document.createElement('div'); d.innerHTML = html;
    const want = String(chipplyRep).trim().toLowerCase();
    const opts = [...d.querySelectorAll('#salesrepchange option')].map(o => ({ v: o.value, t: o.textContent.trim() }));
    let m = opts.filter(o => o.t.toLowerCase().startsWith(want));
    if (m.length !== 1) { const first = want.split(/\s+/)[0]; m = opts.filter(o => o.t.toLowerCase().split(/\s+/)[0] === first); if (m.length > 1) m = m.filter(o => o.t.toLowerCase().startsWith(want)); }
    if (m.length !== 1) return 'sales rep "' + chipplyRep + '" not matched to a Teesom rep (' + opts.map(o => o.t).join(', ') + ')';
    await adm({ ajxaction: 'oeaddmodalaaupdtqqsred', orderid, ordis: m[0].v });
    return '';
  }

  async function addOtherCharge(orderid, jobid, re) {
    const html = await adm({ ajxaction: 'loadthercharge' });
    const d = document.createElement('div'); d.innerHTML = html;
    const row = [...d.querySelectorAll('.jcworderaddchargerow')].find(r => re.test(r.textContent));
    const b = row && row.querySelector('[dbid]');
    if (!b) return false;
    await adm({ ajxaction: 'addaddchrgtoord', odbid: orderid, dbid: '', jdbid: jobid, ztype: 'othercharge', addselected: b.getAttribute('dbid') + '#+.B.+#' });
    return true;
  }

  // ---- Reorders: link an existing Teesom imprint instead of creating new artwork ----
  async function linkImprint(orderid, jobid, compid, dn) {
    const html = await adm({ ajxaction: 'loadimprint', order_id: orderid, customer_id: compid, job_id: jobid, search_val: dn });
    const d = document.createElement('div'); d.innerHTML = html;
    const hits = [...d.querySelectorAll('.imprint_select_body[dbid]')].filter(e => e.textContent.toUpperCase().includes(dn.toUpperCase()));
    if (hits.length !== 1) return { ok: false, why: hits.length ? 'several imprints match ' + dn : 'design ' + dn + ' not found for this customer' };
    await adm({ ajxaction: 'addimptoord', basicinfostickyordernumber: orderid, orderentrycompanyname: compid, implfnj: jobid, inpatitmj: hits[0].getAttribute('dbid') });
    return { ok: true, dn };
  }

  async function addImprint(orderid, jobid, compid, proc) {
    const memKey = 'art_' + compid + '_' + String(proc.artName || proc.name).toLowerCase().replace(/[^a-z0-9]/g, '');
    const typed = (proc.notes.match(CFG.designRe) || [])[0];
    const remembered = CFG.rememberArt ? GM_getValue(memKey, '') : '';
    for (const dn of [typed, remembered].filter(Boolean)) {
      const l = await linkImprint(orderid, jobid, compid, dn);
      if (l.ok) return { ok: true, dn, linked: true };
    }
    const t = CFG.types.find(x => x.re.test(proc.name));
    if (!t) return { ok: false, why: 'no imprint rule for "' + proc.name + '" - add it by hand' };
    const locName = (CFG.locations.find(x => x.re.test(proc.name)) || { loc: CFG.defaultLoc }).loc;
    const boot = JSON.parse(await W.APIBasicPost('Art/Options/Bootstrap')).response;
    const loc = boot.locations.find(l => l.description.trim() === locName);
    const hpS = CFG.hpSizes.find(x => x.re.test(locName));
    const plWant = t.type === 'embroidery' ? CFG.embPriceList : hpS.priceList;
    const pl = (boot.priceListsByType[t.type] || []).find(p => p.code.startsWith(plWant));
    if (!loc || !pl) return { ok: false, why: 'location or price list not found (' + locName + ' / ' + plWant + ')' };
    const dn = JSON.parse(await W.APIBasicPost('Art/NextDesignNumber', pageObj({ customer: compid, imprinttype: t.type }))).response.designnumber;
    const emb = t.type === 'embroidery';
    const h = emb ? 0 : hpS.h, w = emb ? 0 : hpS.w;
    const r = JSON.parse(await W.APIBasicPost('Art/Create', pageObj({
      customer: compid, designnumber: dn, description: proc.name, imprinttype: t.type,
      imprintlocation: loc.link, othlocation: '', priceengine: pl.link,
      colors: String(emb ? CFG.embColors : CFG.hpColors), stitchcount: String(emb ? ((CFG.embStitchesByLoc.find(x => x.re.test(locName)) || { n: CFG.embStitches }).n) : 0),
      height: String(h), width: String(w), heightXwidth: String(h * w), comment: '',
      impwhere: 'order', orderid, jobid
    })));
    if (r.success && CFG.rememberArt) GM_setValue(memKey, dn);
    return { ok: !!r.success, dn, why: r.success ? '' : JSON.stringify(r.errors) };
  }

  // ---- The whole import ----
  async function applyPrices(orderid, store, made, log, problems) {
    log('Copying Chipply prices...');
    const rows = await orderRows(orderid);
    for (let i = 0; i < store.processes.length; i++) {
      const p = store.processes[i], mine = rows.filter(r => r.job === i);
      // garments: match by style / color / size
      const pm = {};
      p.items.forEach(it => it.prices.forEach(([sz, pr]) => { pm[[it.style, normColor(it.color), normSize(sz)].join('|').toUpperCase()] = pr; }));
      const gRows = [];
      for (const r of mine.filter(r => r.group === 'products')) {
        const q = await quick(orderid, r);
        const key = [q.code, normColor(q.color), normSize(q.size)].join('|').toUpperCase();
        if (!(key in pm)) { problems.push(p.name + ': no Chipply price for ' + q.code + ' ' + q.color + ' ' + q.size); continue; }
        await setPrice(orderid, r, pm[key]); gRows.push({ r, qty: q.qty, price: pm[key] });
      }
      // decoration: art + options per piece, on the imprint row we created / linked
      const dn = made[i] && made[i].dn;
      const pieces = p.items.reduce((a, it) => a + it.sizes.reduce((x, s) => x + s[1], 0), 0);
      const imps = mine.filter(r => r.group === 'imprints' && !/^DIGI\b/i.test(r.text));
      const imp = (dn && imps.find(r => r.text.toUpperCase().includes(dn.toUpperCase()))) || (imps.length === 1 ? imps[0] : null);
      if (imp && pieces) {
        const per = (p.artTotal + p.optTotal) / pieces;
        await setPrice(orderid, imp, per);
        const diff = r2((p.artTotal + p.optTotal) - r2(per) * pieces);
        if (Math.abs(diff) > 0.005) {   // put leftover pennies on a single-piece garment line so the job total matches Chipply exactly
          const one = gRows.find(g => g.qty === 1);
          if (one) { await setPrice(orderid, one.r, one.price + diff); log('  ' + p.name + ': penny rounding ' + diff.toFixed(2) + ' moved to one garment line'); }
          else problems.push(p.name + ': decoration rounds to ' + r2(r2(per) * pieces) + ' vs Chipply ' + r2(p.artTotal + p.optTotal));
        }
        if (p.optTotal) log('  ' + p.name + ': options (' + p.optNames.join(', ') + ') folded into the decoration price');
      } else if (pieces) problems.push(p.name + ': could not find the imprint row to price');
      if (!CFG.keepDigitizing) for (const r of mine.filter(r => /^DIGI\b/i.test(r.text))) await setPrice(orderid, r, 0);
    }
  }

  async function runImport(store, pick, log) {
    const orderDesc = CFG.orderDescPrefix + store.saleOrder;
    log('Creating order "' + orderDesc + '" for ' + pick.custName + ' / ' + pick.contName + '...');
    const created = JSON.parse(await adm({
      ajxaction: 'createneworder', compid: pick.compid, contid: pick.contid, orderid: pick.orderid,
      orderdescription: orderDesc, jobdescription: store.processes[0].name, customerpo: ''
    }));
    if (!created.success) throw new Error('Teesom did not create the order.');
    const orderid = pick.orderid;
    const problems = [], made = [];
    try { const m = await setSalesRep(orderid, store.rep); if (m) problems.push(m); else log('Sales rep set from Chipply (' + store.rep + ')'); }
    catch (e) { problems.push('sales rep: ' + e.message); }
    let firstJob = '';
    for (let i = 0; i < store.processes.length; i++) {
      const p = store.processes[i];
      log('Job ' + (i + 1) + ': ' + p.name);
      if (i > 0) await addJob(orderid, p.name);
      const ids = await jobIds(orderid);
      const jobid = ids[i];
      if (i === 0) firstJob = jobid;
      if (!jobid) { problems.push('Could not find job for ' + p.name); continue; }
      for (const it of p.items) {
        const r = await addItem(orderid, jobid, it);
        if (!r.ok) problems.push(p.name + ': ' + it.style + ' ' + it.color + ' - ' + r.why);
        else if (r.miss.length) problems.push(p.name + ': ' + it.style + ' ' + it.color + ' - sizes not added: ' + r.miss.join(','));
      }
      const im = await addImprint(orderid, jobid, pick.compid, p);
      made[i] = im;
      if (!im.ok) problems.push(p.name + ': imprint - ' + im.why);
      else log('  imprint ' + im.dn + (im.linked ? ' LINKED (existing art)' : ' created'));
    }
    let chargesJob = firstJob;
    if (CFG.importPrices && CFG.chargesJobName && (store.shipping > 0 || store.collected > 0)) {
      try {
        log('Job ' + (store.processes.length + 1) + ': ' + CFG.chargesJobName);
        await addJob(orderid, CFG.chargesJobName);
        const ids = await jobIds(orderid);
        chargesJob = ids[store.processes.length] || firstJob;
      } catch (e) { problems.push('could not add the charges job: ' + e.message); }
    }
    if (CFG.importPrices) {
      try {
        if (store.shipping > 0 && chargesJob) {
          if (await addOtherCharge(orderid, chargesJob, CFG.shippingCharge)) {
            const rows = await orderRows(orderid);
            const sh = rows.filter(r => /^(othercharge|additionalcharges)$/.test(r.group) && CFG.shippingCharge.test(r.text)).pop();
            if (sh) { await setPrice(orderid, sh, store.shipping); log('Shipping charge $' + store.shipping.toFixed(2) + ' added'); } else problems.push('shipping line added but not found to price it')
          } else problems.push('shipping: no Teesom other-charge matched ' + CFG.shippingCharge);
        }
        await applyPrices(orderid, store, made, log, problems);
        if (store.collected > 0 && chargesJob) {
          if (await addOtherCharge(orderid, chargesJob, CFG.paymentCharge)) {
            const pr = (await orderRows(orderid)).filter(r => /^(othercharge|additionalcharges)$/.test(r.group) && CFG.paymentCharge.test(r.text)).pop();
            if (pr) { await setPrice(orderid, pr, -store.collected); log('Chipply payment -$' + store.collected.toFixed(2) + ' added'); } else problems.push('payment line added but not found to price it')
          } else problems.push('payment: Teesom charge "CHIPPLY PAY" not found');
        }
        if (CFG.zeroVendorShip) {
          for (const r of (await orderRows(orderid)).filter(r => /^(othercharge|additionalcharges)$/.test(r.group) && /vend[oe]r ship/i.test(r.text))) await setPrice(orderid, r, 0);
        }
      } catch (e) { problems.push('pricing stopped: ' + e.message); }
    }
    return { orderid, problems };
  }

  // ---- UI ----
  function css() {
    const s = document.createElement('style');
    s.textContent = `
    #cip-btn{position:fixed;right:14px;bottom:14px;z-index:99998;background:#073763;color:#fff;border:0;border-radius:6px;padding:10px 14px;font:600 13px Arial;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}
    #cip-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center}
    #cip-box{background:#fff;width:640px;max-width:94vw;max-height:88vh;overflow:auto;border-radius:8px;padding:18px;font:13px Arial;color:#222}
    #cip-box h3{margin:0 0 10px} #cip-box input[type=text]{padding:6px;border:1px solid #bbb;border-radius:4px;width:200px}
    #cip-box button{padding:7px 12px;border:0;border-radius:4px;background:#073763;color:#fff;cursor:pointer;margin:4px 4px 4px 0}
    #cip-box button.sec{background:#888} #cip-box button:disabled{opacity:.5;cursor:default}
    #cip-box .row{margin:8px 0} #cip-box table{border-collapse:collapse;width:100%} #cip-box td,#cip-box th{border-bottom:1px solid #eee;padding:4px 6px;text-align:left}
    #cip-log{background:#f6f6f6;padding:8px;border-radius:4px;max-height:200px;overflow:auto;white-space:pre-wrap;font:12px monospace;margin-top:8px}
    #cip-box .warn{color:#a15c00} #cip-box .bad{color:#b00020} #cip-box .cust{border:1px solid #ddd;border-radius:4px;padding:6px;margin:6px 0}`;
    document.head.appendChild(s);
  }

  function openDialog() {
    const ov = document.createElement('div'); ov.id = 'cip-ov';
    ov.innerHTML = '<div id="cip-box"></div>';
    document.body.appendChild(ov);
    const box = ov.querySelector('#cip-box');
    const close = () => ov.remove();
    let store = null, found = null, pick = null;

    const step1 = () => {
      box.innerHTML = '<h3>Import Chipply Store</h3><div class="row">Chipply store / sales order number: <input type="text" id="cip-num" placeholder="e.g. 628932"> <button id="cip-go">Load</button> <button class="sec" id="cip-x">Close</button></div><div id="cip-msg"></div>';
      box.querySelector('#cip-x').onclick = close;
      box.querySelector('#cip-go').onclick = async () => {
        const n = box.querySelector('#cip-num').value.trim();
        const msg = box.querySelector('#cip-msg');
        if (!/^\d+$/.test(n)) { msg.innerHTML = '<span class="bad">Enter the numeric store number.</span>'; return; }
        msg.textContent = 'Loading from Chipply...';
        try { store = parseStore(await getChipply(n)); step2(); }
        catch (e) { msg.innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; }
      };
    };

    const step2 = () => {
      const done = GM_getValue('imported_' + store.saleOrder, '');
      const rows = store.processes.map(p => '<tr><td>' + esc(p.name) + '</td><td>' + p.items.length + ' lines</td><td>' + p.items.reduce((a, i) => a + i.sizes.reduce((x, s) => x + s[1], 0), 0) + ' pcs</td></tr>').join('');
      box.innerHTML = '<h3>' + esc(store.name) + ' &nbsp;<small>#' + esc(store.saleOrder) + '</small></h3>' +
        '<div class="row">Chipply customer: <b>' + esc(store.customer) + '</b> &middot; Rep: ' + esc(store.rep) + '</div>' +
        (done ? '<div class="row warn">This store was already imported on ' + esc(done) + '. Importing again will create a second order.</div>' : '') +
        '<table><tr><th>Process (becomes a Job)</th><th>Lines</th><th>Pieces</th></tr>' + rows + '</table>' +
        '<div class="row">Find Teesom customer: <input type="text" id="cip-cq" value="' + esc(store.customer) + '"> <button id="cip-cs">Search</button></div>' +
        '<div id="cip-cres"></div><div class="row"><button class="sec" id="cip-back">Back</button> <button class="sec" id="cip-x">Close</button></div>';
      box.querySelector('#cip-x').onclick = close;
      box.querySelector('#cip-back').onclick = step1;
      const search = async () => {
        const res = box.querySelector('#cip-cres'); res.textContent = 'Searching...';
        found = await searchCustomers(box.querySelector('#cip-cq').value.trim());
        if (!found.customers.length) { res.innerHTML = '<span class="warn">No Teesom customers found. Try a shorter name.</span>'; return; }
        res.innerHTML = found.customers.map((c, ci) => '<div class="cust"><b>' + esc(c.name) + '</b><br>' +
          c.contacts.map((k, ki) => '<button data-c="' + ci + '" data-k="' + ki + '">' + esc(k.name) + '</button>').join('') + '</div>').join('') +
          '<div class="row">Click the contact to create the order under that customer.</div>';
        res.querySelectorAll('button[data-c]').forEach(b => b.onclick = () => {
          const c = found.customers[+b.dataset.c], k = c.contacts[+b.dataset.k];
          pick = { compid: c.compid, contid: k.contid, custName: c.name, contName: k.name, orderid: found.orderid };
          step3();
        });
      };
      box.querySelector('#cip-cs').onclick = search;
      search();
    };

    const step3 = () => {
      box.innerHTML = '<h3>Create order</h3><div class="row">Customer: <b>' + esc(pick.custName) + '</b> (' + esc(pick.contName) + ')<br>Description: <b>' + esc(CFG.orderDescPrefix + store.saleOrder) + '</b><br>Jobs: ' + store.processes.length + ' (one per Chipply process)</div>' +
        '<button id="cip-run">Create in Teesom</button> <button class="sec" id="cip-back">Back</button> <button class="sec" id="cip-x">Close</button><div id="cip-log"></div>';
      box.querySelector('#cip-x').onclick = close;
      box.querySelector('#cip-back').onclick = step2;
      const logEl = box.querySelector('#cip-log');
      const log = m => { logEl.textContent += m + '\n'; logEl.scrollTop = logEl.scrollHeight; };
      box.querySelector('#cip-run').onclick = async function () {
        this.disabled = true; box.querySelector('#cip-back').disabled = true;
        try {
          const r = await runImport(store, pick, log);
          GM_setValue('imported_' + store.saleOrder, new Date().toLocaleString());
          log('\nDone.');
          if (r.problems.length) log('\nNEEDS A LOOK:\n - ' + r.problems.join('\n - '));
          else log('No problems reported.');
          log('\nChipply: items $' + store.itemsTotal.toFixed(2) + ' + shipping $' + store.shipping.toFixed(2) + ' + tax $' + store.tax.toFixed(2) + '. Compare with the Teesom order total (Teesom adds its own $75 DIGI on new embroidery).');
          log('Stitch counts are defaults (12,000; sleeves 4,000); check the imprints.');
          const a = document.createElement('a'); a.href = 'orderentry.asp?oid=' + r.orderid; a.textContent = 'Open the new order';
          a.style.cssText = 'display:inline-block;margin-top:8px;font-weight:bold'; box.appendChild(a);
        } catch (e) { log('\nSTOPPED: ' + e.message + '\nCheck Teesom for a partly built order before retrying.'); }
      };
    };
    step1();
  }


  css();
  const importBtn = makeActionButton('IMPORT CHIPPLY', openDialog);
  importBtn.style.backgroundColor = '#073763';
  importBtn.style.border = '1px solid #062f54';
  importBtn.onmouseover = () => importBtn.style.backgroundColor = '#062f54';
  importBtn.onmouseout = () => importBtn.style.backgroundColor = '#073763';
  bar.appendChild(importBtn);
    })();
    }

    // ================================================================
    // TIDY CALENDAR - Calendar page only. Moves every job sitting on a
    // past date onto today, then color-sorts every visible day, then
    // reloads to verify what the server saved (redoing anything still
    // wrong, up to 3 passes). Works by simulating the calendar's own
    // drag-and-drop, the same way you'd drag the jobs by hand.
    // ================================================================
    if (/\/saiw\/calendar\.asp/i.test(location.pathname)) {
    (function () {
        // ---------- SETTINGS ----------
        // Color rank: lower = further left. Colors not listed keep their order, at the end.
        const CAL_RANK = {
            '#f85db8': 1, '#a30078': 2, '#640240': 3, '#4a4a4a': 4, '#808080': 5,
            '#eb6a00': 7, '#1a891c': 8, '#0b513c': 10, '#074633': 11, '#1a897c': 12,
            '#639334': 13, '#d00101': 17
        };
        const CAL_FAST_MODE = true;       // true = save the new order straight to Teesom (seconds); false = drag every job (minutes)
        const CAL_AUTO_RUN_DAILY = false; // true = run by itself the first time the calendar opens each day
        const CAL_MOVE_DELAY = 3000;      // ms between cross-day moves (lets the server save)
        const CAL_SORT_DELAY = 1600;      // ms between same-day reorders
        const CAL_MAX_SORT_ITERS = 80;    // per day, per pass
        const CAL_MAX_VERIFY = 3;         // reload + re-check rounds
        const CAL_VERIFY_KEY = 'tm-cal-tidy-verify-pass';
        const CAL_LASTRUN_KEY = 'tm-cal-tidy-last-run';
        // ------------------------------

        const W = unsafeWindow;
        let running = false;

        // While tidying ONLY: let each day cell grow taller to fit all its jobs so every
        // job can be "dropped" on. Width stays locked (overflow-x hidden + min-width 0)
        // so long job names still cut off instead of pushing columns off screen.
        // Removed again as soon as the run finishes, so the calendar looks normal.
        function addExpandCss() {
            if (document.getElementById('__ross_calendar_expand')) return;
            const st = document.createElement('style');
            st.id = '__ross_calendar_expand';
            st.textContent = '.calendarday.dragcontainer { height:auto !important; max-height:none !important; ' +
                'overflow-x:hidden !important; overflow-y:visible !important; min-width:0 !important; }';
            document.head.appendChild(st);
        }
        function removeExpandCss() {
            const st = document.getElementById('__ross_calendar_expand');
            if (st) st.remove();
        }

        function calToday() {
            const d = new Date();
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }
        const itemsOf = (day) => Array.from(day.querySelectorAll(':scope > .calendardayitem'));
        const numOf = (el) => ((el.querySelector('.td-detail') || {}).textContent || el.id).trim();
        function rankOf(el) {
            const m = (el.getAttribute('style') || '').match(/background-color:\s*(#[0-9a-fA-F]{6})/);
            return (m && CAL_RANK[m[1].toLowerCase()]) || 999;
        }

        // Simulated drag. fracY ~0.2 = drop just before the target job, ~0.8 = just after.
        function simulateDrag(sourceEl, targetEl, fracY) {
            targetEl.scrollIntoView({ block: 'center' });
            const s = sourceEl.getBoundingClientRect();
            const t = targetEl.getBoundingClientRect();
            const sx = s.left + s.width / 2, sy = s.top + s.height / 2;
            const tx = t.left + t.width / 2, ty = t.top + t.height * fracY;
            const dt = new W.DataTransfer();
            const fire = (type, el, x, y) => {
                const ev = new W.DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt });
                el.dispatchEvent(ev);
                return ev;
            };
            fire('dragstart', sourceEl, sx, sy);
            const hit = document.elementFromPoint(tx, ty);
            const overEl = (hit && (hit.closest('.calendardayitem') || hit.closest('.calendarday.dragcontainer'))) || targetEl;
            fire('dragenter', overEl, tx, ty);
            fire('dragover', overEl, tx, ty);
            fire('dragover', overEl, tx, ty);
            fire('drop', overEl, tx, ty);
            fire('dragend', sourceEl, tx, ty);
        }

        // ---- progress panel (bottom-left, only shows while running / after a run) ----
        let panel, logEl;
        function calLog(msg) {
            console.log('[Tidy Calendar]', msg);
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'tm-cal-tidy-panel';
                panel.className = 'DoNotPrint';
                panel.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:999999;background:#fff;color:#222;' +
                    'border:1px solid #bbb;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.25);font:12px/1.4 Arial,sans-serif;' +
                    'width:300px;padding:10px;';
                panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
                    '<b>Tidy Calendar</b><span id="tm-cal-tidy-x" style="cursor:pointer;padding:0 4px" title="Close">✕</span></div>' +
                    '<div id="tm-cal-tidy-log" style="max-height:180px;overflow:auto;white-space:pre-wrap;font:11px/1.35 Consolas,monospace"></div>';
                document.body.appendChild(panel);
                logEl = panel.querySelector('#tm-cal-tidy-log');
                panel.querySelector('#tm-cal-tidy-x').onclick = () => { if (!running) { panel.remove(); panel = null; } };
            }
            logEl.textContent += msg + '\n';
            logEl.scrollTop = logEl.scrollHeight;
        }

        // ---- FAST MODE: save straight to Teesom, no dragging ----
        // Sends the exact same save request the calendar itself sends at the end of a
        // drag (ajxaction=updatecalendaritemschedule, "position" = slot to drop into,
        // counting the day's header as slot 0, "adjustment" -0.1 = drop in front of
        // whatever's in that slot). Goes through the page's own jQuery like IMPORT CHIPPLY.
        // Only used on the first pass; the reload check afterwards falls back to
        // dragging for anything that didn't stick.
        function directSave(el, dateFrom, dateTo, position, adjustment) {
            const body = new URLSearchParams({
                ajxaction: 'updatecalendaritemschedule', dbid: el.getAttribute('dbid'),
                dateto: dateTo, datefrom: dateFrom, type: el.getAttribute('tpe'),
                adjustment: String(adjustment), position: String(position)
            }).toString();
            return new Promise((resolve) => {
                W.jQuery.ajax({ url: 'adm_getdata.asp', type: 'POST', dataType: 'text', data: body,
                    success: () => resolve(true), error: (x) => { calLog('  save failed (HTTP ' + x.status + ')'); resolve(false); } });
            });
        }

        async function fastMovePastJobs(today) {
            const todayCell = document.getElementById('d_' + today);
            if (!todayCell) return { moved: 0, ok: true };
            const pastCells = Array.from(document.querySelectorAll('.calendarday.dragcontainer'))
                .filter((c) => c.id.slice(2) < today && itemsOf(c).length);
            let moved = 0;
            for (const cell of pastCells) {
                const dt = cell.id.slice(2);
                calLog('Fast-moving ' + itemsOf(cell).length + ' job(s) from ' + dt + '…');
                for (const el of itemsOf(cell)) {
                    const n = itemsOf(todayCell).length;
                    // drop after today's last job (slot n+1), or into an empty day (slot 1, no adjustment)
                    if (!(await directSave(el, dt, today, n + 1, n ? -0.1 : 0))) return { moved, ok: false };
                    todayCell.appendChild(el);   // mirror it on screen so the next slot number is right
                    moved++;
                    await sleep(150);
                }
            }
            return { moved, ok: true };
        }

        async function fastSortDay(day) {
            const dt = day.id.slice(2);
            const target = itemsOf(day).map((el, i) => ({ n: numOf(el), r: rankOf(el), i }))
                .sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.n);
            let saves = 0;
            // Front to back: put the right job into slot k, in front of whatever's there now.
            for (let k = 0; k < target.length; k++) {
                const cur = itemsOf(day);
                if (numOf(cur[k]) === target[k]) continue;
                const el = cur.find((e) => numOf(e) === target[k]);
                const slot = Array.prototype.indexOf.call(day.children, cur[k]);
                if (!(await directSave(el, dt, dt, slot, -0.1))) return false;
                day.insertBefore(el, cur[k]);
                saves++;
                await sleep(150);
            }
            calLog('  ' + dt + ': ' + saves + ' save(s)');
            return true;
        }

        // ---- Step 1: move past-dated jobs onto today ----
        async function movePastJobs(today) {
            const todayCell = document.getElementById('d_' + today);
            if (!todayCell) { calLog('Today (' + today + ') is not on this calendar view - skipping moves.'); return 0; }
            const pastCells = Array.from(document.querySelectorAll('.calendarday.dragcontainer'))
                .filter((c) => c.id.slice(2) < today && itemsOf(c).length);
            let moved = 0;
            for (const cell of pastCells) {
                const dt = cell.id.slice(2);
                calLog('Moving ' + itemsOf(cell).length + ' job(s) from ' + dt + '…');
                let stuck = 0;
                while (itemsOf(cell).length && stuck < 3) {
                    const before = itemsOf(cell).length;
                    const tItems = itemsOf(todayCell);
                    const target = tItems.length ? tItems[tItems.length - 1] : todayCell;
                    simulateDrag(itemsOf(cell)[0], target, 0.8);
                    await sleep(CAL_MOVE_DELAY);
                    if (itemsOf(cell).length < before) { moved++; stuck = 0; } else { stuck++; }
                }
                if (itemsOf(cell).length) calLog('  ⚠ ' + itemsOf(cell).length + " job(s) wouldn't move from " + dt);
            }
            return moved;
        }

        // ---- Step 2: color-sort each day ----
        function unsortedDays() {
            return Array.from(document.querySelectorAll('.calendarday.dragcontainer:not(.calendardayvoid)')).filter((day) => {
                const r = itemsOf(day).map(rankOf);
                return r.some((v, i) => i > 0 && v < r[i - 1]);
            });
        }
        // Plans the fewest drags needed: finds the biggest group of jobs that are
        // already in the right order relative to each other and leaves them alone,
        // then drops each remaining job straight into its final slot (one drag each).
        // Works back-to-front so the job it drops in front of is always already final.
        function planMoves(nums, target) {
            const pos = {};
            target.forEach((n, i) => { pos[n] = i; });
            const t = nums.map((n) => pos[n]);              // each job's final slot, in current order
            const last = target.length - 1;
            const endAt = t.indexOf(last);                  // keep the final job fixed so every move has a job to drop in front of
            // longest run (by final slot) that's already in order and ends at the final job
            const len = new Array(t.length).fill(1), prev = new Array(t.length).fill(-1);
            for (let i = 0; i <= endAt; i++) {
                for (let j = 0; j < i; j++) {
                    if (t[j] < t[i] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
                }
            }
            const keep = new Set();
            for (let k = endAt; k !== -1; k = prev[k]) keep.add(nums[k]);
            const moves = [];
            for (let k = last - 1; k >= 0; k--) {
                if (!keep.has(target[k])) moves.push({ job: target[k], before: target[k + 1] });
            }
            return moves;
        }

        async function sortDay(day) {
            const dt = day.id.slice(2);
            const target = itemsOf(day).map((el, i) => ({ n: numOf(el), r: rankOf(el), i }))
                .sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.n);

            // 1) Planned pass: one drag per job that's out of place.
            const byNum = (n) => itemsOf(day).find((el) => numOf(el) === n);
            const moves = planMoves(itemsOf(day).map(numOf), target);
            calLog('  ' + dt + ': ' + moves.length + ' job(s) to move (of ' + target.length + ')');
            for (const m of moves) {
                for (let tryNo = 0; tryNo < 3; tryNo++) {
                    const src = byNum(m.job), anchor = byNum(m.before);
                    if (!src || !anchor) break;
                    if (src.nextElementSibling === anchor) break;   // already sitting right in front of it
                    simulateDrag(src, anchor, 0.2);
                    await sleep(CAL_SORT_DELAY);
                }
            }
            if (JSON.stringify(itemsOf(day).map(numOf)) === JSON.stringify(target)) return true;

            // 2) Fallback: old one-slot-at-a-time method for anything the planned pass missed.
            calLog('  ' + dt + ': finishing with step-by-step pass');
            for (let iter = 0; iter < CAL_MAX_SORT_ITERS; iter++) {
                const cur = itemsOf(day);
                const nums = cur.map(numOf);
                if (JSON.stringify(nums) === JSON.stringify(target)) return true;
                let i = 0;
                while (i < target.length - 1 && nums[i] === target[i]) i++;
                const wantIdx = nums.indexOf(target[i]);
                if (wantIdx === -1) { calLog('  ⚠ ' + dt + ': job ' + target[i] + ' disappeared'); return false; }
                simulateDrag(cur[wantIdx], cur[i], 0.2);
                await sleep(CAL_SORT_DELAY);
            }
            return false;
        }

        // ---- Main ----
        async function runCalendarTidy(pass) {
            if (running) return;
            running = true;
            tidyBtn.disabled = true;
            tidyBtn.style.opacity = '.6';
            tidyBtn.textContent = 'TIDYING…';
            addExpandCss();
            await sleep(300);
            const today = calToday();
            calLog(pass ? 'Verify pass ' + pass + ' after reload…' : 'Started for ' + today);
            try {
                let moved = 0, days = [];
                let fast = CAL_FAST_MODE && pass === 0;
                if (fast) {
                    calLog('Fast mode: saving straight to Teesom…');
                    const r = await fastMovePastJobs(today);
                    moved = r.moved;
                    if (r.ok) {
                        days = unsortedDays();
                        if (days.length) calLog('Sorting ' + days.length + ' day(s): ' + days.map((d) => d.id.slice(2)).join(', '));
                        for (const day of days) { if (!(await fastSortDay(day))) { fast = false; break; } }
                    } else fast = false;
                    if (!fast) calLog('Fast mode failed - switching to dragging.');
                    else if (moved || days.length) calLog('Fast saves sent. Reloading to check they stuck…');
                }
                if (!fast) {
                    const m2 = await movePastJobs(today);
                    moved += m2;
                    if (m2) calLog('Moved ' + m2 + ' job(s) onto ' + today + '.');
                    days = unsortedDays();
                    if (days.length) calLog('Sorting ' + days.length + ' day(s): ' + days.map((d) => d.id.slice(2)).join(', '));
                    for (const day of days) {
                        const ok = await sortDay(day);
                        calLog('  ' + day.id.slice(2) + ': ' + (ok ? 'sorted' : 'needs another pass'));
                    }
                }
                GM_setValue(CAL_LASTRUN_KEY, today);

                if (moved === 0 && days.length === 0) {
                    try { sessionStorage.removeItem(CAL_VERIFY_KEY); } catch (e) { /* ignore */ }
                    calLog('✔ Clean: nothing on past dates, every day color-sorted.');
                    toast('Calendar is tidy.');
                } else if (pass + 1 > CAL_MAX_VERIFY) {
                    try { sessionStorage.removeItem(CAL_VERIFY_KEY); } catch (e) { /* ignore */ }
                    calLog('⚠ Still not clean after ' + CAL_MAX_VERIFY + ' checks - look it over by hand.');
                    toast('Tidy Calendar: some days still need a look.', true);
                } else {
                    calLog('Reloading to check what saved…');
                    try { sessionStorage.setItem(CAL_VERIFY_KEY, String(pass + 1)); } catch (e) { /* ignore */ }
                    await sleep(1500);
                    location.reload();
                    return;
                }
            } catch (err) {
                console.error('[Tidy Calendar]', err);
                calLog('STOPPED: ' + err.message);
                toast('Tidy Calendar stopped: ' + err.message, true);
            }
            removeExpandCss();
            running = false;
            tidyBtn.disabled = false;
            tidyBtn.style.opacity = '1';
            tidyBtn.textContent = 'TIDY CALENDAR';
        }

        const tidyBtn = makeActionButton('TIDY CALENDAR', () => runCalendarTidy(0));
        tidyBtn.title = 'Move every job on a past date onto today, then sort every day by color';
        tidyBtn.style.backgroundColor = '#6a1b9a';
        tidyBtn.style.border = '1px solid #4a148c';
        tidyBtn.onmouseover = () => tidyBtn.style.backgroundColor = '#4a148c';
        tidyBtn.onmouseout = () => tidyBtn.style.backgroundColor = '#6a1b9a';
        bar.appendChild(tidyBtn);

        // Continue a verify pass after the reload, or auto-run once a day if turned on.
        // Waits a moment for the calendar to finish drawing first.
        setTimeout(() => {
            if (!document.querySelector('.calendarday.dragcontainer')) return;
            let pass = 0;
            try { pass = parseInt(sessionStorage.getItem(CAL_VERIFY_KEY) || '0', 10) || 0; } catch (e) { /* ignore */ }
            if (pass > 0) runCalendarTidy(pass);
            else if (CAL_AUTO_RUN_DAILY && GM_getValue(CAL_LASTRUN_KEY, '') !== calToday()) runCalendarTidy(0);
        }, 2500);
    })();
    }

    document.body.appendChild(bar);

    // 4. Fix for popups/modals (Confirm Order, Quotation Follow Up, the order
    // details drawer, etc.) rendering underneath the bar: hide the bar only
    // while one of these is genuinely VISIBLE, not merely present in the DOM.
    // Confirmed from real markup that this site uses Bootstrap 3 style modals:
    // <div class="modal in" ... style="display: block;"> when open.
    // Checking visibility (not just class/existence) guards against a stale
    // hidden backdrop or modal element being left in the DOM after closing,
    // which would otherwise make this look "always open".
    function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        // Note: deliberately NOT checking el.offsetParent here - browsers
        // return null for offsetParent on any position:fixed element
        // (which is exactly what Bootstrap's .modal class uses), so that
        // check was silently marking a genuinely open modal as "not visible".
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function isModalOpen() {
        const openModal = document.querySelector('.modal.in, .modal.show');
        if (isVisible(openModal)) return true;
        const backdrop = document.querySelector('.modal-backdrop');
        if (isVisible(backdrop)) return true;
        // Slide-out panels (e.g. the art/image window) use a different
        // pattern: a "jcw-slideout-open" class added to <body> instead of
        // a .modal.in element.
        if (document.body.classList.contains('jcw-slideout-open')) return true;
        // Our own Send Jobs review/preview popup should also hide the bar.
        if (document.getElementById('tm-jobboard-send-modal')) return true;
        // The Chipply import window should also hide the bar.
        if (document.getElementById('cip-ov')) return true;
        return false;
    }

    function syncBarVisibility() {
        bar.style.display = isModalOpen() ? 'none' : 'flex';
    }

    const modalObserver = new MutationObserver(syncBarVisibility);
    modalObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
    });
    syncBarVisibility();
})();
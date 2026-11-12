// ==UserScript==
// @name         Teesom Copy Buttons (Design Number + Email) V9.23
// @namespace    https://app.teesom.com/
// @version      1.3.0
// @description  Copy icons for design numbers and emails, plus order-page helpers: customer balance next to the customer name, $0 garment cost alert, due date check before Convert to Invoice, Duplicate switches the new order to your name, traveler Ordered checkmarks + catalog tags + vendor/Vendor Ref line, and the G&G box label that prints turned on 4x6.
// @author       Ross
// @match        https://app.teesom.com/*
// @match        https://v.teesom.com/PrintSimpleBoxLabel/*
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-copy-buttons.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-copy-buttons.user.js
// ==/UserScript==

(function () {
    'use strict';
    if (location.hostname !== 'app.teesom.com') return;

    // Each target: a CSS selector for the element to copy, a label for the
    // button tooltip, and (optionally) how to pull the text to copy out of
    // the matched element — defaults to its trimmed textContent.
    const TARGETS = [
        {
            // Design-number links on the order page, e.g.:
            // <a class="btndupadmineditart btneditartact cp" title="Design Number - Click to Edit Art">SCR-BLA0003-16351</a>
            selector: 'a.btndupadmineditart',
            label: 'Copy design number'
        },
        {
            // Email addresses shown via the "mail me" span, e.g.:
            // <span class="jcwmailme">Jenny@lobstertrap.net</span>
            selector: 'span.jcwmailme',
            label: 'Copy email address'
        }
    ];

    const PROCESSED_ATTR = 'data-copybtn-added';

    const COPY_ICON = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>`;

    const CHECK_ICON = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;

    function fallbackCopy(text, done) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        document.body.removeChild(ta);
        done();
    }

    function copyText(text, btn) {
        const done = () => {
            btn.innerHTML = CHECK_ICON;
            btn.style.color = '#2ecc71';
            setTimeout(() => {
                btn.innerHTML = COPY_ICON;
                btn.style.color = '';
            }, 1000);
        };

        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text, 'text');
            done();
            return;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else {
            fallbackCopy(text, done);
        }
    }

    function makeCopyButton(getText, label) {
        const btn = document.createElement('span');
        btn.innerHTML = COPY_ICON;
        btn.title = label;
        btn.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
            'cursor:pointer',
            'color:#888',
            'margin-right:4px',
            'vertical-align:middle',
            'transition:color .15s'
        ].join(';');

        btn.addEventListener('mouseenter', () => { btn.style.color = '#3498db'; });
        btn.addEventListener('mouseleave', () => { btn.style.color = ''; });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyText(getText(), btn);
        });

        return btn;
    }

    function addCopyButtons() {
        TARGETS.forEach(({ selector, label }) => {
            document.querySelectorAll(selector).forEach((el) => {
                if (el.hasAttribute(PROCESSED_ATTR)) return;
                el.setAttribute(PROCESSED_ATTR, '1');

                const btn = makeCopyButton(() => el.textContent.trim(), label);
                el.parentNode.insertBefore(btn, el);
            });
        });
    }

    // Run once for whatever is already on the page...
    addCopyButtons();

    // ...and keep watching, since content on Teesom pages is often loaded
    // or reloaded via AJAX after the initial page load.
    const observer = new MutationObserver(() => addCopyButtons());
    observer.observe(document.body, { childList: true, subtree: true });
})();

/* =====================================================================
 * ORDER PAGE HELPERS (orderentry.asp only)
 *  1. Customer account balance next to the customer name (same badge as the payment script)
 *  2. $0 garment COST alert (catalog pricing not synced)
 *  3. Due date check before "Convert to Invoice"
 *  4. "Duplicate" switches the new order's Sales Rep to you
 * ===================================================================== */
(function () {
    'use strict';
    if (!/\/saiw\/orderentry\.asp/i.test(location.pathname)) return;

    const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    const $ = () => W.jQuery;
    const orderId = () => W._orderid || document.body.getAttribute('doidbid') || '';
    const money = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const num = (t) => parseFloat(String(t || '').replace(/[^0-9.\-]/g, '')) || 0;

    // ---------- shared styles + toast ----------
    const css = document.createElement('style');
    css.textContent = `
      .ggpay-custbal{display:inline-block;margin-left:10px;padding:2px 9px;border-radius:10px;font:bold 12px/18px Arial;vertical-align:middle;text-decoration:none!important;white-space:nowrap;cursor:pointer}
      .ggpay-custbal.loading{background:#e4e8ee;color:#555}.ggpay-custbal.zero{background:#e4e8ee;color:#333}
      .ggpay-custbal.owes{background:#fff1d6;color:#8a5300;border:1px solid #f0c36d}
      .ggpay-custbal.pastdue{background:#d9232e;color:#fff}.ggpay-custbal.credit{background:#1f7a3a;color:#fff}
      .ggpay-custbal.err{background:#e4e8ee;color:#999}
      .gg-zero-cost{display:inline-block;margin-left:5px;padding:1px 6px;border-radius:3px;background:#FBEAE8;border:1px solid #E8A39C;color:#C0392B;font:700 11px Arial,sans-serif;vertical-align:middle;cursor:help;white-space:nowrap}
      .gg-zero-cost-box{background:#FBEAE8 !important;border-color:#E8A39C !important;color:#C0392B !important}
      #gg-toast{position:fixed;right:16px;bottom:16px;z-index:99999;max-width:340px;padding:10px 14px;border-radius:8px;background:#163C5C;color:#fff;font:13px/1.4 Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)}
      #gg-toast a{color:#9fd3ff;cursor:pointer;text-decoration:underline;margin-left:6px}
      #gg-modal-bg{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center}
      #gg-modal{background:#fff;border-radius:10px;padding:20px 22px;width:340px;max-width:92vw;font:14px Arial,sans-serif;color:#1B2733;box-shadow:0 10px 30px rgba(0,0,0,.3)}
      #gg-modal h3{margin:0 0 6px;font-size:17px;color:#163C5C}#gg-modal p{margin:0 0 12px;color:#55636F}
      #gg-modal input[type=date],#gg-modal select{width:100%;box-sizing:border-box;padding:8px;font-size:14px;border:1px solid #D7DCE1;border-radius:6px;margin-bottom:10px}
      #gg-modal .row{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}
      #gg-modal button{padding:8px 14px;border-radius:6px;border:0;font:700 13px Arial,sans-serif;cursor:pointer}
      #gg-modal .ok{background:#2FA84F;color:#fff}#gg-modal .skip{background:#E4EEF8;color:#163C5C}#gg-modal .cancel{background:transparent;color:#55636F}`;
    document.head.appendChild(css);

    function toast(html, ms) {
        let t = document.getElementById('gg-toast');
        if (!t) { t = document.createElement('div'); t.id = 'gg-toast'; document.body.appendChild(t); }
        t.innerHTML = html;
        clearTimeout(t._h);
        t._h = setTimeout(() => t.remove(), ms || 6000);
        return t;
    }

    function modal(innerHtml) {
        const bg = document.createElement('div');
        bg.id = 'gg-modal-bg';
        bg.innerHTML = '<div id="gg-modal">' + innerHtml + '</div>';
        document.body.appendChild(bg);
        return bg;
    }

    // ---------- 1. Customer account balance (next to the customer name) ----------
    // Same badge and same lookups as the payment script (Teesom's Customer Account page).
    const r2 = (n) => Math.round(Number(n) * 100) / 100;
    const money2 = (n) => (n < 0 ? '-$' : '$') + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const postGet = (data) => new Promise((resolve, reject) => {
        if (!$()) return reject(new Error('jQuery not ready'));
        $().post('adm_getdata.asp', data).done((d) => resolve(String(d))).fail(() => reject(new Error('request failed')));
    });
    function customerId() {
        const a = document.getElementById('orderentrycompanyname');
        try { return a ? new URL(a.getAttribute('href'), location.href).searchParams.get('cid') : null; } catch (e) { return null; }
    }
    async function fetchCustomerBalance(cid) {
        const [info, open] = await Promise.all([
            postGet({ ajxaction: 'getcompanyinfocustomerviewlist', dbid: cid }),
            postGet({ ajxaction: 'getcustomerpostlistviewcustomer', dbid: cid, dtfrm: '', dtto: '', fltr: 'open', srt: '', exportlist: '' }),
        ]);
        const doc = new DOMParser().parseFromString(info, 'text/html');
        const lab = (title) => { const e = [...doc.querySelectorAll('.label-balance')].find((x) => x.title === title); return e ? num(e.textContent) : null; };
        const res = { open: lab('Open Balance'), wip: lab('Work In Progress'), pastDue: lab('Past Due'), owed: 0, credit: 0, invoices: [], credits: [] };
        const odoc = new DOMParser().parseFromString(open, 'text/html');
        for (const row of odoc.querySelectorAll('.jcwtblrow')) {
            const cellEls = [...row.querySelectorAll(':scope > .jcwcol')];
            const cells = cellEls.map((c) => c.textContent.replace(/\s+/g, ' ').trim());
            const unappliedCell = cells.find((c) => /^Unapplied Amount/i.test(c));
            if (!unappliedCell) continue;
            const amt = num(unappliedCell.replace(/^Unapplied Amount/i, ''));
            if (!(Math.abs(amt) >= 0.01)) continue;
            const refIdx = cells.findIndex((c) => /^(Invoice|Payment|Credit|Refund|Journal)\b/i.test(c));
            if (refIdx < 0) continue;
            const type = (cells[refIdx].match(/^\w+/) || [''])[0].toLowerCase();
            const label = ((cellEls[refIdx].querySelector('span') || {}).textContent || cells[refIdx]).replace(/\s+/g, ' ').trim();
            if (type === 'invoice') { res.owed += amt; res.invoices.push(label + ': ' + money2(amt)); }
            else if (type === 'payment' || type === 'credit') { res.credit += Math.abs(amt); res.credits.push(label + ': ' + money2(Math.abs(amt))); }
        }
        res.owed = r2(res.owed); res.credit = r2(res.credit);
        return res;
    }
    let balCid = null, balBusy = false;
    async function renderCustomerBalance(force) {
        const a = document.getElementById('orderentrycompanyname');
        const cid = customerId();
        if (!a || !cid || balBusy || !$()) return;
        let badge = document.getElementById('ggpay-custbal');
        if (badge && !badge.dataset.ggcopy) return;            // the payment script already shows it
        if (!force && cid === balCid && badge) return;
        balBusy = true; balCid = cid;
        if (!badge) { badge = document.createElement('a'); badge.id = 'ggpay-custbal'; badge.dataset.ggcopy = '1'; badge.target = '_blank'; a.insertAdjacentElement('afterend', badge); }
        badge.href = a.getAttribute('href');
        badge.className = 'ggpay-custbal loading';
        badge.textContent = 'Balance…';
        try {
            const b = await fetchCustomerBalance(cid);
            let open = b.open != null ? b.open : b.owed;
            if (open <= -0.01) { b.credit = Math.max(b.credit, r2(-open)); open = 0; }   // negative open balance = credit on account
            const net = r2(open - b.credit);
            let cls, text;
            if (b.credit >= 0.01 && net <= 0.005) { cls = 'credit'; text = 'Credit ' + money2(b.credit) + (open >= 0.01 ? ' · owes ' + money2(open) : '') + ' · we owe them'; }
            else if (open >= 0.01) {
                cls = b.pastDue >= 0.01 ? 'pastdue' : 'owes';
                text = 'Owes ' + money2(open) + (b.pastDue >= 0.01 ? ' · ' + money2(b.pastDue) + ' past due' : '') + (b.credit >= 0.01 ? ' · credit ' + money2(b.credit) : '');
            } else { cls = 'zero'; text = 'Balance $0.00'; }
            badge.className = 'ggpay-custbal ' + cls;
            badge.textContent = text;
            badge.title = ['Customer account (click to open)',
                'Open balance: ' + (b.open != null ? money2(b.open) : '?'),
                'Past due: ' + (b.pastDue != null ? money2(b.pastDue) : '?'),
                'Work in progress: ' + (b.wip != null ? money2(b.wip) : '?'),
                'Unapplied credits (we owe them): ' + money2(b.credit),
                ...(b.invoices.length ? ['', 'Open invoices:', ...b.invoices.slice(0, 12)] : []),
                ...(b.credits.length ? ['', 'Unapplied payments/credits:', ...b.credits.slice(0, 12)] : []),
                '', 'Includes this invoice if it has a balance.'].join('\n');
        } catch (e) {
            badge.className = 'ggpay-custbal err';
            badge.textContent = 'Balance unavailable';
            badge.title = 'Could not load the customer balance: ' + e.message;
        } finally { balBusy = false; }
    }

    // ---------- 2. $0 garment COST alert ----------
    // Garment lines have a selling price (green) and a cost box under it. A $0.00 cost usually
    // means the catalog's pricing isn't synced, so flag it with a small light-red square.
    function updateZero() {
        document.querySelectorAll('.order-detail-row').forEach(row => {
            if (!row.querySelector('.ord-detail-row-label')) return;          // garment lines only
            const cost = row.querySelector('.btnoeinputprice');            // the grey cost box under the price
            if (!cost) return;
            const isZero = /\d/.test(cost.textContent) && num(cost.textContent) === 0;
            cost.classList.toggle('gg-zero-cost-box', isZero);
            let mark = row.querySelector('.gg-zero-cost');
            if (isZero && !mark) {
                mark = document.createElement('span');
                mark.className = 'gg-zero-cost';
                mark.textContent = 'ATTENTION!';
                mark.title = 'Cost is $0.00. The catalog pricing may not be synced, so check this garment\'s cost.';
                cost.after(mark);
            } else if (!isZero && mark) mark.remove();
        });
    }

    // On Teesom's Confirm Order screen, hide "Place the order now to get it by <date>"
    // (it shows the default turnaround, not the due date chosen for the order).
    function updateConfirmDate() {
        const m = document.getElementById('modal-transaction-process');
        if (!m) return;
        m.querySelectorAll('div.w-100').forEach(d => {
            if (/^\s*Place the order now to get it by/i.test(d.textContent) && d.style.display !== 'none') d.style.display = 'none';
        });
    }

    let pending = null;
    const refresh = () => { clearTimeout(pending); pending = setTimeout(() => { updateZero(); updateConfirmDate(); if (customerId() && (!document.getElementById('ggpay-custbal') || customerId() !== balCid)) renderCustomerBalance(); }, 300); };
    new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true });
    refresh();

    // ---------- 3. Due date check before Convert to Invoice ----------
    const EMPTY_DATE = (v) => !v || /^1899-|^1900-/.test(v);
    let convertBypass = false;

    function waitFor(test, ms) {
        return new Promise(res => {
            const t0 = Date.now();
            (function poll() { const v = test(); if (v || Date.now() - t0 > ms) return res(v); setTimeout(poll, 150); })();
        });
    }

    // Standard turnaround date from the totals box ("Order today and get it by 11/26/2026").
    function standardDueDate() {
        const tier = document.querySelector('#oetotalscontainer a.btn-order-load-tax-data[href="standard"]');
        const box = (tier && tier.closest('.optionselected, .optiondisabled')) || document.querySelector('#oetotalscontainer .optionselected');
        const m = box && box.textContent.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : '';
    }

    async function readDueDate() {
        const inp = document.getElementById('oeduedate');
        if (!inp) return { ok: false };
        if (inp.value === '') {                       // Dates tab not loaded yet - load it
            const tab = document.querySelector('#oe-tab-nav a[showcontainer="tabcontainerorderdates"]');
            if (tab) tab.click();
            await waitFor(() => inp.value !== '', 6000);
        }
        const firm = document.getElementById('order-due-date-firm');
        return { ok: true, value: inp.value, firm: !!(firm && firm.checked) };
    }

    document.addEventListener('click', async (e) => {
        const link = e.target.closest('a.btnstarttransaction[transtype="convertorder"]');
        if (!link || convertBypass) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const go = () => { convertBypass = true; link.click(); setTimeout(() => { convertBypass = false; }, 500); };

        const due = await readDueDate();
        if (!due.ok || !EMPTY_DATE(due.value)) return go();   // already has a due date

        const std = standardDueDate();
        const stdTxt = std ? new Date(std + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
        const bg = modal(`
            <h3>Due date</h3>
            <p>${std ? 'Standard turnaround is <b>' + stdTxt + '</b>.' : 'Pick the due date.'} Does the customer need it earlier? Change the date if so.</p>
            <input type="date" id="gg-due-input" value="${std}">
            <label style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input type="checkbox" id="gg-due-firm"> Firm date (they must have it by this day)</label>
            <div class="row"><button class="cancel">Cancel</button><button class="ok">Save &amp; convert</button></div>`);
        const close = () => bg.remove();
        bg.querySelector('.cancel').onclick = close;
        bg.querySelector('.ok').onclick = () => {
            const d = bg.querySelector('#gg-due-input').value;
            if (!d) { bg.querySelector('#gg-due-input').style.borderColor = '#DC4C3E'; return; }
            const firm = bg.querySelector('#gg-due-firm').checked;
            const jq = $();
            jq('#oeduedate').val(d).trigger('change');                      // Teesom saves on change
            const fb = document.getElementById('order-due-date-firm');
            if (fb && fb.checked !== firm) jq(fb).prop('checked', firm).trigger('change');
            savePending({ oid: orderId(), date: d, firm: firm, t: Date.now() });
            close();
            setTimeout(go, 900);                                            // let the save finish
        };
    }, true);

    // Teesom's "Confirm Order" step sends the due date of the turnaround option picked there
    // (standard / rush), which would overwrite the date chosen above. So:
    //  a) when Confirm Order is submitted, swap in the chosen date, and
    //  b) after the conversion, re-check the due date and fix it if Teesom changed it anyway.
    const DUE_KEY = 'gg-due-pending';
    const savePending = (v) => { try { localStorage.setItem(DUE_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } };
    const loadPending = () => {
        try {
            const v = JSON.parse(localStorage.getItem(DUE_KEY) || 'null');
            return v && v.oid === orderId() && Date.now() - v.t < 30 * 60 * 1000 ? v : null;
        } catch (e) { return null; }
    };
    const clearPending = () => { try { localStorage.removeItem(DUE_KEY); } catch (e) { /* ignore */ } };
    const sameFormatAs = (sample, iso) => {                                // match Teesom's date format
        const [y, m, d] = iso.split('-');
        return /\//.test(sample || '') ? m + '/' + d + '/' + y : iso;
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#btn-transaction-process-next')) return;
        const p = loadPending();
        const modalEl = document.getElementById('modal-transaction-process');
        if (!p || !modalEl) return;
        modalEl.setAttribute('duedate', sameFormatAs(modalEl.getAttribute('duedate'), p.date));
        watchConversion();
    }, true);

    let watching = false;
    async function watchConversion() {
        if (watching) return;
        watching = true;
        const converted = () => !document.querySelector('a.btnstarttransaction[transtype="convertorder"]');
        await waitFor(converted, 60000);
        watching = false;
        if (converted()) setTimeout(fixDueAfterConvert, 1500);
    }

    async function fixDueAfterConvert() {
        const p = loadPending();
        if (!p || document.querySelector('a.btnstarttransaction[transtype="convertorder"]')) return;   // not converted yet
        const due = await readDueDate();
        if (!due.ok) return;
        const jq = $();
        if (due.value !== p.date) jq('#oeduedate').val(p.date).trigger('change');
        const fb = document.getElementById('order-due-date-firm');
        if (fb && fb.checked !== p.firm) jq(fb).prop('checked', p.firm).trigger('change');
        clearPending();
        if (due.value !== p.date) toast('Due date set to <b>' + new Date(p.date + 'T12:00').toLocaleDateString('en-US') + '</b>' + (p.firm ? ' (firm)' : '') + '.', 6000);
    }

    // After a page reload (Teesom may reload once the order is converted)
    if (loadPending()) waitFor(() => $() && document.getElementById('oeduedate'), 10000).then(() => setTimeout(fixDueAfterConvert, 1500));

    // ---------- 4. Duplicate -> switch Sales Rep to you ----------
    const DUP_KEY = 'gg-dup-pending';
    const ME_KEY = 'gg-my-sales-rep';

    document.addEventListener('click', (e) => {
        if (e.target.closest('.btnduporder')) {
            try { localStorage.setItem(DUP_KEY, JSON.stringify({ from: orderId(), t: Date.now() })); } catch (err) { /* ignore */ }
        }
    }, true);

    function repOptions() {
        const sel = document.getElementById('salesrepchange');
        return sel ? [...sel.options].filter(o => o.value && !/^-+$/.test(o.text) && !/add new/i.test(o.text)) : [];
    }

    function pickMe(then) {
        const opts = repOptions().map(o => `<option value="${o.value}">${o.text}</option>`).join('');
        const bg = modal(`
            <h3>Who uses this computer?</h3>
            <p>Duplicated orders will be switched to this sales rep. You only need to pick once.</p>
            <select id="gg-me">${opts}</select>
            <div class="row"><button class="cancel">Not now</button><button class="ok">Save</button></div>`);
        bg.querySelector('.cancel').onclick = () => bg.remove();
        bg.querySelector('.ok').onclick = () => {
            const v = bg.querySelector('#gg-me').value;
            try { localStorage.setItem(ME_KEY, v); } catch (err) { /* ignore */ }
            bg.remove();
            then && then(v);
        };
    }

    function setRep(meId) {
        const sel = document.getElementById('salesrepchange');
        if (!sel || !meId) return;
        const opt = [...sel.options].find(o => o.value === meId);
        if (!opt) return;
        if (sel.value === meId) { toast('Duplicated order is already yours (' + opt.text + ').', 4000); return; }
        $()('#salesrepchange').val(meId).trigger('change');                // Teesom saves on change
        const t = toast('Sales rep switched to <b>' + opt.text + '</b>.<a>Not you?</a>', 9000);
        t.querySelector('a').onclick = () => { t.remove(); pickMe(setRep); };
    }

    (async function checkDuplicate() {
        let info = null;
        try { info = JSON.parse(localStorage.getItem(DUP_KEY) || 'null'); } catch (err) { /* ignore */ }
        if (!info || Date.now() - info.t > 2 * 60 * 1000) return;
        const ready = await waitFor(() => orderId() && document.getElementById('salesrepchange') && $(), 8000);
        if (!ready || orderId() === info.from) return;                   // still on the original order
        try { localStorage.removeItem(DUP_KEY); } catch (err) { /* ignore */ }
        let me = null;
        try { me = localStorage.getItem(ME_KEY); } catch (err) { /* ignore */ }
        if (me) setRep(me); else pickMe(setRep);
    })();
})();


/* =====================================================================
 * PRINT TRAVELER: Ordered checkmarks, catalog tags, vendor + Vendor Ref line
 * ===================================================================== */
(function () {
    'use strict';
    if (location.hostname !== 'app.teesom.com' || !/\/saiw\/print\/printordertraveler\.aspx/i.test(location.pathname)) return;

    // ---- Settings ----------------------------------------------------------
    const INK = '#c62828';          // "marker" color for the handwriting (red). Dark blue was '#1a3fa8'
    const PO_PAGE = 'first';        // which page gets the PO line: 'first', 'last' or 'all'
    const PO_BOTTOM_IN = 0.7;       // inches up from the bottom edge of the page
    // -----------------------------------------------------------------------

    const LOG = (...a) => console.log('[Traveler Ordered]', ...a);

    // Handwritten-style font (Caveat). Falls back to a cursive system font if it can't load.
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap';
    document.head.appendChild(font);

    const css = document.createElement('style');
    css.textContent = `
      .gg-hand{font-family:'Kalam','Segoe Print','Bradley Hand',cursive;color:${INK};font-weight:700;line-height:1}
      .gg-check{font-size:20px;display:flex;align-items:center;justify-content:center;height:100%}
      .gg-part{font-size:14px}
      .gg-cat{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:3px;background:#163C5C;color:#fff;font:bold 10px Arial,sans-serif;vertical-align:middle;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .gg-po-line{position:absolute;left:0.5in;right:0.5in;bottom:${PO_BOTTOM_IN}in;font-size:20px;z-index:40}
      @media print{.gg-hand{color:${INK} !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
    document.head.appendChild(css);

    // Teesom's own AJAX calls send a random "SystSKey" header; requests without it get a 404.
    function sysKey() {
        const b = new Uint8Array(60);
        crypto.getRandomValues(b);
        const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from(b, (x) => c[x % 62]).join('');
    }
    async function post(url, data) {
        const r = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', 'SystSKey': sysKey() },
            body: new URLSearchParams(data),
        });
        if (!r.ok) throw new Error(url + ' -> ' + r.status);
        return r.text();
    }
    const postJSON = async (url, data) => JSON.parse(await post(url, data));

    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').trim();
    const keyOf = (code, color, size) => norm(code) + '|' + norm(color) + '|' + norm(size);

    // The traveler URL uses a view id, so find the real order id from the order number in the title.
    async function findOrderId(num) {
        const fd = new FormData();
        fd.append('search_value', num);
        const r = await fetch('https://capi.teesom.com/GlobalSearch', { method: 'POST', body: fd, credentials: 'include' });
        const j = await r.json();
        const hit = (j.response || []).find((x) => x.type === 'Order' && String(x.title) === String(num));
        return hit ? hit.id : null;
    }

    async function loadData(orderId) {
        // 1. How many of each garment are on a PO
        const tr = await postJSON('/saiw/apc/salesorder/order_detail_core_load.ashx', { ajxaction: 'load-order-qty-item-transactions', ord: orderId });
        const qty = {};
        (tr.items || []).forEach((i) => {
            const k = keyOf(i.code, i.color, i.size);
            const q = qty[k] || (qty[k] = { needed: 0, purchased: 0 });
            q.needed += Number(i.qty_to_order || 0);
            q.purchased += Number(i.qty_purchased || 0);
        });

        // 2. Which POs this order's goods are on (from Teesom's Goods view)
        const goods = await postJSON('/saiw/adm_getdata.asp', { ajxaction: 'loadiwogoodsperjob', dbid: '', ord: orderId, t: '' });
        const poIds = new Set();
        ['goodsordered', 'goodsreceived', 'goodscsg'].forEach((f) => {
            const doc = new DOMParser().parseFromString(goods[f] || '', 'text/html');
            doc.querySelectorAll('a[href*="poentry.asp"]').forEach((a) => {
                const id = new URL(a.getAttribute('href'), location.origin + '/saiw/').searchParams.get('oid');
                if (id) poIds.add(id);
            });
        });

        // 3. Each PO's number, Vendor Ref, and which of its lines belong to this order
        const poByItem = {};
        for (const poid of poIds) {
            try {
                const [items, det] = await Promise.all([
                    postJSON('/saiw/apc/purchasing/po_entry_load.ashx', { ajxaction: 'load-po-items', poid }),
                    postJSON('/saiw/apc/purchasing/po_entry_load.ashx', { ajxaction: 'load-po-detail', poid }),
                ]);
                const pd = det.podetail || det;
                const label = { po: pd.ponumber, ref: (pd.VendorRef || '').trim(), vendor: (pd.suppliername || '').trim(), voided: !!pd.voided };
                if (label.voided || !label.po) continue;
                ((items.itemdetail || {}).items || []).forEach((it) => {
                    const mine = (it.subItems || []).some((s) => s.orderid === orderId);
                    if (!mine) return;
                    const k = keyOf(it.code, it.color, it.size);
                    const list = poByItem[k] || (poByItem[k] = []);
                    if (!list.some((x) => x.po === label.po)) list.push(label);
                });
            } catch (e) { LOG('PO load failed', poid, e); }
        }
        // 4. Catalog name per style code, from the order's detail rows ("Catalog Used" tag)
        const catalog = {};
        try {
            const html = await post('/saiw/adm_getdata.asp?q=oe_d_l_1', { ajxaction: 'getorderdetail', orderlink: orderId, screen_width: 1600, screen_height: 900 });
            new DOMParser().parseFromString(html, 'text/html').querySelectorAll('p.lbllinestyle').forEach((p) => {
                const tag = p.querySelector('[title="Catalog Used"]');
                const code = (p.firstChild && p.firstChild.nodeType === 3 ? p.firstChild.nodeValue : '').trim();
                if (tag && code && !catalog[norm(code)]) catalog[norm(code)] = tag.textContent.trim();
            });
        } catch (e) { LOG('catalog load failed', e); }
        return { qty, poByItem, catalog };
    }

    function mark({ qty, poByItem, catalog }) {
        // Which option column is "Ordered"?
        const headers = Array.from(document.querySelectorAll('.page-header .page-header-option-wrap'));
        let col = headers.findIndex((h) => /^\s*ordered\s*$/i.test(h.textContent));
        if (col < 0) col = 0;

        let code = '', color = '', ticked = 0;
        const allPOs = new Map();
        document.querySelectorAll('.page .page-row').forEach((row) => {
            if (!row.classList.contains('page-job-item-row-type-products')) return;   // garments only
            const codeEl = row.querySelector('.page-row-code-style');
            const colorTxt = (row.querySelector('.page-row-color') || {}).textContent || '';
            if (codeEl && codeEl.textContent.trim()) {                                    // a new item starts
                code = codeEl.textContent.trim();
                const cat = catalog[norm(code)];
                if (cat && !row.querySelector('.gg-cat')) {
                    const t = document.createElement('span');
                    t.className = 'gg-cat';
                    t.textContent = cat;
                    codeEl.after(t);
                }
            }
            if (colorTxt.trim()) color = colorTxt.trim();
            const size = ((row.querySelector('.page-row-size') || {}).textContent || '').trim();
            const rowQty = Number(((row.querySelector('.page-row-qty') || {}).textContent || '').trim()) || 0;
            const k = keyOf(code, color, size);
            (poByItem[k] || []).forEach((p) => allPOs.set(p.po, p));

            const q = qty[k];
            const box = row.querySelectorAll('.page-row-option')[col];
            if (!box || !q || q.purchased <= 0 || box.querySelector('.gg-hand')) return;
            const need = q.needed || rowQty;
            const full = q.purchased >= need;
            const m = document.createElement('span');
            m.className = 'gg-hand ' + (full ? 'gg-check' : 'gg-check gg-part');
            m.textContent = full ? '✓' : '✓ ' + q.purchased + '/' + need;
            m.title = q.purchased + ' of ' + need + ' on a PO';
            box.appendChild(m);
            ticked++;
        });

        // One line in the blank space at the bottom of the page: "Ordered: SanMar #14541  ·  S&S Activewear #14651"
        if (allPOs.size) {
            const text = Array.from(allPOs.values()).map((p) => (p.vendor ? p.vendor + ' ' : '') + (p.ref ? '#' + p.ref : 'PO #' + p.po)).join('   ·   ');   // Vendor Ref, or PO # if a PO has none
            const pages = Array.from(document.querySelectorAll('.page'));
            const targets = PO_PAGE === 'all' ? pages : PO_PAGE === 'last' ? pages.slice(-1) : pages.slice(0, 1);
            targets.forEach((page) => {
                if (page.querySelector('.gg-po-line')) return;
                if (getComputedStyle(page).position === 'static') page.style.position = 'relative';
                const line = document.createElement('div');
                line.className = 'gg-hand gg-po-line';
                line.textContent = text;
                page.appendChild(line);
            });
        }
        LOG('ticked', ticked, 'rows;', allPOs.size, 'PO(s)');
    }

    (async function run() {
        try {
            const m = document.title.match(/#\s*(\d+)/);
            if (!m) return LOG('no order number in title');
            const orderId = await findOrderId(m[1]);
            if (!orderId) return LOG('order not found for #' + m[1]);
            mark(await loadData(orderId));
        } catch (e) {
            LOG('failed', e);
        }
    })();
})();


/* =====================================================================
 * BOX LABEL (v.teesom.com): G&G layout, prints turned to fill a 4x6 sheet
 * ===================================================================== */
(function () {
    'use strict';
    if (location.hostname !== 'v.teesom.com' || !/^\/PrintSimpleBoxLabel\//i.test(location.pathname)) return;

    // ---- Settings ----------------------------------------------------------
    const SHEET_W_IN = 4;     // label sheet in the printer, portrait
    const SHEET_H_IN = 6;
    const CLOCKWISE = true;   // false = turn it the other way when printing
    // -----------------------------------------------------------------------

    function build() {
        const src = document.getElementById('page');
        if (!src || document.getElementById('gg-label')) return;
        const txt = (sel) => ((src.querySelector(sel) || {}).textContent || '').trim();

        // ---- Order info from Teesom's label ----
        const orderNum = txt('#basic_info_1');
        const orderDesc = txt('#basic_info_2');
        const customer = txt('.body_info_content.body_info_larger');
        const lines = Array.from(src.querySelectorAll('.basic_body_options_info_group_type_text .basic_body_options_info_title'))
            .map((e) => e.textContent.trim()).filter(Boolean);
        const logoSrc = (src.querySelector('#basic_img img') || {}).src || '';

        // QR code: Teesom draws it as an <svg id="containercontent"> (or a canvas/img in older versions).
        function qrCopy() {
            const el = src.querySelector('#containercontent') || src.querySelector('#container svg, #container canvas, #container img');
            if (!el) return null;
            let node;
            if (el.tagName.toLowerCase() === 'canvas') {
                node = new Image();
                try { node.src = el.toDataURL('image/png'); } catch (e) { return null; }
            } else {
                node = el.cloneNode(true);
                if (node.tagName.toLowerCase() === 'svg' && !node.getAttribute('viewBox')) {
                    const w = parseFloat(el.getAttribute('width')) || el.getBBox().width || 181;
                    const h = parseFloat(el.getAttribute('height')) || el.getBBox().height || 181;
                    node.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
                }
                node.removeAttribute('id');
                node.removeAttribute('style');
                node.removeAttribute('width');
                node.removeAttribute('height');
            }
            node.setAttribute('class', 'ggl-qr-img');
            return node;
        }

        // ---- Styles (all under #gg-label, and !important where Stylebot could reach) ----
        const W = SHEET_H_IN, H = SHEET_W_IN;   // drawn landscape: 6 wide x 4 tall
        const css = document.createElement('style');
        css.id = 'gg-box-label-style';
        css.textContent = `
          #page { display: none !important; }
          #gg-label { box-sizing: border-box; width: ${W}in; height: ${H}in; margin: 0.6in auto; padding: 0.14in 0.16in;
                      border: 1px solid #d3d3d3; background: #fff; color: #000; overflow: hidden;
                      font-family: Arial, Helvetica, sans-serif; display: grid;
                      grid-template-rows: 1.02in 0.74in 1fr; row-gap: 0.1in; }
          #gg-label * { box-sizing: border-box; margin: 0; padding: 0; }

          /* Row 1: logo | QR | order # */
          #gg-label .ggl-top { display: grid; grid-template-columns: 2.25in 0.98in 1fr; align-items: center; column-gap: 0.12in;
                               border-bottom: 1.5px solid #000; padding-bottom: 0.06in; }
          #gg-label img.ggl-logo { position: static !important; left: auto !important; top: auto !important; transform: none !important;
                                   display: block; max-width: 100%; max-height: 0.86in; object-fit: contain;
                                   filter: brightness(60%) contrast(600%) grayscale(100%) !important; }
          #gg-label .ggl-qr { width: 0.92in; height: 0.92in; }
          #gg-label .ggl-qr-img { display: block; width: 100% !important; height: 100% !important; position: static !important; transform: none !important; }
          #gg-label .ggl-num { text-align: right; line-height: 1; white-space: nowrap; overflow: hidden; }
          #gg-label .ggl-num b { display: block; font-size: 46px; font-weight: 800; letter-spacing: -0.5px; }
          #gg-label .ggl-num span { display: block; margin-top: 5px; font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; }

          /* Row 2: customer name bar */
          #gg-label .ggl-name { background: #000; color: #fff; display: flex; align-items: center; padding: 0 0.14in;
                                font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif; font-stretch: condensed;
                                font-weight: 700; white-space: nowrap; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          /* Row 3: BOX __ OF __ | write-on lines */
          #gg-label .ggl-bottom { display: grid; grid-template-columns: 2.05in 1fr; column-gap: 0.3in; }
          #gg-label .ggl-box { align-self: end; border: 2px solid #000; }
          #gg-label .ggl-boxhead { background: #000; color: #fff; text-align: center; font-size: 15px; font-weight: 700; letter-spacing: 3px;
                                   padding: 3px 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #gg-label .ggl-boxrow { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; column-gap: 0.1in; padding: 0.1in; }
          #gg-label .ggl-boxrow i { height: 0.5in; border: 1.5px solid #000; }
          #gg-label .ggl-boxrow span { font-size: 15px; font-weight: 700; }
          #gg-label .ggl-lines { display: flex; flex-direction: column; justify-content: space-evenly; }
          #gg-label .ggl-line { border-bottom: 1.5px solid #000; height: 0.36in; display: flex; align-items: flex-end;
                                font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 2px; }

          @media print {
            @page { size: ${SHEET_W_IN}in ${SHEET_H_IN}in; margin: 0; }
            html, body { margin: 0 !important; padding: 0 !important; width: ${SHEET_W_IN}in !important; height: ${SHEET_H_IN}in !important; overflow: hidden !important; }
            body > *:not(#gg-label) { display: none !important; }
            #gg-label { position: absolute; top: 0; left: 0; margin: 0; border: 0; transform-origin: 0 0;
                        transform: ${CLOCKWISE ? `translateX(${SHEET_W_IN}in) rotate(90deg)` : `translateY(${SHEET_H_IN}in) rotate(-90deg)`}; }
          }`;
        document.head.appendChild(css);

        // ---- Label ----
        const label = document.createElement('div');
        label.id = 'gg-label';
        label.innerHTML = `
          <div class="ggl-top">
            <div class="ggl-logo-wrap">${logoSrc ? '<img class="ggl-logo" alt="G&amp;G">' : ''}</div>
            <div class="ggl-qr"></div>
            <div class="ggl-num"><b></b><span></span></div>
          </div>
          <div class="ggl-name"></div>
          <div class="ggl-bottom">
            <div class="ggl-box">
              <div class="ggl-boxhead">BOX</div>
              <div class="ggl-boxrow"><i></i><span>OF</span><i></i></div>
            </div>
            <div class="ggl-lines"></div>
          </div>`;
        if (logoSrc) label.querySelector('.ggl-logo').src = logoSrc;
        const qr = qrCopy();
        if (qr) label.querySelector('.ggl-qr').appendChild(qr);
        label.querySelector('.ggl-num b').textContent = orderNum;
        label.querySelector('.ggl-num span').textContent = orderDesc;
        label.querySelector('.ggl-name').textContent = customer;
        const linesBox = label.querySelector('.ggl-lines');
        (lines.length ? lines : ['Job', 'Decorations', 'Counted By']).forEach((t) => {
            const d = document.createElement('div');
            d.className = 'ggl-line';
            d.textContent = t;
            linesBox.appendChild(d);
        });
        src.parentNode.insertBefore(label, src);

        // Long text: shrink until it fits (customer name bar and order number).
        const fit = (el, start, min) => {
            let size = start;
            el.style.fontSize = size + 'px';
            while (el.scrollWidth > el.clientWidth && size > min) { size -= 1; el.style.fontSize = size + 'px'; }
        };
        const fitAll = () => { fit(label.querySelector('.ggl-name'), 58, 18); fit(label.querySelector('.ggl-num b'), 46, 24); };
        fitAll();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
    }

    // The QR code is drawn by Teesom's page script; wait for it (up to ~3 s) before building.
    let tries = 0;
    (function wait() {
        const ready = document.querySelector('#page #containercontent, #page #container svg, #page #container canvas');
        if (ready || ++tries > 30) build(); else setTimeout(wait, 100);
    })();
})();

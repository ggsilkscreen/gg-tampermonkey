// ==UserScript==
// @name         Teesom Traveler - Ordered Checkmarks + PO
// @namespace    ggsilkscreen
// @version      1.0.0
// @description  On the printed shop traveler, ticks the "Ordered" box for every garment that's on a purchase order, and writes the PO # and Vendor Ref next to each item in a handwritten-style font.
// @match        https://app.teesom.com/saiw/print/printordertraveler.aspx*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-traveler-ordered.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-traveler-ordered.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ---- Settings ----------------------------------------------------------
    const INK = '#1a3fa8';          // "pen" color for the handwriting (dark blue)
    const SHOW_VENDOR_REF = true;   // also write the PO's Vendor Ref
    // -----------------------------------------------------------------------

    const LOG = (...a) => console.log('[Traveler Ordered]', ...a);

    // Handwritten-style font (Caveat). Falls back to a cursive system font if it can't load.
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap';
    document.head.appendChild(font);

    const css = document.createElement('style');
    css.textContent = `
      .gg-hand{font-family:'Caveat','Segoe Print','Bradley Hand',cursive;color:${INK};font-weight:700;line-height:1}
      .gg-check{font-size:22px;display:flex;align-items:center;justify-content:center;height:100%}
      .gg-part{font-size:15px}
      .gg-po{font-size:17px;margin-left:10px;white-space:nowrap}
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
                const label = { po: pd.ponumber, ref: (pd.VendorRef || '').trim(), voided: !!pd.voided };
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
        return { qty, poByItem };
    }

    function mark({ qty, poByItem }) {
        // Which option column is "Ordered"?
        const headers = Array.from(document.querySelectorAll('.page-header .page-header-option-wrap'));
        let col = headers.findIndex((h) => /^\s*ordered\s*$/i.test(h.textContent));
        if (col < 0) col = 0;

        let code = '', color = '', itemFirstRow = null, itemPOs = null;
        const flushPO = () => {
            if (!itemFirstRow || !itemPOs || !itemPOs.size) return;
            const host = itemFirstRow.querySelector('.page-row-code');
            if (!host || host.querySelector('.gg-po')) return;
            const txt = Array.from(itemPOs.values()).map((p) => 'PO ' + p.po + (SHOW_VENDOR_REF && p.ref ? ' · Ref ' + p.ref : '')).join('  /  ');
            const s = document.createElement('span');
            s.className = 'gg-hand gg-po';
            s.textContent = txt;
            host.appendChild(s);
        };

        let ticked = 0;
        document.querySelectorAll('.page .page-row').forEach((row) => {
            if (!row.classList.contains('page-job-item-row-type-products')) return;   // garments only
            const codeEl = row.querySelector('.page-row-code-style');
            const colorTxt = (row.querySelector('.page-row-color') || {}).textContent || '';
            if (codeEl && codeEl.textContent.trim()) {                 // a new item starts
                flushPO();
                code = codeEl.textContent.trim();
                itemFirstRow = row;
                itemPOs = new Map();
            }
            if (colorTxt.trim()) color = colorTxt.trim();
            const size = ((row.querySelector('.page-row-size') || {}).textContent || '').trim();
            const rowQty = Number(((row.querySelector('.page-row-qty') || {}).textContent || '').trim()) || 0;
            const k = keyOf(code, color, size);

            (poByItem[k] || []).forEach((p) => itemPOs && itemPOs.set(p.po, p));

            const q = qty[k];
            const box = row.querySelectorAll('.page-row-option')[col];
            if (!box || !q || q.purchased <= 0 || box.querySelector('.gg-hand')) return;
            const full = q.purchased >= (q.needed || rowQty);
            const m = document.createElement('span');
            m.className = 'gg-hand ' + (full ? 'gg-check' : 'gg-check gg-part');
            m.textContent = full ? '✓' : '✓ ' + q.purchased + '/' + (q.needed || rowQty);
            m.title = q.purchased + ' of ' + (q.needed || rowQty) + ' on a PO';
            box.appendChild(m);
            ticked++;
        });
        flushPO();
        LOG('ticked', ticked, 'rows');
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

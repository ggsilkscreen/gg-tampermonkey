// ==UserScript==
// @name         Teesom Reorder Portal
// @namespace    ggsilkscreen
// @version      1.1.0
// @description  Customer reorder portal. On a saved order: a REORDER PORTAL button next to the customer name (their private reorder link) and a PUSH TO PORTAL button on each job (sends just that job's garments, sizes and art to their reorder page). On the Order List: IMPORT REORDER (builds a Teesom quote from a customer's request, linking existing art). Asks once per computer for the portal SETUP CODE.
// @match        https://app.teesom.com/saiw/orderentry.asp*
// @match        https://app.teesom.com/saiw/orderlist.asp*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-reorder-portal.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-reorder-portal.user.js
// ==/UserScript==
(function () {
    'use strict';
    const ON_ORDER = /\/saiw\/orderentry\.asp/i.test(location.pathname) && !!new URLSearchParams(location.search).get('oid');
    const ON_LIST = /\/saiw\/orderlist\.asp/i.test(location.pathname);
    if (!ON_ORDER && !ON_LIST) return;

    // ================================================================
    // REORDER PORTAL - shared pieces for CREATE PORTAL / PUSH TO PORTAL
    // (open order) and IMPORT REORDER (Order List). The portal is a Google
    // Apps Script web app; its address and key come from a one-time SETUP
    // CODE (run showSetupInfo() in the Apps Script project to see it).
    // ================================================================
    function rpSetup(forceAsk) {
        let raw = forceAsk ? '' : GM_getValue('reorder_portal_setup', '');
        if (!raw) {
            raw = (window.prompt('One-time setup: paste the Reorder Portal SETUP CODE (ask Ross):', '') || '').trim();
            if (!raw) return null;
            GM_setValue('reorder_portal_setup', raw);
        }
        try {
            const c = JSON.parse(atob(raw));
            if (!c.url || !c.secret) throw new Error('bad');
            return c;
        } catch (e) {
            GM_setValue('reorder_portal_setup', '');
            alert('That setup code was not right. Click the button again and paste the whole code.');
            return null;
        }
    }
    GM_registerMenuCommand('Set Reorder Portal setup code', () => rpSetup(true));

    function reorderApi(action, payload) {
        return new Promise((resolve, reject) => {
            const cfg = rpSetup(false);
            if (!cfg) return reject(new Error('The Reorder Portal setup code is not set.'));
            GM_xmlhttpRequest({
                method: 'POST', url: cfg.url,
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                data: JSON.stringify(Object.assign({ secret: cfg.secret, action }, payload || {})),
                onload: (r) => {
                    let j = null;
                    try { j = JSON.parse(r.responseText); } catch (e) { j = null; }
                    if (!j) return reject(new Error('The portal did not answer (HTTP ' + r.status + '). Check the web app is deployed with access set to Anyone.'));
                    if (!j.ok) return reject(new Error(j.error || 'The portal refused the request.'));
                    resolve(j);
                },
                onerror: () => reject(new Error('Could not reach the Reorder Portal.'))
            });
        });
    }

    // Popup with a running log. Returns { body, log, panel, close }.
    function rpDialog(title) {
        const old = document.getElementById('tm-reorder-modal'); if (old) old.remove();
        const overlay = document.createElement('div'); overlay.id = 'tm-reorder-modal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
        const panel = document.createElement('div');
        panel.style.cssText = 'background:#fff;width:640px;max-width:95vw;max-height:90vh;overflow:auto;border-radius:6px;padding:18px 20px;box-shadow:0 8px 30px rgba(0,0,0,.4);color:#222;font-size:13px;';
        const h = document.createElement('div'); h.textContent = title; h.style.cssText = 'font-size:18px;font-weight:bold;margin-bottom:8px;color:#163C5C;';
        const body = document.createElement('div');
        const logEl = document.createElement('div');
        logEl.style.cssText = 'display:none;background:#f6f6f6;padding:8px;border-radius:4px;max-height:220px;overflow:auto;white-space:pre-wrap;font:12px monospace;margin-top:10px;';
        const foot = document.createElement('div'); foot.style.cssText = 'display:flex;justify-content:flex-end;margin-top:12px;';
        const close = document.createElement('button'); close.textContent = 'Close';
        close.style.cssText = 'padding:7px 14px;border:1px solid #bbb;background:#f5f5f5;border-radius:3px;cursor:pointer;';
        close.addEventListener('click', () => overlay.remove());
        foot.appendChild(close); panel.appendChild(h); panel.appendChild(body); panel.appendChild(logEl); panel.appendChild(foot);
        overlay.appendChild(panel); document.body.appendChild(overlay);
        return { body, panel, close: () => overlay.remove(), log: (m) => { logEl.style.display = 'block'; logEl.textContent += m + '\n'; logEl.scrollTop = logEl.scrollHeight; } };
    }

    function rpLinkBox(ui, link) {
        const wrap = document.createElement('div'); wrap.style.cssText = 'margin-top:10px;';
        wrap.innerHTML = '<div style="font-weight:bold;margin-bottom:4px;">Customer\'s private reorder link:</div>';
        const inp = document.createElement('input'); inp.type = 'text'; inp.readOnly = true; inp.value = link;
        inp.style.cssText = 'width:100%;box-sizing:border-box;padding:6px;border:1px solid #bbb;border-radius:3px;font:12px monospace;';
        inp.addEventListener('focus', () => inp.select());
        const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;align-items:center;margin-top:8px;';
        const copy = document.createElement('button'); copy.textContent = 'Copy link';
        copy.style.cssText = 'padding:7px 14px;border:0;background:#073763;color:#fff;border-radius:3px;cursor:pointer;';
        const said = document.createElement('span');
        copy.addEventListener('click', () => {
            const done = () => { said.textContent = 'Copied.'; }, manual = () => { inp.focus(); inp.select(); said.textContent = 'Press Ctrl+C to copy.'; };
            try { navigator.clipboard.writeText(link).then(done, manual); } catch (e) { manual(); }
        });
        const open = document.createElement('a'); open.href = link; open.target = '_blank'; open.rel = 'noopener noreferrer'; open.textContent = 'Open the page';
        row.appendChild(copy); row.appendChild(open); row.appendChild(said);
        wrap.appendChild(inp); wrap.appendChild(row); ui.body.appendChild(wrap);
    }

    // ---- Reads the open order (read-only) ----
    // Teesom's ajax endpoints only answer the page's own jQuery, so everything goes through unsafeWindow.jQuery.
    function rpPost(url, data) {
        return new Promise((resolve, reject) => unsafeWindow.jQuery.ajax({
            url, type: 'POST', dataType: 'text', data: new URLSearchParams(data).toString(),
            success: resolve, error: (x) => reject(new Error('Teesom request failed (' + x.status + ') ' + (data.ajxaction || url)))
        }));
    }
    const rpTxt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
    const rpOwn = (e) => (e ? Array.from(e.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim() || rpTxt(e) : '');
    const rpAttr = (e, a) => (e && e.getAttribute(a)) || '';
    const rpEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function rpCustomer() {
        const nameEl = document.getElementById('orderentrycompanyname'), contEl = document.getElementById('ciname');
        const repSel = document.getElementById('salesrepchange');
        const c = {
            compId: rpAttr(nameEl, 'dbid'), name: rpOwn(nameEl),
            code: rpTxt(document.getElementById('tag-orderentry-customer-account-number')),
            contId: rpAttr(contEl, 'dbid'), contact: rpOwn(contEl),
            rep: repSel && repSel.selectedOptions[0] ? rpTxt(repSel.selectedOptions[0]) : ''
        };
        if (!c.compId || !c.name) throw new Error('Could not read the customer from this order.');
        return c;
    }
    // The customer's contacts with phone and email (for the contact dropdown on their reorder page).
    async function rpContacts(cust) {
        try {
            const html = await rpPost('adm_getdata.asp', { ajxaction: 'selectcustomercontact', srep: 'y', strs: cust.name });
            const d = document.createElement('div'); d.innerHTML = html;
            const list = [...d.querySelectorAll('[cmpid][ciname]')].filter((e) => e.getAttribute('cmpid') === cust.compId).map((e) => ({
                contId: e.getAttribute('dbid'), name: (e.getAttribute('ciname') || '').trim(),
                email: (e.getAttribute('myemal') || '').trim(), phone: (e.getAttribute('mycell') || e.getAttribute('cphone') || '').trim()
            })).filter((c) => c.name);
            // the order's contact first
            list.sort((a, b) => (b.contId === cust.contId) - (a.contId === cust.contId));
            return list;
        } catch (e) { return []; }
    }
    function rpOrderInfo() {
        const oid = new URLSearchParams(location.search).get('oid');
        const no = rpTxt(document.getElementById('ordernumber')).replace(/^#/, '');
        if (!oid || !no) throw new Error('Open a saved order first.');
        return { oid, no, title: rpOwn(document.getElementById('ciodescription')) };
    }

    // Jobs on the order: [{ key, name, garmentRows, designRows }] (rows are DOM elements from Teesom's order detail)
    async function rpOrderJobs(oid) {
        const html = await rpPost('adm_getdata.asp', { ajxaction: 'getorderdetail', orderlink: oid, screen_width: 1920, screen_height: 1040 });
        const d = document.createElement('div'); d.innerHTML = html;
        const jobs = []; let job = null;
        d.querySelectorAll('.jcwtblheaderrow_orderentry[dbid], .order-detail-row').forEach((e) => {
            if (e.classList.contains('jcwtblheaderrow_orderentry')) {
                job = { key: e.getAttribute('dbid'), name: rpTxt(e.querySelector('.row-job span')) || rpTxt(e.querySelector('.row-job')) || 'Job ' + (jobs.length + 1), rows: [] };
                jobs.push(job); return;
            }
            const c = e.querySelector('.jcwcol[dbid]'); if (!c || !job) return;
            job.rows.push({ el: e, group: c.getAttribute('jgroup'), dbid: c.getAttribute('dbid'), master: c.getAttribute('imptpe') });
        });
        return jobs.map((j) => Object.assign(j, {
            garmentCount: j.rows.filter((r) => r.group === 'products').length,
            designCount: j.rows.filter((r) => r.group === 'imprints').length
        }));
    }

    // Full detail for one job: garments (every size the color comes in, with last quantities) and artwork.
    async function rpJobDetail(oid, job, log) {
        const normColor = (s) => String(s || '').replace(/\s+-\s+[A-Za-z0-9]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const normSize = (s) => String(s || '').toUpperCase().replace(/\s/g, '');
        const cleanName = (desc, code) => String(desc || '').replace(new RegExp('[\\s.,-]*' + String(code).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '').replace(/\s+/g, ' ').trim();
        const out = { key: job.key, name: job.name, garments: [], designs: [] }, byKey = {};
        for (const r of job.rows) {
            if (r.group !== 'products' && r.group !== 'imprints') continue;
            const q = JSON.parse(await rpPost('adm_getdata.asp', { ajxaction: 'loadorderdetailrowquickamounts', dbid: r.dbid, ord: oid }));
            const img = rpAttr(r.el.querySelector('[lgimg]'), 'lgimg');
            if (r.group === 'products') {
                const k = r.master + '|' + q.code + '|' + q.color;
                let g = byKey[k];
                if (!g) { g = byKey[k] = { style: q.code, name: cleanName(q.description, q.code), color: q.color, catalog: rpTxt(r.el.querySelector('[title="Catalog Used"]')), img: /^https?:/i.test(img) && !/uflx\.net/i.test(img) ? img : '', master: r.master, _last: {} }; out.garments.push(g); }
                const sk = normSize(q.size);
                g._last[sk] = { size: q.size, last: ((g._last[sk] || {}).last || 0) + (Number(q.qty) || 0) };
            } else {
                const loose = Array.from(r.el.querySelectorAll('.label')).filter((x) => !x.getAttribute('title')).map(rpTxt);
                const abs = (u) => { try { return u ? new URL(u, location.href).href : ''; } catch (e) { return ''; } };
                const imgs = [];
                [rpAttr(r.el.querySelector('[lgimg]'), 'lgimg')].concat(Array.from(r.el.querySelectorAll('[imgurl]')).map((x) => x.getAttribute('imgurl')))
                    .map(abs).filter((u) => /^https?:/i.test(u) && !/\.svg(\?|$)/i.test(u)).forEach((u) => { if (!imgs.includes(u)) imgs.push(u); });
                out.designs.push({
                    number: rpTxt(r.el.querySelector('a.btneditartact')) || q.code, name: rpTxt(r.el.querySelector('.lbllinedescription')),
                    type: r.master || q.imprinttype || '', location: loose.find((t) => / - /.test(t)) || '', img: imgs[0] || '', imgs
                });
            }
        }
        // Every size the color comes in, so customers can add sizes they didn't order last time.
        const ITEM = 'apc/catalogs/item_load.ashx';
        for (const g of out.garments) {
            if (log) log('  sizes for ' + g.style + ' ' + g.color + '...');
            let det = null;
            try { det = JSON.parse(await rpPost(ITEM, { ajxaction: 'load-detail-item', dbid: g.master, basicsonly: true })); } catch (e) { det = null; }
            if (!det || !det.items) {
                try {
                    const res = JSON.parse(await rpPost(ITEM, { ajxaction: 'load-item-swap-items-search', search: g.style, catalogid: '' }));
                    const hit = res.find((x) => String(x.code).toUpperCase() === String(g.style).toUpperCase());
                    if (hit) det = JSON.parse(await rpPost(ITEM, { ajxaction: 'load-detail-item', dbid: hit.link, basicsonly: true }));
                } catch (e) { det = null; }
            }
            const col = det && det.items ? det.items.find((i) => normColor(i.color) === normColor(g.color)) : null;
            const seen = {};
            g.sizes = (col ? col.sizes : []).map((s) => { const k = normSize(s.size); seen[k] = true; return { size: s.size, last: g._last[k] ? g._last[k].last : 0 }; });
            Object.keys(g._last).forEach((k) => { if (!seen[k]) g.sizes.push(g._last[k]); });
            if (!g.img && col && col.image) g.img = col.image;
            delete g._last; delete g.master;
        }
        return out;
    }

    // CREATE PORTAL: makes (or finds) the customer's portal and shows their link. Nothing in Teesom changes.
    async function rpCreatePortal() {
        const ui = rpDialog('Customer Reorder Portal');
        try {
            const cust = rpCustomer();
            ui.body.innerHTML = '<div>Customer: <b>' + rpEsc(cust.name) + '</b>' + (cust.contact ? ' (' + rpEsc(cust.contact) + ')' : '') + '</div><div style="margin-top:6px;color:#555;">Working...</div>';
            cust.contacts = await rpContacts(cust);
            const r = await reorderApi('createPortal', { customer: cust });
            ui.body.innerHTML = '<div>Customer: <b>' + rpEsc(r.customer) + '</b></div><div style="margin-top:6px;">' +
                (r.isNew ? 'Portal created.' : 'This customer already has a portal.') + ' Jobs on it: <b>' + r.jobs + '</b>' +
                (r.jobs ? '' : ' &middot; use the purple <b>PUSH</b> button on a job to add it.') + '</div>';
            rpLinkBox(ui, r.link);
        } catch (err) {
            console.error('[Reorder Portal]', err);
            ui.log('STOPPED: ' + err.message);
        }
    }

    // PUSH TO PORTAL (button on a job's header): sends only that job's garments + artwork to the customer's portal.
    async function rpPushJob(jobKey) {
        const ui = rpDialog('Push job to the Reorder Portal');
        try {
            const cust = rpCustomer(), order = rpOrderInfo();
            ui.body.innerHTML = '<div>Reading order #' + rpEsc(order.no) + '...</div>';
            const [jobs, onPortal] = await Promise.all([
                rpOrderJobs(order.oid),
                reorderApi('listJobs', { compId: cust.compId }).catch(() => ({ jobs: [] }))
            ]);
            const idx = jobs.findIndex((j) => j.key === jobKey);
            const job = jobs[idx];
            if (!job) throw new Error('Could not find that job on the order. Save the order and try again.');
            if (!job.garmentCount) throw new Error('This job has no garments to reorder.');
            const on = (onPortal.jobs || []).some((j) => j.id === cust.compId + '|' + order.no + '|' + job.key);
            ui.body.innerHTML = '<div>Customer: <b>' + rpEsc(cust.name) + '</b> &middot; Order <b>#' + rpEsc(order.no) + '</b></div>' +
                '<div style="margin:10px 0;padding:8px 10px;border:1px solid #ddd;border-radius:4px;"><b>Job ' + (idx + 1) + ': ' + rpEsc(job.name) + '</b><br><small style="color:#555;">' +
                job.garmentCount + ' garment line(s), ' + job.designCount + ' art' + (on ? ' &middot; <span style="color:#1a891c;">already on the portal - pushing again updates it</span>' : '') + '</small></div>' +
                '<button id="rp-go" style="padding:8px 16px;border:0;background:#990099;color:#fff;border-radius:3px;cursor:pointer;font-weight:bold;">' + (on ? 'Update on portal' : 'Push to portal') + '</button>';
            ui.body.querySelector('#rp-go').onclick = async function () {
                this.disabled = true; this.style.opacity = '.5';
                try {
                    ui.log('Reading ' + job.name + '...');
                    const d = await rpJobDetail(order.oid, job, ui.log);
                    if (!d.designs.length) ui.log('  note: no artwork on this job');
                    d.designs.filter((x) => !x.img).forEach((x) => ui.log('  note: art ' + x.number + ' has no image'));
                    ui.log('Sending to the portal...');
                    cust.contacts = await rpContacts(cust);
                    const r = await reorderApi('pushJobs', { customer: cust, order: { no: order.no, title: order.title }, jobs: [d] });
                    ui.log('\nDone. ' + (r.added ? 'Job added' : 'Job updated') + '. ' + r.customer + ' now has ' + r.jobs + ' job(s) on their page.' + (r.isNew ? ' (New portal created.)' : ''));
                    rpLinkBox(ui, r.link);
                } catch (err) {
                    console.error('[Reorder Portal]', err);
                    ui.log('\nSTOPPED: ' + err.message);
                }
            };
        } catch (err) {
            console.error('[Reorder Portal]', err);
            ui.log('STOPPED: ' + err.message);
        }
    }

    // ================= Teesom order-building helpers (same as IMPORT CHIPPLY) =================
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
    // Exact match on the design number only (SCR-ABC-12 must not pick up its duplicate SCR-ABC-12-1).
    const want = String(dn).trim().toUpperCase();
    const hits = [...d.querySelectorAll('.imprint_select_body[dbid]')].filter(e => {
      const code = e.querySelector('.imprint_select_code');
      return code ? code.textContent.trim().toUpperCase() === want : false;
    });
    if (hits.length !== 1) return { ok: false, why: hits.length ? hits.length + ' imprints have the exact number ' + dn : 'design ' + dn + ' not found' };
    await adm({ ajxaction: 'addimptoord', basicinfostickyordernumber: orderid, orderentrycompanyname: compid, implfnj: jobid, inpatitmj: hits[0].getAttribute('dbid') });
    return { ok: true, dn };
  }


  function rpCss() {
    const s = document.createElement('style');
    s.textContent = `
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


  // ================================================================
  // IMPORT REORDER - builds a Teesom quote from a customer's Reorder
  // Portal request. Uses the same steps as IMPORT CHIPPLY. Existing art
  // is linked by design number (no new artwork). Teesom prices the
  // garments and decoration from its own price lists; setup charges that
  // Teesom adds are set to $0 (no screen charges on reorders).
  // ================================================================
  const RE_SETUP = /^(DIGI|SCREEN|SCRN|SET ?UP|ART\b|ART -|INK|CUSTOM LOGO|THREAD|SHAVEOUT)/i;

  async function teesomOrderNo(orderid) {
    try {
      const html = await new Promise((res, rej) => W.jQuery.ajax({ url: 'orderentry.asp?oid=' + orderid, type: 'GET', dataType: 'text', success: res, error: x => rej(x) }));
      const d = document.createElement('div'); d.innerHTML = html;
      const el = d.querySelector('#ordernumber');
      return el ? el.textContent.replace(/[^0-9]/g, '') : '';
    } catch (e) { return ''; }
  }

  async function runReorderImport(req, pick, log) {
    const R = req.request;
    const from = [...new Set(R.jobs.map(j => j.orderNo))];
    const orderDesc = 'REORDER of #' + from.join(', #');
    log('Creating quote "' + orderDesc + '" for ' + pick.custName + ' / ' + pick.contName + '...');
    const created = JSON.parse(await adm({
      ajxaction: 'createneworder', compid: pick.compid, contid: pick.contid, orderid: pick.orderid,
      orderdescription: orderDesc, jobdescription: R.jobs[0].name, customerpo: ''
    }));
    if (!created.success) throw new Error('Teesom did not create the order.');
    const orderid = pick.orderid, problems = [];
    if (req.teesom.rep) {
      try { const m = await setSalesRep(orderid, req.teesom.rep); if (m) problems.push(m); else log('Sales rep set (' + req.teesom.rep + ')'); }
      catch (e) { problems.push('sales rep: ' + e.message); }
    }
    for (let i = 0; i < R.jobs.length; i++) {
      const j = R.jobs[i];
      const pcs = j.items.reduce((a, it) => a + it.sizes.reduce((x, s) => x + s[1], 0), 0);
      log('Job ' + (i + 1) + ': ' + j.name + ' (' + pcs + ' pcs)');
      if (i > 0) await addJob(orderid, j.name);
      const jobid = (await jobIds(orderid))[i];
      if (!jobid) { problems.push('Could not find job for ' + j.name); continue; }
      for (const it of j.items) {
        const r = await addItem(orderid, jobid, it);
        if (!r.ok) problems.push(j.name + ': ' + it.style + ' ' + it.color + ' - ' + r.why);
        else if (r.miss.length) problems.push(j.name + ': ' + it.style + ' ' + it.color + ' - sizes not added: ' + r.miss.join(','));
      }
      for (const d of j.designs) {
        let l = await linkImprint(orderid, jobid, pick.compid, d.number);
        if (l.ok) log('  art ' + d.number + ' linked');
        else problems.push(j.name + ': art ' + d.number + ' not linked - ' + l.why + '. Link it by hand.');
      }
    }
    try {
      for (const r of (await orderRows(orderid)).filter(r => /^(othercharge|additionalcharges|imprints)$/.test(r.group) && RE_SETUP.test(r.text))) {
        await setPrice(orderid, r, 0); log('  setup charge set to $0: ' + r.text.slice(0, 40));
      }
    } catch (e) { problems.push('setup charges: ' + e.message); }
    const no = await teesomOrderNo(orderid);
    return { orderid, no, problems };
  }

  function openReorderDialog() {
    const ov = document.createElement('div'); ov.id = 'cip-ov';
    ov.innerHTML = '<div id="cip-box"></div>';
    document.body.appendChild(ov);
    const box = ov.querySelector('#cip-box');
    const close = () => ov.remove();
    let list = [], item = null, pick = null;

    const step1 = async () => {
      box.innerHTML = '<h3>Import Reorder</h3><div id="cip-msg">Loading reorder requests...</div><div class="row"><button class="sec" id="cip-x">Close</button></div>';
      box.querySelector('#cip-x').onclick = close;
      const msg = box.querySelector('#cip-msg');
      try { list = (await reorderApi('pending')).requests; }
      catch (e) { msg.innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; return; }
      if (!list.length) { msg.textContent = 'No reorder requests are waiting.'; return; }
      msg.innerHTML = '<table><tr><th>Customer</th><th>Pieces</th><th>Sent</th><th>Need by</th><th></th></tr>' +
        list.map((r, i) => '<tr><td>' + (r.request.rush ? '<b class="bad">RUSH</b> ' : '') + esc(r.customer) + '<br><small>' + esc(r.request.name) + '</small></td><td>' + r.pieces + '</td><td>' +
          esc(new Date(r.submitted).toLocaleString()) + '</td><td>' + esc(r.neededBy || '-') + '</td><td><button data-i="' + i + '">Open</button></td></tr>').join('') + '</table>';
      msg.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => { item = list[+b.dataset.i]; step2(); });
    };

    const step2 = async () => {
      const R = item.request;
      const done = GM_getValue('rpbuilt_' + item.id, '');
      const rows = R.jobs.map(j => '<tr><td>' + esc(j.name) + '<br><small>#' + esc(j.orderNo) + ' &middot; ' + j.designs.map(d => esc(d.number)).join(', ') + '</small></td><td>' +
        j.items.map(it => esc(it.style + ' ' + it.color) + ': ' + it.sizes.map(s => esc(s[0]) + ' x' + s[1]).join(', ')).join('<br>') + '</td></tr>').join('');
      box.innerHTML = '<h3>' + esc(item.customer) + ' &nbsp;<small>' + esc(item.id) + '</small></h3>' +
        '<div class="row">From <b>' + esc(R.name) + '</b> &lt;' + esc(R.email) + '&gt;' + (R.phone ? ' &middot; ' + esc(R.phone) : '') + '<br>' + item.pieces + ' pieces &middot; need by ' + esc(R.neededBy || 'standard turnaround') + '</div>' +
        (R.rush ? '<div class="row bad"><b>RUSH:</b> needed by ' + esc(R.neededBy) + ', before the standard 2-week turnaround (' + esc(R.standardDate || '') + ').</div>' : '') +
        (R.notes ? '<div class="row"><b>Customer notes:</b> ' + esc(R.notes) + '</div>' : '') +
        (done ? '<div class="row warn">Already built on ' + esc(done) + '. Building again makes a second order.</div>' : '') +
        '<table><tr><th>Job / art</th><th>Garments</th></tr>' + rows + '</table>' +
        '<div id="cip-cres" class="row">Finding the Teesom customer...</div>' +
        '<div class="row"><button class="sec" id="cip-back">Back</button> <button class="sec" id="cip-x">Close</button></div>';
      box.querySelector('#cip-x').onclick = close;
      box.querySelector('#cip-back').onclick = step1;
      const res = box.querySelector('#cip-cres');
      const showSearch = (q, note) => {
        res.innerHTML = (note ? '<div class="warn">' + esc(note) + '</div>' : '') + 'Find Teesom customer: <input type="text" id="cip-cq" value="' + esc(q) + '"> <button id="cip-cs">Search</button><div id="cip-hits"></div>';
        const go = async () => {
          const hits = res.querySelector('#cip-hits'); hits.textContent = 'Searching...';
          const found = await searchCustomers(res.querySelector('#cip-cq').value.trim());
          if (!found.customers.length) { hits.innerHTML = '<span class="warn">No customers found. Try a shorter name.</span>'; return; }
          hits.innerHTML = found.customers.map((c, ci) => '<div class="cust"><b>' + esc(c.name) + '</b><br>' +
            c.contacts.map((k, ki) => '<button data-c="' + ci + '" data-k="' + ki + '">' + esc(k.name) + '</button>').join('') + '</div>').join('');
          hits.querySelectorAll('button[data-c]').forEach(b => b.onclick = () => {
            const c = found.customers[+b.dataset.c], k = c.contacts[+b.dataset.k];
            pick = { compid: c.compid, contid: k.contid, custName: c.name, contName: k.name, orderid: found.orderid };
            step3();
          });
        };
        res.querySelector('#cip-cs').onclick = go; go();
      };
      // The portal remembers the Teesom customer and contact it was made from, so normally there is nothing to pick.
      try {
        const found = await searchCustomers(item.customer);
        const c = found.customers.find(x => x.compid === item.teesom.compId);
        const k = c && (c.contacts.find(x => x.contid === item.teesom.contId) || (c.contacts.length === 1 ? c.contacts[0] : null));
        if (c && k) {
          pick = { compid: c.compid, contid: k.contid, custName: c.name, contName: k.name, orderid: found.orderid };
          res.innerHTML = 'Teesom customer: <b>' + esc(c.name) + '</b> (' + esc(k.name) + ') <button id="cip-ok">Use this</button> <button class="sec" id="cip-other">Pick another</button>';
          res.querySelector('#cip-ok').onclick = step3;
          res.querySelector('#cip-other').onclick = () => showSearch(item.customer);
        } else showSearch(item.customer, c ? 'Pick the contact for this order.' : 'Could not match the customer automatically.');
      } catch (e) { showSearch(item.customer, e.message); }
    };

    const step3 = () => {
      const R = item.request;
      box.innerHTML = '<h3>Create reorder quote</h3><div class="row">Customer: <b>' + esc(pick.custName) + '</b> (' + esc(pick.contName) + ')<br>Description: <b>REORDER of #' + esc([...new Set(R.jobs.map(j => j.orderNo))].join(', #')) + '</b><br>Jobs: ' + R.jobs.length + ' &middot; ' + item.pieces + ' pieces</div>' +
        '<button id="cip-run">Create in Teesom</button> <button class="sec" id="cip-back">Back</button> <button class="sec" id="cip-x">Close</button><div id="cip-log"></div>';
      box.querySelector('#cip-x').onclick = close;
      box.querySelector('#cip-back').onclick = step2;
      const logEl = box.querySelector('#cip-log');
      const log = m => { logEl.textContent += m + '\n'; logEl.scrollTop = logEl.scrollHeight; };
      box.querySelector('#cip-run').onclick = async function () {
        this.disabled = true; box.querySelector('#cip-back').disabled = true;
        try {
          const r = await runReorderImport(item, pick, log);
          GM_setValue('rpbuilt_' + item.id, new Date().toLocaleString());
          try { await reorderApi('markBuilt', { id: item.id, teesomOrder: r.no }); log('Marked as built in the portal.'); }
          catch (e) { log('Built, but the portal was not updated: ' + e.message); }
          log('\nDone' + (r.no ? ': order #' + r.no : '') + '.');
          if (r.problems.length) log('\nNEEDS A LOOK:\n - ' + r.problems.join('\n - '));
          else log('No problems reported.');
          log('Prices come from Teesom\'s price lists - check them before sending the quote.');
          if (R.neededBy) log((R.rush ? 'RUSH - ' : '') + 'Customer needs it by ' + R.neededBy + ' - set the due date.');
          if (R.notes) log('Customer notes: ' + R.notes);
          log('Customer email: ' + R.email + (R.phone ? ' / ' + R.phone : ''));
          const a = document.createElement('a'); a.href = 'orderentry.asp?oid=' + r.orderid; a.textContent = 'Open the new order';
          a.style.cssText = 'display:inline-block;margin-top:8px;font-weight:bold'; box.appendChild(a);
        } catch (e) { log('\nSTOPPED: ' + e.message + '\nCheck Teesom for a partly built order before retrying.'); }
      };
    };
    step1();
  }


    // ================= Buttons =================
    const btnCss = document.createElement('style');
    btnCss.textContent = `
      .rp-pill{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:2px 9px;border:0;border-radius:10px;background:#990099;color:#fff;font:bold 11px Arial,sans-serif;cursor:pointer;vertical-align:middle;line-height:16px}
      .rp-pill:hover{background:#770077}
      .rp-job{display:inline-flex;align-items:center;justify-content:center;margin:auto 6px;padding:3px 7px;border:1px solid rgba(255,255,255,.6);border-radius:3px;background:#990099;color:#fff;font:bold 10px Arial,sans-serif;cursor:pointer;white-space:nowrap;line-height:12px}
      .rp-job:hover{background:#770077}
      @media print{.rp-pill,.rp-job,#tm-reorder-bar{display:none!important}}`;
    document.head.appendChild(btnCss);

    // Teesom redraws the customer bar and the job list after edits, so keep putting the buttons back.
    function rpInjectOrderButtons() {
        const name = document.getElementById('orderentrycompanyname');
        if (name && name.parentElement && !name.parentElement.querySelector('.rp-pill')) {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'rp-pill'; b.textContent = 'REORDER PORTAL'; b.title = "Create / open this customer's reorder portal";
            b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); rpCreatePortal(); });
            const after = name.parentElement.querySelector('.btneditcustomerabout') || document.getElementById('tag-orderentry-customer-account-number') || name;
            after.insertAdjacentElement('afterend', b);
        }
        document.querySelectorAll('.jcwtblheaderrow_orderentry[dbid]').forEach((h) => {
            const cell = h.querySelector(':scope > .jcwcol');
            if (!cell || cell.querySelector('.rp-job')) return;
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'rp-job'; b.textContent = 'PUSH'; b.title = 'Push this job to the customer\'s reorder portal';
            b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); rpPushJob(h.getAttribute('dbid')); });
            cell.appendChild(b);
        });
    }

    // IMPORT REORDER goes in the Teesom Buttons bar when that script is installed, otherwise in its own bar.
    function rpListButton() {
        if (document.getElementById('rp-btn-import')) return;
        const b = document.createElement('button');
        b.type = 'button'; b.id = 'rp-btn-import'; b.textContent = 'IMPORT REORDER';
        b.style.cssText = 'padding:5px 15px;background:#990099;color:#fff;border:1px solid #770077;border-radius:3px;cursor:pointer;font-size:12px;font-weight:bold;display:inline-block;box-shadow:0 2px 4px rgba(0,0,0,.2);';
        b.onmouseover = () => { b.style.backgroundColor = '#770077'; };
        b.onmouseout = () => { b.style.backgroundColor = '#990099'; };
        b.addEventListener('click', openReorderDialog);
        let bar = document.getElementById('tm-manual-btn-bar');
        if (!bar) {
            bar = document.createElement('div'); bar.id = 'tm-reorder-bar';
            bar.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:999998;display:flex;gap:10px;';
            document.body.appendChild(bar);
            setInterval(() => {
                const open = document.querySelector('.modal.in, .modal.show') || document.body.classList.contains('jcw-slideout-open') || document.getElementById('cip-ov');
                bar.style.display = open ? 'none' : 'flex';
            }, 500);
        }
        bar.appendChild(b);
    }

    if (ON_ORDER) {
        rpInjectOrderButtons();
        setInterval(rpInjectOrderButtons, 1000);
    }
    if (ON_LIST) {
        rpCss();
        setTimeout(rpListButton, 1200);   // give the Teesom Buttons script time to build its bar first
    }
})();

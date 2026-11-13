window.__rptest3 = async function(oid){ const unsafeWindow=window;
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
            const raw = JSON.parse(await rpPost('adm_getdata.asp', { ajxaction: 'get_customer_contacts_json', cid: cust.compId }));
            const list = (Array.isArray(raw) ? raw : []).map((c) => ({
                contId: String(c.id || ''), name: String(c.name || '').trim(),
                email: String(c.email || '').trim(), phone: String(c.cell || c.phone || '').trim()
            })).filter((c) => c.name && !/@ggsilkscreen\.com$/i.test(c.email));   // leave out our own staff
            list.sort((a, b) => (b.contId === cust.contId) - (a.contId === cust.contId));   // the order's contact first
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
                // Prefer the art's own Zoomed + Placement images (the ones tagged in the art window), not the quote image.
                const dnum = rpTxt(r.el.querySelector('a.btneditartact')) || q.code;
                const better = await rpArtImages(rpAttr(r.el.querySelector('[artid]'), 'artid'), dnum, abs);
                if (better.length) imgs.splice(0, imgs.length, ...better);
                // never send Teesom's "no image" placeholder
                for (let k = imgs.length - 1; k >= 0; k--) if (/noimage/i.test(imgs[k])) imgs.splice(k, 1);
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

    // Zoomed + Placement pictures for an art. Duplicated art (SCR-ABC-12-1) often keeps its pictures on the
    // original (SCR-ABC-12), so if the copy has none, look at the original.
    async function rpArtImages(artId, designNo, abs) {
        const W = unsafeWindow;
        if (typeof W.APIBasicPost !== 'function') return [];
        const load = async (id) => {
            try { let res = await W.APIBasicPost('Art/Images/Load', { artId: id }); if (typeof res === 'string') res = JSON.parse(res); return (res && res.response) || null; }
            catch (e) { return null; }
        };
        const artIdFor = async (dn) => {
            try {
                const fd = new FormData(); fd.append('search_value', dn);
                const j = await (await fetch('https://capi.teesom.com/GlobalSearch', { method: 'POST', body: fd, credentials: 'include' })).json();
                const hit = (j.response || []).find((x) => x.type === 'Art' && String(x.title).toUpperCase() === String(dn).toUpperCase());
                return hit ? hit.id : '';
            } catch (e) { return ''; }
        };
        const pick = (R, pins) => {
            if (!R || !Array.isArray(R.images) || !R.images.length) return [];
            const url = (id) => { const f = id && R.images.find((x) => x.link === id); return f ? abs(f.full_path) : ''; };
            let out = [url(pins.z) || abs(R.pinnedZoomedUrl || ''), url(pins.p) || abs(R.pinnedPlacementUrl || '')].filter(Boolean);
            if (!out.length) out = R.images.filter((x) => x.link !== pins.q).map((x) => abs(x.full_path)).filter(Boolean).slice(0, 2);
            return out.filter((u, i) => out.indexOf(u) === i && !/noimage/i.test(u));
        };
        const first = artId ? await load(artId) : null;
        const pins = { z: first && first.pinnedZoomed, p: first && first.pinnedPlacement, q: first && first.pinnedQuote };
        let got = pick(first, pins);
        if (got.length < 2 && /-\d+$/.test(String(designNo)) && /^[A-Z]{3}-[A-Z0-9]+-\d+-\d+$/i.test(String(designNo))) {
            const baseId = await artIdFor(String(designNo).replace(/-\d+$/, ''));
            const base = baseId ? await load(baseId) : null;
            const basePins = { z: (base && base.pinnedZoomed) || pins.z, p: (base && base.pinnedPlacement) || pins.p, q: (base && base.pinnedQuote) || pins.q };
            const more = pick(base, basePins);
            if (more.length > got.length) got = more;
        }
        return got;
    }


 const jobs=await rpOrderJobs(oid); const out=[];
 for (const j of jobs.filter(j=>j.garmentCount)) { const d=await rpJobDetail(oid,j,null); out.push(d.designs.map(x=>x.imgs.length+':'+x.imgs.map(u=>/noimage/i.test(u)?'NOIMG':'ok').join('/')).join(' ; ')); }
 return out.join('\n');
};
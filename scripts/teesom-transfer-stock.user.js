// ==UserScript==
// @name         Teesom Transfer Stock Lookup V9.23
// @namespace    http://tampermonkey.net/
// @version      3.0.1
// @description  For Heat Press line items that have their own design number link (HTP-...), looks up that design on ggh.nacoteds.com/transfers/find/<design> and shows Total/In Stock/Reserved boxes color-coded by whether Total covers the needed quantity. Companion lines (Patch Cost, Setup, etc.) with no design link are skipped. Fallbacks for logged-out, no-transfer (404) and lookup errors.
// @author       You
// @match        https://app.teesom.com/saiw/orderentry.asp*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      ggh.nacoteds.com
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-transfer-stock.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-transfer-stock.user.js
// ==/UserScript==
(function() {
    'use strict';

    const TRANSFER_FIND_BASE_URL = 'https://ggh.nacoteds.com/transfers/find/';
    const INVENTORY_DASHBOARD_URL = 'https://ggh.nacoteds.com/dashboard';
    const LINK_NOW_URL = 'https://ggh.nacoteds.com/transfers';
    // If the transfers page supports a search query in the URL, put the param
    // name here (e.g. 'search' or 'q'). Leave '' to just open /transfers and
    // copy the design number to the clipboard so it can be pasted into search.
    const TRANSFERS_SEARCH_PARAM = '';

    const SIMULATE_NO_TRANSFER = false; // testing only

    function findHeatPressRowMarkers() {
        return Array.from(document.querySelectorAll('[imptpe="heatpressing"]'));
    }

    function findRowQtyBox(marker) {
        const rowId = marker.id;
        if (!rowId) return null;
        return document.querySelector(`[tid="${rowId}"].btnoenonlineqty`);
    }

    // Only returns a design number if the design link lives inside THIS row.
    // Climbs from the marker, but stops (returns null) as soon as an ancestor
    // contains more than one heat press marker - that means we've left this
    // row and entered a container shared with other lines (e.g. Patch Cost).
    function findDesignNumberForRow(marker) {
        let el = marker;
        for (let i = 0; i < 10 && el; i++) {
            el = el.parentElement;
            if (!el) break;
            if (el.querySelectorAll('[imptpe="heatpressing"]').length > 1) return null;
            const matches = el.querySelectorAll('a.btndupadmineditart');
            if (matches.length === 1) return matches[0].textContent.trim();
        }
        return null;
    }

    function parseQty(text) {
        const n = parseInt((text || '').replace(/[^\d.-]/g, ''), 10);
        return isNaN(n) ? null : n;
    }

    function makeNativeBox(text) {
        const box = document.createElement('div');
        box.className = 'label label-default fonw-n fons-12 tm-stock-box';
        box.textContent = text;
        box.style.marginTop = '4px';
        box.style.display = 'block';
        return box;
    }

    function makeNativeLinkBox(text, url) {
        const box = document.createElement('a');
        box.className = 'label label-default fonw-n fons-12 tm-stock-box';
        box.textContent = text;
        box.href = url;
        box.target = '_blank';
        box.rel = 'noopener noreferrer';
        box.style.marginTop = '4px';
        box.style.display = 'block';
        box.style.textDecoration = 'none';
        box.style.cursor = 'pointer';
        return box;
    }

    function makeLinkNowBox(designNumber) {
        let url = LINK_NOW_URL;
        if (TRANSFERS_SEARCH_PARAM) {
            url += '?' + TRANSFERS_SEARCH_PARAM + '=' + encodeURIComponent(designNumber);
        }
        const box = makeNativeLinkBox('Link Now', url);
        box.title = 'Opens transfers - design ' + designNumber + ' copied to clipboard';
        box.addEventListener('click', function() {
            try { GM_setClipboard(designNumber); } catch (e) {}
        });
        return box;
    }

    // ---- Create New (send artwork to ggh.nacoteds.com) ---------------------
    const CREATE_ENDPOINT = 'https://ggh.nacoteds.com/api/artworks';
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

    // Decoration Process drives Production Unit Type: picking a process fills
    // in its unit word automatically (not an editable field on its own).
    const DECORATION_PROCESS_OPTIONS = [
        { label: 'Embroidery', unitType: 'Stitches' },
        { label: 'Screen Print', unitType: 'Prints' },
        { label: 'Heat Press', unitType: 'Presses' }
    ];
    // HTP-prefixed designs default to Heat Press. Other prefixes are left
    // blank for now - expand this map later as other prefixes are added.
    function defaultDecorationProcess(designNumber) {
        if (/^HTP/i.test(designNumber || '')) return 'Heat Press';
        return '';
    }
    // Production Unit Count defaults to 3 for every design, per Ross - not
    // scraped from the order line's quantity.
    const DEFAULT_PRODUCTION_UNIT_COUNT = 3;

    function scrapeArtworkForRow(marker, designNumber) {
        const row = marker.closest('.order-detail-row');
        const text = sel => (row.querySelector(sel)?.textContent || '').trim();
        const qtyBox = findRowQtyBox(marker);
        // Decoration process = the "Sales Category" label on the row (e.g. "Heat Press")
        const processLabel = (row.querySelector('span.label[title="Sales Category"]')?.textContent || '').trim();
        // The art thumbnail is a CSS background on .imgoeline (not an <img>).
        let imageUrl = null;
        const thumb = row.querySelector('.imgoeline');
        if (thumb) {
            const mm = getComputedStyle(thumb).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
            if (mm) imageUrl = mm[1];
        }
        // Customer display name (e.g. "Duxbury Shellfish Farm") from the order header
        const customerName = (document.getElementById('orderentrycompanyname')?.textContent || '').trim() || null;
        // Account number kept only for reference in the popup, not sent.
        const customerAccount = (document.getElementById('tag-orderentry-customer-account-number')?.textContent || '').trim() || null;
        const qty = qtyBox ? parseQty(qtyBox.textContent) : null;
        const artId = row.querySelector('a.btndupadmineditart')?.getAttribute('dbid') || null;

        return {
            artId: artId,
            payload: {
                customer_name: customerName,
                artwork_name: designNumber,
                // decoration_process defaults by design number prefix; production_unit_type
                // is derived from it in the popup (not independently editable).
                decoration_process: defaultDecorationProcess(designNumber),
                production_unit_count: DEFAULT_PRODUCTION_UNIT_COUNT,
                description: text('p.lbllinedescription') || null // e.g. "Rope Patch Hat"
                // Other optional fields (artwork_size, artwork_colors, setup_for,
                // designer) come from the art record or are entered by hand.
            },
            imageUrl: imageUrl, // sent as JSON 'image_url' - a link, not a file upload
            // rowQty is the order line's actual quantity, shown for reference only -
            // production_unit_count defaults to 3 regardless (see DEFAULT_PRODUCTION_UNIT_COUNT).
            meta: { customerAccount, processLabel, placement: text('.dropdown-toggle.cp'), rowQty: qty }
        };
    }

    function makeCreateNewBox(marker, designNumber) {
        const box = document.createElement('a');
        box.className = 'label label-default fonw-n fons-12 tm-stock-box';
        box.textContent = 'Create New';
        box.href = '#';
        box.style.marginTop = '4px';
        box.style.display = 'block';
        box.style.textDecoration = 'none';
        box.style.cursor = 'pointer';
        box.title = 'Create this artwork in the inventory system';
        box.addEventListener('click', async function(e) {
            e.preventDefault();
            if (box.dataset.busy) return;
            box.dataset.busy = '1';
            const label = box.textContent;
            box.textContent = 'Loading art details...';
            const scraped = scrapeArtworkForRow(marker, designNumber);
            try {
                const details = await fetchArtDetails(scraped.artId);
                applyArtDetails(scraped, details);
            } catch (err) {
                console.error('[Stock Lookup] art detail lookup failed - continuing with row data only', err);
            }
            box.textContent = label;
            delete box.dataset.busy;
            openCreateModal(scraped);
        });
        return box;
    }

    // ---- Extra art data from Teesom's art API (same calls the art panel makes)
    // POST multipart form with artId; uses the logged-in Teesom session cookie.
    const TEESOM_API = 'https://capi.teesom.com/';
    const DESIGNER_FALLBACK = ['Erin', 'Jack', 'Nicole', 'Ricky', 'Ross'];

    async function teesomPost(path, artId) {
        const fd = new FormData();
        if (artId) fd.append('artId', artId);
        const r = await fetch(TEESOM_API + path, { method: 'POST', body: fd, credentials: 'include' });
        if (!r.ok) throw new Error(path + ' HTTP ' + r.status);
        return (await r.json()).response;
    }

    async function fetchArtDetails(artId) {
        if (!artId) return null;
        const settle = p => p.then(v => v, err => { console.error('[Stock Lookup]', err); return null; });
        const [art, colors, images, stages] = await Promise.all([
            settle(teesomPost('Art/Load', artId)),
            settle(teesomPost('Art/Colors/Load', artId)),
            settle(teesomPost('Art/Images/Load', artId)),
            settle(teesomPost('Art/Options/Stages', null))
        ]);
        return { art, colors, images, stages };
    }

    function applyArtDetails(scraped, d) {
        if (!d) return;
        const art = d.art || {};

        // Designer = the art "Stage" (Teesom uses stage to record who worked on it).
        if (art.stage_name && !/^\s*1\./.test(art.stage_name)) scraped.payload.designer = art.stage_name;
        const names = Array.isArray(d.stages)
            ? d.stages.map(s => s.description).filter(n => n && !/^\s*1\./.test(n))
            : [];
        scraped.designerOptions = names.length ? names : DESIGNER_FALLBACK;

        // Size: measurements, else actual size, else height x width when set.
        const w = parseFloat(art.width), h = parseFloat(art.height);
        const size = (art.measurements || '').trim() || (art.actualsize || '').trim() ||
            ((w > 0 || h > 0) ? (h + ' x ' + w) : '');
        if (size) scraped.payload.artwork_size = size;

        // Colors: shape not fully known, so accept strings or objects defensively.
        if (Array.isArray(d.colors) && d.colors.length) {
            const cols = d.colors.map(c => typeof c === 'string' ? c :
                (c.name || c.description || c.colorname || c.code || c.label || '')).filter(Boolean);
            if (cols.length) scraped.payload.artwork_colors = cols;
        }

        // Images: full-size files attached to the art. Default = the art's main image,
        // sent as image_url (a link) - the endpoint fetches it itself.
        const imgs = (d.images && d.images.images || []).filter(i => i.imagefile === 'y' && i.full_path);
        if (imgs.length) {
            scraped.images = imgs.map(i => ({ name: i.filename, url: i.full_path, id: i.link }));
            const main = imgs.find(i => i.link === art.image1) || imgs[0];
            scraped.imageUrl = main.full_path;
        }

        scraped.meta.imprintLocation = art.location_name || null;
        scraped.meta.imprintType = art.imprinttype || null;
        scraped.meta.priceList = art.pricelist_code || null;
        scraped.meta.unitType = art.unittype || null;
    }

    // Confirmation popup: every field is editable before anything is sent.
    // Field definitions mirror the endpoint's validation rules.
    const CREATE_FIELDS = [
        { key: 'artwork_name', label: 'Artwork name *', type: 'text', max: 255 },
        { key: 'customer_name', label: 'Customer name *', type: 'text', max: 255, hint: 'account' },
        { key: 'decoration_process', label: 'Decoration Process *', type: 'decoration-process' },
        { key: 'production_unit_count', label: 'Production unit count * (>= 1)', type: 'number' },
        { key: 'artwork_size', label: 'Artwork size', type: 'text', max: 255 },
        { key: 'artwork_colors', label: 'Artwork colors (comma separated)', type: 'text' },
        { key: 'setup_for', label: 'Setup for', type: 'select', options: ['', 'Light', 'Dark'] },
        { key: 'description', label: 'Description (max 1000)', type: 'textarea', max: 1000 },
        { key: 'designer', label: 'Designer (from art stage)', type: 'select', options: ['', 'Erin', 'Jack', 'Nicole', 'Ricky', 'Ross'], dynamic: 'designerOptions' }
    ];
    const REQUIRED_KEYS = ['customer_name', 'artwork_name', 'decoration_process', 'production_unit_type', 'production_unit_count'];

    function openCreateModal(scraped) {
        const existing = document.getElementById('tm-create-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'tm-create-modal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
        const panel = document.createElement('div');
        panel.style.cssText = 'background:#fff;width:560px;max-width:95vw;max-height:90vh;overflow:auto;border-radius:6px;padding:18px 20px;box-shadow:0 8px 30px rgba(0,0,0,.4);color:#222;';
        overlay.appendChild(panel);

        const h = document.createElement('div');
        h.textContent = 'artwork_creation';
        h.style.cssText = 'font-size:18px;font-weight:bold;margin-bottom:4px;';
        panel.appendChild(h);
        const sub = document.createElement('div');
        sub.textContent = 'Review and edit before sending. Fields marked * are required.';
        sub.style.cssText = 'font-size:12px;color:#666;margin-bottom:12px;';
        panel.appendChild(sub);

        if (scraped.imageUrl) {
            const im = document.createElement('img');
            im.src = scraped.imageUrl;
            im.style.cssText = 'max-height:110px;max-width:200px;border:1px solid #ccc;margin-bottom:6px;display:block;';
            panel.appendChild(im);
            if (scraped.images && scraped.images.length > 1) {
                const isel = document.createElement('select');
                isel.style.cssText = 'margin-bottom:10px;padding:4px;font-size:12px;max-width:100%;';
                scraped.images.forEach(i => {
                    const op = document.createElement('option');
                    op.value = i.url; op.textContent = 'Image: ' + i.name;
                    if (i.url === scraped.imageUrl) op.selected = true;
                    isel.appendChild(op);
                });
                isel.addEventListener('change', () => { scraped.imageUrl = isel.value; im.src = isel.value; });
                panel.appendChild(isel);
            }
        }

        const inputs = {};
        CREATE_FIELDS.forEach(f => {
            const wrap = document.createElement('div');
            wrap.style.marginBottom = '8px';
            const lab = document.createElement('label');
            lab.textContent = f.label;
            lab.style.cssText = 'display:block;font-size:12px;font-weight:bold;margin-bottom:2px;';
            wrap.appendChild(lab);

            let inp;
            if (f.type === 'textarea') {
                inp = document.createElement('textarea'); inp.rows = 3;
            } else if (f.type === 'select') {
                inp = document.createElement('select');
                let opts = (f.dynamic && scraped[f.dynamic]) ? [''].concat(scraped[f.dynamic]) : f.options.slice();
                const cur = scraped.payload[f.key];
                if (cur && opts.indexOf(cur) === -1) opts.push(cur); // keep a scraped value even if not in the list
                opts.forEach(o => { const op = document.createElement('option'); op.value = o; op.textContent = o || '(none)'; inp.appendChild(op); });
            } else if (f.type === 'decoration-process') {
                inp = document.createElement('select');
                const blank = document.createElement('option'); blank.value = ''; blank.textContent = '(choose)'; inp.appendChild(blank);
                DECORATION_PROCESS_OPTIONS.forEach(o => { const op = document.createElement('option'); op.value = o.label; op.textContent = o.label; inp.appendChild(op); });
            } else {
                inp = document.createElement('input'); inp.type = f.type;
                if (f.type === 'number') inp.min = '1';
            }
            if (f.max && f.type !== 'select' && f.type !== 'decoration-process') inp.maxLength = f.max;
            inp.style.cssText = 'width:100%;box-sizing:border-box;padding:5px;font-size:13px;border:1px solid #bbb;border-radius:3px;';

            let v = scraped.payload[f.key];
            if (Array.isArray(v)) v = v.join(', ');
            inp.value = (v === null || v === undefined) ? '' : v;
            inputs[f.key] = inp;
            wrap.appendChild(inp);

            if (f.hint === 'account') {
                const n = document.createElement('div');
                n.textContent = 'Teesom account number: ' + (scraped.meta.customerAccount || '(not found)');
                n.style.cssText = 'font-size:11px;color:#666;margin-top:2px;';
                wrap.appendChild(n);
            }

            // Decoration Process drives Production Unit Type. The unit field is
            // shown read-only right under it, not independently editable.
            if (f.type === 'decoration-process') {
                const unitLab = document.createElement('label');
                unitLab.textContent = 'Production Unit Type *';
                unitLab.style.cssText = 'display:block;font-size:12px;font-weight:bold;margin:6px 0 2px;';
                wrap.appendChild(unitLab);

                const unitField = document.createElement('input');
                unitField.type = 'text';
                unitField.readOnly = true;
                unitField.style.cssText = 'width:100%;box-sizing:border-box;padding:5px;font-size:13px;border:1px solid #bbb;border-radius:3px;background:#f0f0f0;color:#444;';
                inputs['production_unit_type'] = unitField;
                wrap.appendChild(unitField);

                function syncUnitType() {
                    const opt = DECORATION_PROCESS_OPTIONS.find(o => o.label === inp.value) || null;
                    unitField.value = opt ? opt.unitType : '';
                }
                inp.addEventListener('change', syncUnitType);
                syncUnitType();
            }
            panel.appendChild(wrap);
        });

        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:12px;margin:8px 0;min-height:16px;color:#b71c1c;';
        panel.appendChild(msg);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
        const cancel = document.createElement('button');
        cancel.textContent = 'Cancel';
        cancel.style.cssText = 'padding:7px 14px;border:1px solid #bbb;background:#f5f5f5;border-radius:3px;cursor:pointer;';
        const send = document.createElement('button');
        send.textContent = 'Send';
        send.style.cssText = 'padding:7px 14px;border:0;background:#ad1457;color:#fff;border-radius:3px;cursor:pointer;';
        btnRow.appendChild(cancel); btnRow.appendChild(send);
        panel.appendChild(btnRow);

        function collect() {
            const out = {};
            CREATE_FIELDS.forEach(f => {
                let v = inputs[f.key].value.trim();
                if (v === '') return; // blank optional fields are omitted
                if (f.type === 'number') v = parseInt(v, 10);
                if (f.key === 'artwork_colors') v = v.split(',').map(s => s.trim()).filter(Boolean);
                out[f.key] = v;
            });
            // Production Unit Type is derived from Decoration Process, not its
            // own editable field (sends the unit word, e.g. "Presses").
            if (inputs.production_unit_type) {
                const put = inputs.production_unit_type.value.trim();
                if (put !== '') out.production_unit_type = put;
            }
            if (scraped.imageUrl) out.image_url = scraped.imageUrl;
            return out;
        }

        cancel.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('mousedown', e => { if (e.target === overlay) overlay.remove(); });
        send.addEventListener('click', function() {
            const data = collect();
            const missing = REQUIRED_KEYS.filter(k => data[k] === undefined || (typeof data[k] === 'number' && isNaN(data[k])));
            if (missing.length) { msg.style.color = '#b71c1c'; msg.textContent = 'Missing required: ' + missing.join(', '); return; }
            if (data.production_unit_count < 1) { msg.textContent = 'Production unit count must be at least 1.'; return; }
            console.log('[Stock Lookup] Create New confirmed payload:', data, 'image:', scraped.imageUrl);
            showPayloadPreview(panel, overlay, scraped, data);
        });

        document.body.appendChild(overlay);
    }

    // Second popup screen: shows exactly what would be sent, as JSON text.
    function showPayloadPreview(panel, overlay, scraped, data) {
        panel.textContent = '';

        const h = document.createElement('div');
        h.textContent = 'Payload Preview';
        h.style.cssText = 'font-size:18px;font-weight:bold;margin-bottom:4px;';
        panel.appendChild(h);
        const sub = document.createElement('div');
        sub.textContent = CREATE_ENDPOINT
            ? 'This is what will be sent. Nothing has been sent yet.'
            : 'This is what would be sent. Nothing has been sent - no endpoint is configured yet.';
        sub.style.cssText = 'font-size:12px;color:#666;margin-bottom:10px;';
        panel.appendChild(sub);

        const preview = {
            name: 'artwork_creation',
            endpoint: CREATE_ENDPOINT || '(not set)',
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ***' },
            body: data,
            scraped_from_teesom: scraped.meta
        };
        const ta = document.createElement('textarea');
        ta.value = JSON.stringify(preview, null, 2);
        ta.readOnly = true;
        ta.spellcheck = false;
        ta.style.cssText = 'width:100%;box-sizing:border-box;height:340px;font-family:Consolas,monospace;font-size:12px;padding:8px;border:1px solid #bbb;border-radius:3px;background:#f7f7f7;resize:vertical;';
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
        const back = mkBtn('Back to Edit', 'border:1px solid #bbb;background:#f5f5f5;');
        const copy = mkBtn('Copy JSON', 'border:1px solid #bbb;background:#f5f5f5;');
        const close = mkBtn('Close', 'border:1px solid #bbb;background:#f5f5f5;');
        const confirm = mkBtn(CREATE_ENDPOINT ? 'Confirm & Send' : 'Confirm & Send (endpoint not set)', 'border:0;background:#ad1457;color:#fff;');
        if (!CREATE_ENDPOINT) { confirm.disabled = true; confirm.style.opacity = '.5'; confirm.style.cursor = 'not-allowed'; }
        row.appendChild(back); row.appendChild(copy); row.appendChild(close); row.appendChild(confirm);
        panel.appendChild(row);

        back.addEventListener('click', function() {
            const payload = Object.assign({}, data); // includes decoration_process / production_unit_type derived in the form
            overlay.remove();
            openCreateModal({ payload: payload, imageUrl: scraped.imageUrl, images: scraped.images, designerOptions: scraped.designerOptions, meta: scraped.meta });
        });
        copy.addEventListener('click', function() {
            try { GM_setClipboard(ta.value); msg.textContent = 'Copied to clipboard.'; }
            catch (e) { ta.select(); msg.textContent = 'Select-all done - press Ctrl+C.'; }
        });
        close.addEventListener('click', () => overlay.remove());
        confirm.addEventListener('click', function() {
            if (!CREATE_ENDPOINT || confirm.disabled) return;
            confirm.disabled = true;
            confirm.style.opacity = '.6';
            const prevLabel = confirm.textContent;
            confirm.textContent = 'Sending...';
            msg.style.color = '#666';
            msg.textContent = 'Sending to ' + CREATE_ENDPOINT + ' ...';

            GM_xmlhttpRequest({
                method: 'POST',
                url: CREATE_ENDPOINT,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + ggApiToken()
                },
                data: JSON.stringify(data),
                onload: function(response) {
                    confirm.disabled = false;
                    confirm.style.opacity = '1';
                    confirm.textContent = prevLabel;
                    console.log('[Stock Lookup] Create New response:', response.status, response.responseText);
                    if (response.status >= 200 && response.status < 300) {
                        msg.style.color = '#2e7d32';
                        msg.textContent = 'Sent successfully (HTTP ' + response.status + '). See console for the full response.';
                    } else if (response.status === 401 || response.status === 403) {
                        msg.style.color = '#b71c1c';
                        msg.textContent = 'Not authorized (HTTP ' + response.status + '). Check the API token.';
                    } else if (response.status === 422 || response.status === 400) {
                        msg.style.color = '#b71c1c';
                        msg.textContent = 'Rejected (HTTP ' + response.status + '): ' + response.responseText.slice(0, 400);
                    } else {
                        msg.style.color = '#b71c1c';
                        msg.textContent = 'Unexpected response (HTTP ' + response.status + ') - see console.';
                    }
                },
                onerror: function(err) {
                    confirm.disabled = false;
                    confirm.style.opacity = '1';
                    confirm.textContent = prevLabel;
                    console.error('[Stock Lookup] Create New request failed:', err);
                    msg.style.color = '#b71c1c';
                    msg.textContent = 'Request failed - see console (this may be a CORS/@connect issue).';
                }
            });
        });
    }

    const COLORS = {
        strongGreen: { bg: '#2e7d32', fg: '#ffffff' },
        lightGreen:  { bg: '#c8e6c9', fg: '#1b5e20' },
        strongRed:   { bg: '#c62828', fg: '#ffffff' },
        lightRed:    { bg: '#ffcdd2', fg: '#b71c1c' },
        strongPink:  { bg: '#ad1457', fg: '#ffffff' },
        lightPink:   { bg: '#f8bbd0', fg: '#880e4f' },
        gray:        { bg: '#e0e0e0', fg: '#424242' }
    };

    function applyColor(box, colorObj) {
        box.style.backgroundColor = colorObj.bg;
        box.style.color = colorObj.fg;
    }

    // status: 'ok' | 'logged-out' | 'no-transfer' | 'error'
    function injectRowState(marker, status, data, designNumber) {
        const qtyBox = findRowQtyBox(marker);
        if (!qtyBox) {
            console.error('[Stock Lookup] could not find qty box for row', marker.id);
            return;
        }
        const container = qtyBox.parentElement;
        if (container.querySelector('.tm-stock-box')) return; // no duplicates

        if (status === 'logged-out') {
            const loginBox = makeNativeLinkBox('Inventory Login', INVENTORY_DASHBOARD_URL);
            applyColor(loginBox, COLORS.strongPink);
            qtyBox.insertAdjacentElement('afterend', loginBox);
            return;
        }

        if (status === 'error') {
            const errBox = makeNativeBox('Stock: ?');
            errBox.title = 'Inventory lookup failed for ' + designNumber + ' - see console';
            applyColor(errBox, COLORS.gray);
            qtyBox.insertAdjacentElement('afterend', errBox);
            return;
        }

        if (status === 'no-transfer') {
            const availableBox = makeNativeBox('In Stock: N/A');
            const createNewBox = makeCreateNewBox(marker, designNumber);
            const linkNowBox = makeLinkNowBox(designNumber);
            applyColor(availableBox, COLORS.lightPink);
            applyColor(createNewBox, COLORS.strongPink);
            applyColor(linkNowBox, COLORS.strongPink);
            qtyBox.insertAdjacentElement('afterend', linkNowBox);
            qtyBox.insertAdjacentElement('afterend', createNewBox);
            qtyBox.insertAdjacentElement('afterend', availableBox);
            return;
        }

        // status === 'ok'
        const neededQty = parseQty(qtyBox.textContent);
        const totalQty = parseQty(data.total);

        const availableBox = makeNativeBox('In Stock: ' + data.available);
        const reservedBox = makeNativeBox('Reserved: ' + data.reserved);
        const totalBox = makeNativeLinkBox('Total: ' + data.total, data.transferUrl);

        if (neededQty !== null && totalQty !== null) {
            const covered = totalQty >= neededQty;
            applyColor(totalBox, covered ? COLORS.strongGreen : COLORS.strongRed);
            applyColor(availableBox, covered ? COLORS.lightGreen : COLORS.lightRed);
            applyColor(reservedBox, covered ? COLORS.lightGreen : COLORS.lightRed);
        } else {
            console.error('[Stock Lookup] could not determine qty for coloring - row', marker.id, { neededQty, totalQty });
        }

        qtyBox.insertAdjacentElement('afterend', totalBox);
        qtyBox.insertAdjacentElement('afterend', reservedBox);
        qtyBox.insertAdjacentElement('afterend', availableBox);
    }

    function looksLoggedOut(doc, response) {
        if (doc.querySelector('input[type="password"]')) return true;
        const finalUrl = (response.finalUrl || '').toLowerCase();
        return finalUrl.includes('login') || finalUrl.includes('signin') || finalUrl.includes('sign-in');
    }

    function fetchTransferData(designNumber, callback) {
        const url = TRANSFER_FIND_BASE_URL + encodeURIComponent(designNumber) + '?_=' + Date.now();
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
            onload: function(response) {
                if (response.status === 404) { callback('no-transfer', null); return; }
                if (response.status >= 400) {
                    console.error('[Stock Lookup] HTTP', response.status, 'for', designNumber);
                    callback('error', null);
                    return;
                }
                const doc = new DOMParser().parseFromString(response.responseText, 'text/html');
                if (looksLoggedOut(doc, response)) { callback('logged-out', null); return; }

                const availableEl = doc.querySelector('.c-transfer-quantity__value.text-success');
                const reservedEl = doc.querySelector('.c-transfer-quantity__value.text-warning');
                const totalEl = doc.querySelector('.c-transfer-quantity__value.text-secondary');

                if (availableEl && reservedEl && totalEl) {
                    callback('ok', {
                        available: availableEl.textContent.trim(),
                        reserved: reservedEl.textContent.trim(),
                        total: totalEl.textContent.trim(),
                        transferUrl: response.finalUrl || url
                    });
                } else {
                    console.error('[Stock Lookup] unexpected page content for', designNumber);
                    callback('error', null);
                }
            },
            onerror: function(err) {
                console.error('[Stock Lookup] fetch failed for', designNumber, err);
                callback('error', null);
            }
        });
    }

    function tryInject() {
        const markers = findHeatPressRowMarkers();
        if (markers.length === 0) return false;

        markers.forEach(marker => {
            const designNumber = findDesignNumberForRow(marker);
            if (!designNumber) {
                // Companion line (Patch Cost, Setup, etc.) - intentionally skipped.
                console.log('[Stock Lookup] no design link on row', marker.id, '- skipped');
                return;
            }
            if (SIMULATE_NO_TRANSFER) {
                injectRowState(marker, 'no-transfer', null, designNumber);
                return;
            }
            fetchTransferData(designNumber, function(status, data) {
                injectRowState(marker, status, data, designNumber);
            });
        });
        return true;
    }

    const interval = setInterval(() => {
        if (tryInject()) clearInterval(interval);
    }, 300);
    setTimeout(() => clearInterval(interval), 15000);
})();
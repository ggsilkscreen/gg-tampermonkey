// ==UserScript==
// @name         Teesom Transfer Stock Lookup 10.1
// @namespace    http://tampermonkey.net/
// @version      3.5.1
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

        // Print location = the placement dropdown label on the row (e.g. "Breast - Left")
        const printLocation = text('.dropdown-toggle.cp') || null;

        return {
            artId: artId,
            payload: {
                customer_name: customerName,
                account_number: customerAccount,
                artwork_name: designNumber,
                // decoration_process defaults by design number prefix; production_unit_type
                // is derived from it in the popup (not independently editable).
                decoration_process: defaultDecorationProcess(designNumber),
                production_unit_count: DEFAULT_PRODUCTION_UNIT_COUNT,
                print_location: printLocation, // e.g. "Breast - Left"
                description: text('p.lbllinedescription') || null // e.g. "Rope Patch Hat"
                // Other optional fields (artwork_size, artwork_colors, setup_for,
                // designer) come from the art record or are entered by hand.
            },
            imageUrl: imageUrl, // sent as JSON 'image_url' - a link, not a file upload
            // rowQty is the order line's actual quantity, shown for reference only -
            // production_unit_count defaults to 3 regardless (see DEFAULT_PRODUCTION_UNIT_COUNT).
            meta: { customerAccount, processLabel, placement: printLocation, rowQty: qty }
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
            scraped.marker = marker;
            scraped.designNumber = designNumber;
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

    // Fallback only: if, for some reason, Art/Load didn't give us a size
    // (see applyArtDetails below - that's the normal path and needs no
    // panel to be open), and the art-v2 slideout happens to already be open
    // on the page, read its live Measurements spec row directly
    // (e.g. <div class="spec-label">Measurements</div> next to
    // <div class="spec-value">3.5 x 3 in</div>), inside a block titled
    // "Actual" or "Estimated". Prefers "Actual".
    function readArtPanelMeasurements() {
        const blocks = Array.from(document.querySelectorAll('.art-v2-spec-block'));
        function findIn(titleWanted) {
            const block = blocks.find(b => (b.querySelector('.art-v2-spec-block-title')?.textContent || '').trim().toLowerCase() === titleWanted);
            if (!block) return null;
            const item = Array.from(block.querySelectorAll('.jcw-slideout-spec-item'))
                .find(it => (it.querySelector('.spec-label')?.textContent || '').trim().toLowerCase() === 'measurements');
            const v = (item?.querySelector('.spec-value')?.textContent || '').trim();
            return (v && v !== '—' && v !== '-') ? v : null;
        }
        return findIn('actual') || findIn('estimated');
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

        // Size: Art/Load returns both an "Estimated" measurements string and
        // an "Actual" one (actualsize), matching the two spec blocks shown in
        // the art-v2 panel. useactualspeconreorder is Teesom's own flag for
        // which one should be trusted going forward, so honor it; otherwise
        // prefer the estimated measurements, then actual, then height x width.
        const w = parseFloat(art.width), h = parseFloat(art.height);
        const measurements = (art.measurements || '').trim();
        const actualSize = (art.actualsize || '').trim();
        const useActual = (art.useactualspeconreorder || '').trim().toLowerCase() === 'y';
        const size = (useActual && actualSize) ? actualSize :
            (measurements || actualSize || ((w > 0 || h > 0) ? (h + ' x ' + w) : ''));
        if (size) scraped.payload.artwork_size = size;

        // Last resort only: Art/Load gave us nothing, but the art-v2 slideout
        // happens to already be open on the page - read its live value.
        if (!scraped.payload.artwork_size) {
            const domSize = readArtPanelMeasurements();
            if (domSize) scraped.payload.artwork_size = domSize;
        }

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
        { key: 'customer_name', label: 'Customer name *', type: 'text', max: 255 },
        { key: 'account_number', label: 'Account number', type: 'text', max: 255 },
        { key: 'decoration_process', label: 'Decoration Process *', type: 'decoration-process' },
        { key: 'production_unit_count', label: 'Production unit count * (0 = artwork exists, none in stock)', type: 'number' },
        { key: 'print_location', label: 'Print location', type: 'text', max: 255 },
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
                if (f.type === 'number') inp.min = '0';
            }
            if (f.max && f.type !== 'select' && f.type !== 'decoration-process') inp.maxLength = f.max;
            inp.style.cssText = 'width:100%;box-sizing:border-box;padding:5px;font-size:13px;border:1px solid #bbb;border-radius:3px;';

            let v = scraped.payload[f.key];
            if (Array.isArray(v)) v = v.join(', ');
            inp.value = (v === null || v === undefined) ? '' : v;
            inputs[f.key] = inp;
            wrap.appendChild(inp);

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
            if (send.disabled) return;
            const data = collect();
            const missing = REQUIRED_KEYS.filter(k => data[k] === undefined || (typeof data[k] === 'number' && isNaN(data[k])));
            if (missing.length) { msg.style.color = '#b71c1c'; msg.textContent = 'Missing required: ' + missing.join(', '); return; }
            if (data.production_unit_count < 0) { msg.style.color = '#b71c1c'; msg.textContent = 'Production unit count cannot be negative.'; return; }
            if (!CREATE_ENDPOINT) { msg.style.color = '#b71c1c'; msg.textContent = 'No endpoint configured.'; return; }
            console.log('[Stock Lookup] Create New sending payload:', data, 'image:', scraped.imageUrl);

            send.disabled = true;
            cancel.disabled = true;
            send.style.opacity = '.6';
            const prevLabel = send.textContent;
            send.textContent = 'Sending...';
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
                    console.log('[Stock Lookup] Create New response:', response.status, response.responseText);
                    if (response.status >= 200 && response.status < 300) {
                        overlay.remove();
                        if (scraped.marker && scraped.designNumber) {
                            refreshRowStock(scraped.marker, scraped.designNumber);
                        }
                        return;
                    }
                    send.disabled = false;
                    cancel.disabled = false;
                    send.style.opacity = '1';
                    send.textContent = prevLabel;
                    msg.style.color = '#b71c1c';
                    if (response.status === 401 || response.status === 403) {
                        msg.textContent = 'Not authorized (HTTP ' + response.status + '). Check the API token.';
                    } else if (response.status === 422 || response.status === 400) {
                        msg.textContent = 'Rejected (HTTP ' + response.status + '): ' + response.responseText.slice(0, 400);
                    } else {
                        msg.textContent = 'Unexpected response (HTTP ' + response.status + ') - see console.';
                    }
                },
                onerror: function(err) {
                    console.error('[Stock Lookup] Create New request failed:', err);
                    send.disabled = false;
                    cancel.disabled = false;
                    send.style.opacity = '1';
                    send.textContent = prevLabel;
                    msg.style.color = '#b71c1c';
                    msg.textContent = 'Request failed - see console (this may be a CORS/@connect issue).';
                }
            });
        });

        document.body.appendChild(overlay);
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

    // ggh.nacoteds.com renders Total/Available/Reserved as three
    // ".c-transfer-quantity__card" boxes, each with a ".c-transfer-quantity__label"
    // ("Total" / "Available" / "Reserved") and a ".c-transfer-quantity__value".
    // The *color class* on the value (text-success / text-warning / text-secondary)
    // depends on state, not on which field it is - e.g. for a brand new transfer
    // that hasn't been counted yet, Total shows "Not counted" and Available shows
    // "—", and BOTH use text-secondary (no text-success at all until it's counted).
    // So we match by label text, not by color, and that works in every state.
    function findQtyCardValue(doc, labelWanted) {
        const cards = doc.querySelectorAll('.c-transfer-quantity__card');
        for (const card of cards) {
            const label = (card.querySelector('.c-transfer-quantity__label')?.textContent || '').trim().toLowerCase();
            if (label === labelWanted) {
                const el = card.querySelector('.c-transfer-quantity__value');
                return el ? el.textContent.trim() : null;
            }
        }
        return null;
    }

    // A freshly-created transfer that hasn't been counted yet shows "Not
    // counted" / "—" instead of a number. Treat that the same as 0 in stock -
    // the artwork exists, there's just nothing counted/available for it yet.
    function normalizeQtyText(raw) {
        if (raw === null) return null;
        const t = raw.trim();
        if (t === '' || t === '—' || t === '-' || /^not counted$/i.test(t)) return '0';
        return t;
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

                const totalRaw = findQtyCardValue(doc, 'total');
                const availableRaw = findQtyCardValue(doc, 'available');
                const reservedRaw = findQtyCardValue(doc, 'reserved');

                if (totalRaw !== null && availableRaw !== null && reservedRaw !== null) {
                    callback('ok', {
                        available: normalizeQtyText(availableRaw),
                        reserved: normalizeQtyText(reservedRaw),
                        total: normalizeQtyText(totalRaw),
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

    // Re-runs the inventory lookup for one row in place (no page reload) -
    // used right after Create New succeeds, so the row immediately swaps its
    // "In Stock: N/A / Create New / Link Now" boxes for the real new numbers.
    function refreshRowStock(marker, designNumber) {
        const qtyBox = findRowQtyBox(marker);
        if (!qtyBox) return;
        const container = qtyBox.parentElement;
        container.querySelectorAll('.tm-stock-box').forEach(b => b.remove());
        fetchTransferData(designNumber, function(status, data) {
            injectRowState(marker, status, data, designNumber);
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
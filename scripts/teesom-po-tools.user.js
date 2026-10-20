// ==UserScript==
// @name         Teesom Create PO Tools v9.23
// @namespace    http://tampermonkey.net/
// @version      2.4.1
// @description  Adds an invoice filter and "Show All" under Buy From in the Teesom Create PO popup
// @author       You
// @match        https://app.teesom.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-po-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-po-tools.user.js
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '2.4';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const getModal = () => document.getElementById('modal-po-create');

  // Open every "Click here to view breakdown" row that is still closed
  async function expandAll(modal) {
    const toggles = modal.querySelectorAll('.po-create-item-showhide');
    for (const t of toggles) {
      if (!t.checked) { t.click(); await sleep(60); }
    }
    await sleep(600);
  }

  // Show All: open every breakdown and make sure every breakdown box is checked
  async function showAll(setStatus) {
    const modal = getModal(); if (!modal) return;
    setStatus('Opening breakdowns...');
    await expandAll(modal);
    let n = 0;
    modal.querySelectorAll('.po-create-item-row-subrows .po-create-subrow-checkbox').forEach(cb => {
      if (!cb.checked) { cb.click(); n++; }
    });
    setStatus(`All open. Checked ${n} more box(es).`);
  }

  // Invoice number for a breakdown line (from the "#19310" link)
  function invoiceOf(cb) {
    const sub = cb.closest('.po-create-subrow');
    const a = sub && sub.querySelector('.po-create-subrow-info a');
    return a ? a.textContent.replace(/\D/g, '') : '';
  }

  // Keep Only These: check only the typed invoices, uncheck everything else
  async function keepOnly(raw, setStatus) {
    const modal = getModal(); if (!modal) return;
    const wanted = raw.split(/[,\s]+/).map(s => s.replace(/\D/g, '')).filter(Boolean);
    if (!wanted.length) { setStatus('Type at least one invoice number.'); return; }
    const wantedSet = new Set(wanted);

    setStatus('Opening breakdowns...');
    await expandAll(modal);

    const found = new Set();
    let kept = 0, removed = 0;
    modal.querySelectorAll('.po-create-subrow-checkbox').forEach(cb => {
      const inv = invoiceOf(cb);
      const match = wantedSet.has(inv);
      if (match) { found.add(inv); kept++; }
      if (match && !cb.checked) cb.click();
      if (!match && cb.checked) { cb.click(); removed++; }
    });
    await sleep(300);

    // Item rows with nothing left checked get unchecked; the rest stay checked
    modal.querySelectorAll('.po-create-item-row').forEach(row => {
      const any = Array.from(row.querySelectorAll('.po-create-subrow-checkbox')).some(c => c.checked);
      const rc = row.querySelector('.po-create-item-row-checkbox');
      if (rc && rc.checked !== any) rc.click();
    });

    const missing = wanted.filter(w => !found.has(w));
    let msg = `Kept ${kept} line(s), unchecked ${removed}.`;
    if (missing.length) msg += ` Not found: ${missing.join(', ')}`;
    setStatus(msg);
  }

  // Fill the Buy From field: open the search, type, wait for the exact match, click it
  async function pickSupplier(name, query) {
    const modal = getModal(); if (!modal) return;
    const icon = modal.querySelector('#filter_po_create_supplier_search_dropdown_icon');
    const inp = modal.querySelector('#filter_po_create_supplier_search');
    if (!icon || !inp) return;
    icon.click();
    await sleep(300);
    inp.focus();
    inp.value = query;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: query.slice(-1) }));
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      const hit = Array.from(modal.querySelectorAll('#filter_po_create_supplier_search_b a'))
        .find(a => a.textContent.trim().toLowerCase() === name.toLowerCase());
      if (hit) { hit.click(); return; }
    }
    console.warn('[Teesom PO Tools] supplier not found in list:', name);
  }

  function injectSupplierButtons() {
    const modal = getModal();
    if (!modal || document.getElementById('gg-supplier-btns')) return;
    const dd = modal.querySelector('#filter_po_create_supplier_search_dropdown');
    const bar = dd && dd.closest('.list-group-item');
    if (!bar) return;
    const wrap = document.createElement('span');
    wrap.id = 'gg-supplier-btns';
    wrap.style.cssText = 'display:inline-flex;gap:4px;margin-left:8px;align-items:center;white-space:nowrap;';
    wrap.innerHTML =
      '<button type="button" id="gg-sanmar" class="btn btn-default btn-xs">SanMar</button>' +
      '<button type="button" id="gg-ss" class="btn btn-default btn-xs">SS Activewear</button>';
    // Sit outside the Buy From bar, to the right of the magnifying glass
    bar.parentElement.style.cssText += ';display:flex;align-items:center;';
    bar.style.flex = '1 1 auto';
    bar.insertAdjacentElement('afterend', wrap);
    document.getElementById('gg-sanmar').addEventListener('click', (e) => { e.stopPropagation(); pickSupplier('SanMar', 'San'); });
    document.getElementById('gg-ss').addEventListener('click', (e) => { e.stopPropagation(); pickSupplier('SS Activewear', 'SS Active'); });
  }

  function injectUI() {
    injectSupplierButtons();
    const modal = getModal();
    if (!modal || document.getElementById('gg-po-tools')) return;
    const buy = modal.querySelector('#modal-row-po-create-header-sticky .form-group-neat-ajax-select');
    if (!buy) return;

    const box = document.createElement('div');
    box.id = 'gg-po-tools';
    box.style.cssText = 'margin:6px 0;padding:6px 8px;border:1px solid #ccc;border-radius:4px;background:#f7f7f7;display:flex;flex-wrap:wrap;gap:6px;align-items:center;';
    box.innerHTML =
      '<input type="text" id="gg-invoices" class="form-control input-sm" style="width:260px;display:inline-block" placeholder="Invoice #s, comma separated">' +
      '<button type="button" id="gg-filter" class="btn btn-default btn-sm">Keep Only These</button>' +
      '<button type="button" id="gg-show-all" class="btn btn-default btn-sm">Show All</button>' +
      '<span id="gg-status" style="font-size:12px;color:#555"></span>' +
      '<span style="font-size:10px;color:#aaa;margin-left:auto">PO Tools v' + VERSION + '</span>';
    buy.insertAdjacentElement('afterend', box);

    const setStatus = (t) => { document.getElementById('gg-status').textContent = t; };
    document.getElementById('gg-show-all').addEventListener('click', () => showAll(setStatus));
    document.getElementById('gg-filter').addEventListener('click', () =>
      keepOnly(document.getElementById('gg-invoices').value, setStatus));
  }

  // Keep the Buy From search dropdown lined up under the bar (it used to open left and get cut off)
  const style = document.createElement('style');
  style.textContent =
    '#modal-po-create .form-group-neat-ajax-select .list-group-swap-title{position:relative;}' +
    '#filter_po_create_supplier_search_dropdown{position:static !important;}' +
    '#filter_po_create_supplier_search_dropdown .dropdown-menu{left:0 !important;right:auto !important;min-width:100% !important;}';
  document.head.appendChild(style);

  // The popup is built dynamically, so watch for it
  new MutationObserver(injectUI).observe(document.documentElement, { childList: true, subtree: true });
  injectUI();
  console.log('[Teesom PO Tools] v' + VERSION + ' loaded');
})();
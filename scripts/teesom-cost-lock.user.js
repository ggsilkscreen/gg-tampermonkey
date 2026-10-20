// ==UserScript==
// @name         Teesom Cost Lock Indicator + True Unlock All
// @namespace    ggsilkscreen
// @version      1.1.1
// @description  Shows a red/grey COST lock next to Teesom's retail lock on each order row, and makes "Unlock All Pricing" also unlock locked cost prices.
// @match        https://app.teesom.com/saiw/orderentry.asp*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-cost-lock.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-cost-lock.user.js
// ==/UserScript==

(function () {
  'use strict';

  const $ = window.jQuery;
  if (!$) return;

  const RED = '#d9534f';
  const GREY = '#9e9e9e';
  const cache = {};          // dbid -> quick-amounts response
  const inflight = {};

  // ---------- helpers ----------
  const orderId = () => window._orderid;

  function fetchRow(dbid, force) {
    if (!force && cache[dbid]) return Promise.resolve(cache[dbid]);
    if (!force && inflight[dbid]) return inflight[dbid];
    const p = new Promise((resolve) => {
      $.post('adm_getdata.asp',
        { ajxaction: 'loadorderdetailrowquickamounts', dbid: dbid, ord: orderId() },
        (data) => {
          try { if (typeof data === 'string') data = JSON.parse(data); } catch (e) { data = null; }
          if (data) cache[dbid] = data;
          resolve(data);
        }).fail(() => resolve(null)).always(() => { delete inflight[dbid]; });
    });
    inflight[dbid] = p;
    return p;
  }

  function lockSvg(color) {
    return '<svg width="16" height="16" viewBox="0 0 24 24" style="display:block">' +
      '<rect x="4" y="10" width="16" height="12" rx="2" fill="none" stroke="' + color + '" stroke-width="2"/>' +
      '<path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="' + color + '" stroke-width="2"/>' +
      '<text x="12" y="19.5" text-anchor="middle" font-size="9" font-weight="700" font-family="Arial" fill="' + color + '">C</text>' +
      '</svg>';
  }

  // ---------- per-row cost lock icon ----------
  function paintIcon(box, data) {
    const locked = data && data.lockedcost === 'y';
    box.innerHTML = lockSvg(data ? (locked ? RED : GREY) : '#ddd');
    box.title = !data ? 'Cost lock: unknown'
      : locked ? 'Cost Locked (' + data.projectedcost + ') – click to edit'
      : 'Cost Unlocked: Calculated Cost';
    box.dataset.costLocked = locked ? 'y' : 'n';
  }

  function decorateRows() {
    document.querySelectorAll('#orderdetailcontainer img.lockme').forEach((img) => {
      const retailBox = img.closest('.order-detail-row-icon-box');
      if (!retailBox) return;
      const priceEl = document.getElementById(img.getAttribute('tid'));
      const dbid = priceEl && priceEl.getAttribute('dbid');
      if (!dbid) return;

      let box = retailBox.previousElementSibling;
      if (!box || !box.classList.contains('gg-costlock')) {
        box = document.createElement('div');
        box.className = 'order-detail-row-icon-box cp gg-costlock';
        box.style.marginRight = '2px';
        box.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          // open Teesom's own price editor for this row
          const btn = document.querySelector('.btnoeinputprice[tid="' + img.getAttribute('tid') + '"]');
          if (btn) btn.click();
        });
        retailBox.parentNode.insertBefore(box, retailBox);
      }
      if (box.dataset.dbid === dbid && box.dataset.costLocked) return;
      box.dataset.dbid = dbid;
      paintIcon(box, cache[dbid]);
      fetchRow(dbid).then((d) => paintIcon(box, d));
    });
  }

  // ---------- make "Unlock All Pricing" also unlock cost ----------
  function unlockRowCost(dbid) {
    return fetchRow(dbid, true).then((d) => new Promise((resolve) => {
      if (!d || d.lockedcost !== 'y' || d.costeditable === false) return resolve(false);
      $.post('adm_getdata.asp', {
        ajxaction: 'ordrowdetailupdate',
        costprice: d.projectedcost,
        retailprice: d.retail,
        qty: d.qty,
        syncqty: d.syncqty,
        lockretail: 'n',
        lockcost: 'n',
        dbid: dbid,
        version: d.version,
        ord: orderId()
      }, (res) => {
        try { if (typeof res === 'string') res = JSON.parse(res); } catch (e) {}
        resolve(!(res && res.err));
      }).fail(() => resolve(false));
    }));
  }

  async function unlockAllCosts() {
    const dbids = [...new Set([...document.querySelectorAll('#orderdetailcontainer img.lockme')]
      .map((img) => { const p = document.getElementById(img.getAttribute('tid')); return p && p.getAttribute('dbid'); })
      .filter(Boolean))];
    let n = 0;
    for (const id of dbids) { if (await unlockRowCost(id)) n++; }   // one at a time
    Object.keys(cache).forEach((k) => delete cache[k]);
    if (typeof window.getrecords === 'function') window.getrecords();
    if (typeof window.snack_suc === 'function') window.snack_suc(n ? 'Cost unlocked on ' + n + ' item(s)' : 'No locked costs found');
  }

  // Runs alongside Teesom's own handler (which only unlocks retail)
  $(document).on('click', '.oelockallprices[lkit="n"]', function () {
    setTimeout(unlockAllCosts, 1200);   // let Teesom's retail unlock finish first
  });

  // Refresh a row's icon after its price editor is saved
  $(document).on('click', '#btn-save-order-row-prices-qty-other', function () {
    const id = $('#modal-edit-detail-row').attr('dbid');
    if (id) delete cache[id];
    document.querySelectorAll('.gg-costlock[data-dbid="' + id + '"]').forEach((b) => { b.dataset.costLocked = ''; });
  });

  // ---------- asterisk on the menu item so you can see the script is loaded ----------
  function markMenu() {
    document.querySelectorAll('.oelockallprices[lkit="n"] a').forEach((a) => {
      if (a.dataset.ggMarked) return;
      a.dataset.ggMarked = 'y';
      a.textContent = a.textContent.trim() + ' *';
      a.title = 'Also unlocks cost prices (Tampermonkey)';
    });
  }

  // ---------- watch for Teesom re-rendering rows ----------
  let t;
  const refresh = () => { decorateRows(); markMenu(); };
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(refresh, 300); })
    .observe(document.body, { childList: true, subtree: true });
  refresh();
})();
// ==UserScript==
// @name         GG Silkscreen - Customer Link Auto-Send (Print Traveler)
// @namespace    ggsilkscreen
// @version      1.6.1
// @description  Grabs the customer-view link from the order page, sends it to the orders-import API when "Print Shop Traveler" is clicked, and shows an on-page "Link Sent" indicator that can be clicked to close.
// @match        https://app.teesom.com/saiw/orderentry.asp*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      ggh.nacoteds.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-traveler-send-link.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-traveler-send-link.user.js
// ==/UserScript==

(function () {
  'use strict';

  const ENDPOINT = 'https://ggh.nacoteds.com/api/orders/import';
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

  // Strips a trailing &sview=y (or ?sview=y) from a Customer View URL.
  function stripSview(url) {
    return url
      .replace(/([?&])sview=y(&|$)/i, (m, p1, p2) => (p2 === '&' ? p1 : ''))
      .replace(/[?&]$/, '');
  }

  // ---- Status indicator (click anywhere on it, or the X, to close) ----
  function getIndicator() {
    let el = document.getElementById('gg-link-indicator');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'gg-link-indicator';
    el.title = 'Click to close';
    el.setAttribute('style', `
      position: fixed !important; top: 14px !important; right: 14px !important;
      z-index: 2147483647 !important; cursor: pointer !important;
      padding: 10px 14px 10px 18px !important; border-radius: 6px !important;
      font: bold 14px/1.4 sans-serif !important; color: #fff !important;
      box-shadow: 0 4px 14px rgba(0,0,0,.3) !important;
      display: none; align-items: center !important; gap: 12px !important;
    `);

    const label = document.createElement('span');
    label.className = 'gg-indicator-label';

    const close = document.createElement('span');
    close.className = 'gg-indicator-close';
    close.textContent = '✕';
    close.setAttribute('style', 'font-size:16px !important; opacity:.85 !important; line-height:1 !important;');

    el.appendChild(label);
    el.appendChild(close);

    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      el.style.setProperty('display', 'none', 'important');
    }, true);

    document.body.appendChild(el);
    return el;
  }

  function setIndicator(status, detail) {
    const el = getIndicator();
    const colors = { sending: '#555', success: '#2e7d32', error: '#c62828' };
    const labels = { sending: 'Sending link…', success: 'Link Sent ✓', error: 'Send failed ✗' };
    el.style.setProperty('background', colors[status] || '#333', 'important');
    el.style.setProperty('display', 'flex', 'important'); // re-show if previously closed
    el.querySelector('.gg-indicator-label').textContent = labels[status] + (detail ? ' ' + detail : '');
  }

  // ---- Loaded indicator (green asterisk on the menu item) ----
  function markLoaded(li) {
    if (li.querySelector('.gg-loaded-marker')) return;
    const asterisk = document.createElement('span');
    asterisk.className = 'gg-loaded-marker';
    asterisk.textContent = ' *';
    asterisk.setAttribute('style', 'color:#2e7d32 !important; font-weight:bold !important;');
    const link = li.querySelector('a') || li;
    link.appendChild(asterisk);
    console.log('[GG link-sender] loaded indicator attached to Print Shop Traveler');
  }

  function findTravelerLi() {
    return document.querySelector('li.row-j-action-btn-click[t="trvprint"]');
  }

  function attachMarkerWhenReady() {
    const li = findTravelerLi();
    if (li) { markLoaded(li); return; }
    const observer = new MutationObserver(() => {
      const li2 = findTravelerLi();
      if (li2) { markLoaded(li2); observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  attachMarkerWhenReady();

  // ---- Click handler ----
  document.addEventListener('click', function (e) {
    const li = e.target.closest('li.row-j-action-btn-click[t="trvprint"]');
    if (!li) return;

    const cview = li.closest('ul.order-action-drop-menu')?.getAttribute('cview');
    console.log('[GG link-sender] Print Shop Traveler clicked, cview =', cview);

    if (!cview) {
      setIndicator('error', '(no customer link found)');
      return;
    }

    const customerLink = stripSview('https://app.teesom.com/saiw/viewso.asp?oid=' + cview);
    const payload = { urls: [customerLink] };
    setIndicator('sending');

    GM_xmlhttpRequest({
      method: 'POST',
      url: ENDPOINT,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ggApiToken()
      },
      data: JSON.stringify(payload),
      onload: function (response) {
        let parsed;
        try { parsed = JSON.parse(response.responseText); } catch { parsed = response.responseText; }
        if (response.status >= 200 && response.status < 300) {
          console.log('[GG link-sender] sent OK:', customerLink, parsed);
          setIndicator('success');
        } else {
          console.error('[GG link-sender] send failed, status', response.status, parsed);
          setIndicator('error', '(HTTP ' + response.status + ')');
        }
      },
      onerror: function (err) {
        console.error('[GG link-sender] send failed:', err);
        setIndicator('error', '(network error)');
      }
    });
  }, true);
})();
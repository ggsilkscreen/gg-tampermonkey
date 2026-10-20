// ==UserScript==
// @name         Teesom Traveler - Invoice QR Code
// @namespace    ggsilkscreen
// @version      1.0.1
// @description  Adds a scannable QR code to the top-left of the Teesom traveler sheet that opens the order's invoice page (uses Teesom's own permanent short link from the box label).
// @match        https://app.teesom.com/saiw/print/printordertraveler.aspx*
// @require      https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js
// @grant        GM_xmlhttpRequest
// @connect      v.teesom.com
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-traveler-qr.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-traveler-qr.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---- Settings you can tweak -------------------------------------------
  const QR_SIZE_PX = 82;      // printed size of the QR square
  const LEFT_PX    = 14;      // distance from left edge of the page
  const TOP_PX     = 8;       // distance from top edge of the page
  const CAPTION    = ' ';
  const ALL_PAGES  = false;   // true = put a QR on every page of the traveler
  // -----------------------------------------------------------------------

  const oid = new URLSearchParams(location.search).get('oid');
  if (!oid) return;

  // Teesom's box label page contains the permanent short link
  // (http://v.teesom.com/Q/<id>) that redirects to the invoice page.
  const labelUrl = 'https://v.teesom.com/PrintSimpleBoxLabel/' + encodeURIComponent(oid);

  GM_xmlhttpRequest({
    method: 'GET',
    url: labelUrl,
    onload: function (res) {
      const m = res.responseText.match(/"value"\s*:\s*"(https?:\/\/v\.teesom\.com\/Q\/[A-Za-z0-9]+)"/);
      if (!m) { console.warn('[Traveler QR] could not find the short link on the label page'); return; }
      // Use https for the encoded link (same target, safer on phones)
      addQR(m[1].replace(/^http:/, 'https:'));
    },
    onerror: function (e) { console.warn('[Traveler QR] label request failed', e); }
  });

  function makeQRSvg(text) {
    const qr = qrcode(0, 'M');           // auto version, medium error correction
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) path += 'M' + c + ',' + r + 'h1v1h-1z';
      }
    }
    // 2-module quiet zone around the code
    const q = 2, size = n + q * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + -q + ' ' + -q + ' ' + size + ' ' + size +
           '" width="' + QR_SIZE_PX + '" height="' + QR_SIZE_PX + '" shape-rendering="crispEdges">' +
           '<rect x="' + -q + '" y="' + -q + '" width="' + size + '" height="' + size + '" fill="#fff"/>' +
           '<path d="' + path + '" fill="#000"/></svg>';
  }

  function addQR(link) {
    const svg = makeQRSvg(link);
    const pages = Array.from(document.querySelectorAll('.page'));
    (ALL_PAGES ? pages : pages.slice(0, 1)).forEach(function (page) {
      const box = document.createElement('div');
      box.className = 'gg-invoice-qr';
      box.style.cssText =
        'position:absolute;left:' + LEFT_PX + 'px;top:' + TOP_PX + 'px;z-index:50;' +
        'text-align:center;font:bold 8px Arial,sans-serif;line-height:1.2;color:#000;';
      box.innerHTML = svg + '<div>' + CAPTION + '</div>';
      if (getComputedStyle(page).position === 'static') page.style.position = 'relative';
      page.appendChild(box);
    });
  }
})();
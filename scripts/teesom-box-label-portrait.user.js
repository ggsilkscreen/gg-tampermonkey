// ==UserScript==
// @name         Teesom Box Label - Print Portrait
// @namespace    ggsilkscreen
// @version      2.1.0
// @description  Box Label page: draws a clean G&G box label (6 x 4 in, landscape on screen) and prints it turned to fill a 4 x 6 in sheet exactly. Black-and-white logo, QR code, auto-fit customer name, BOX __ OF __ write-in boxes. Replaces the Stylebot styles for this page.
// @match        https://v.teesom.com/PrintSimpleBoxLabel/*
// @match        http://v.teesom.com/PrintSimpleBoxLabel/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-box-label-portrait.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-box-label-portrait.user.js
// ==/UserScript==

(function () {
    'use strict';

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

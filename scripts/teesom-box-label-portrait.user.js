// ==UserScript==
// @name         Teesom Box Label - Print Portrait
// @namespace    ggsilkscreen
// @version      2.0.0
// @description  Box Label page: draws the G&G box label as a clean 6 x 4 inch label (landscape on screen) and prints it turned to fill a 4 x 6 inch sheet exactly. Long customer names shrink to fit. Replaces the Stylebot styles for this page.
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

    const src = document.getElementById('page');
    if (!src) return;
    const txt = (sel) => ((src.querySelector(sel) || {}).textContent || '').trim();

    // ---- Read the order info from Teesom's label ----
    const orderNum = txt('#basic_info_1');
    const orderDesc = txt('#basic_info_2');
    const customer = txt('.body_info_content.body_info_larger');
    const lines = Array.from(src.querySelectorAll('.basic_body_options_info_group_type_text .basic_body_options_info_title'))
        .map((e) => e.textContent.trim()).filter(Boolean);

    // Logo (copy the image)
    const logoSrc = (src.querySelector('#basic_img img') || {}).src || '';

    // QR code: Teesom draws it as an <svg>, <canvas> or <img>. Copy it so it prints sharp.
    function qrCopy() {
        const box = src.querySelector('#containercontent') || src.querySelector('#container');
        if (!box) return null;
        const c = box.querySelector('canvas');
        if (c) { const img = new Image(); try { img.src = c.toDataURL('image/png'); } catch (e) { return null; } return img; }
        const el = box.querySelector('svg, img');
        return el ? el.cloneNode(true) : null;
    }

    // ---- Build the new label ----
    const W = SHEET_H_IN, H = SHEET_W_IN;      // the label is drawn landscape: 6 wide x 4 tall
    const css = document.createElement('style');
    css.id = 'gg-box-label-style';
    css.textContent = `
      #page { display: none !important; }                       /* Teesom's original label (and any Stylebot styles) */
      #gg-label { box-sizing: border-box; width: ${W}in; height: ${H}in; margin: 0.6in auto; padding: 0.12in 0.15in;
                  border: 1px solid #d3d3d3; background: #fff; color: #000; font-family: Helvetica, Arial, sans-serif;
                  display: flex; flex-direction: column; overflow: hidden; }
      #gg-label * { box-sizing: border-box; }
      .ggl-top { display: flex; align-items: center; height: 1.05in; gap: 0.12in; border-bottom: 1px solid #555; padding-bottom: 0.06in; }
      .ggl-logo { height: 0.85in; max-width: 2.3in; object-fit: contain; filter: brightness(60%) contrast(600%) grayscale(100%); }
      .ggl-qr { width: 0.9in; height: 0.9in; display: flex; align-items: center; justify-content: center; }
      .ggl-qr > * { width: 100% !important; height: 100% !important; transform: none !important; position: static !important; }
      .ggl-num { margin-left: auto; text-align: right; line-height: 1; }
      .ggl-num b { display: block; font: bold 44px Arial, Helvetica, sans-serif; }
      .ggl-num span { display: block; margin-top: 4px; font: bold 16px Arial, Helvetica, sans-serif; }
      .ggl-name { margin-top: 0.08in; height: 0.72in; background: #000; color: #fff; display: flex; align-items: center;
                  padding: 0 0.12in; font-weight: bold; font-stretch: condensed; white-space: nowrap; overflow: hidden; }
      .ggl-bottom { flex: 1; display: flex; gap: 0.2in; padding-top: 0.08in; }
      .ggl-box { width: 38%; display: flex; flex-direction: column; justify-content: flex-end; }
      .ggl-of { display: flex; align-items: flex-end; gap: 8px; font-size: 20px; margin-bottom: 0.08in; }
      .ggl-of i { flex: 1; border-bottom: 1.5px solid #000; height: 1px; }
      .ggl-boxbar { background: #000; color: #fff; text-align: center; font-size: 18px; padding: 2px 0; text-transform: uppercase; }
      .ggl-lines { flex: 1; display: flex; flex-direction: column; justify-content: space-around; }
      .ggl-line { border-bottom: 1px solid #000; font: bold 14px Helvetica, Arial, sans-serif; padding-bottom: 1px; }
      @media print {
        @page { size: ${SHEET_W_IN}in ${SHEET_H_IN}in; margin: 0; }
        html, body { margin: 0 !important; padding: 0 !important; width: ${SHEET_W_IN}in !important; height: ${SHEET_H_IN}in !important; overflow: hidden !important; }
        body > *:not(#gg-label) { display: none !important; }
        #gg-label { position: absolute; top: 0; left: 0; margin: 0; border: 0; transform-origin: 0 0;
                    transform: ${CLOCKWISE ? `translateX(${SHEET_W_IN}in) rotate(90deg)` : `translateY(${SHEET_H_IN}in) rotate(-90deg)`}; }
      }`;
    document.head.appendChild(css);

    const label = document.createElement('div');
    label.id = 'gg-label';
    label.innerHTML = `
      <div class="ggl-top">
        ${logoSrc ? '<img class="ggl-logo" alt="">' : ''}
        <div class="ggl-qr"></div>
        <div class="ggl-num"><b></b><span></span></div>
      </div>
      <div class="ggl-name"></div>
      <div class="ggl-bottom">
        <div class="ggl-box"><div class="ggl-of"><i></i>OF<i></i></div><div class="ggl-boxbar">Box</div></div>
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

    // Long customer names: shrink the font until the name fits the black bar.
    function fitName() {
        const bar = label.querySelector('.ggl-name');
        let size = 56;
        bar.style.fontSize = size + 'px';
        while (bar.scrollWidth > bar.clientWidth && size > 18) { size -= 2; bar.style.fontSize = size + 'px'; }
    }
    fitName();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitName);
})();

// ==UserScript==
// @name         Teesom Box Label - Print Portrait
// @namespace    ggsilkscreen
// @version      1.0.0
// @description  On the Print Box Label page, turns the label 90 degrees to portrait when you print (Print button or Ctrl+P), sized to fit the page. The screen view stays the same.
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
    const PAGE_W_IN = 8.5;          // paper width in inches (portrait)
    const PAGE_H_IN = 11;           // paper height in inches (portrait)
    const MARGIN_IN = 0.25;         // blank margin kept around the label
    const CLOCKWISE = true;         // false = turn the other way
    // -----------------------------------------------------------------------

    const PX = 96;                  // CSS pixels per inch

    // Put everything on the page inside one wrapper we can turn.
    const wrap = document.createElement('div');
    wrap.id = 'gg-label-rotate';
    while (document.body.firstChild) wrap.appendChild(document.body.firstChild);
    document.body.appendChild(wrap);

    const style = document.createElement('style');
    style.id = 'gg-label-print-style';
    document.head.appendChild(style);

    function setPortrait() {
        // Measure the label as it looks on screen (after Stylebot's changes): the box around everything visible.
        const base = wrap.getBoundingClientRect();
        let right = 0, bottom = 0;
        wrap.querySelectorAll('*').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            right = Math.max(right, r.right - base.left);
            bottom = Math.max(bottom, r.bottom - base.top);
        });
        const w = Math.ceil(right), h = Math.ceil(bottom);
        if (!w || !h) return;

        // Turned 90 degrees, the label's width runs down the page and its height runs across.
        const availW = (PAGE_W_IN - 2 * MARGIN_IN) * PX;
        const availH = (PAGE_H_IN - 2 * MARGIN_IN) * PX;
        const scale = Math.min(1, availW / h, availH / w);
        const m = MARGIN_IN * PX;

        const turn = CLOCKWISE
            ? `translate(${m + h * scale}px, ${m}px) rotate(90deg) scale(${scale})`
            : `translate(${m}px, ${m + w * scale}px) rotate(-90deg) scale(${scale})`;

        style.textContent = `
          @media print {
            @page { size: ${PAGE_W_IN}in ${PAGE_H_IN}in; margin: 0; }
            html, body { margin: 0 !important; padding: 0 !important; width: ${PAGE_W_IN}in !important; height: ${PAGE_H_IN}in !important; overflow: hidden !important; }
            #gg-label-rotate { position: absolute !important; top: 0 !important; left: 0 !important; margin: 0 !important;
                               width: ${w}px !important; height: ${h}px !important;
                               transform-origin: 0 0 !important; transform: ${turn} !important; }
          }`;
    }

    function clear() { style.textContent = ''; }

    // Fires for the page's own Print button and for Ctrl+P.
    window.addEventListener('beforeprint', setPortrait);
    window.addEventListener('afterprint', clear);
    // Some print buttons call window.print() before beforeprint is reliable; set it up ahead of time too.
    setPortrait();
    window.addEventListener('load', setPortrait);
})();

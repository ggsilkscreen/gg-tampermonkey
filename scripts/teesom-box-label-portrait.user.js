// ==UserScript==
// @name         Teesom Box Label - Print Portrait
// @namespace    ggsilkscreen
// @version      1.1.0
// @description  On the Print Box Label page, turns the label 90 degrees so it prints on a portrait page (Print button or Ctrl+P). The label keeps the same layout it has when printed landscape - it's only rotated. The screen view doesn't change.
// @match        https://v.teesom.com/PrintSimpleBoxLabel/*
// @match        http://v.teesom.com/PrintSimpleBoxLabel/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-box-label-portrait.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-box-label-portrait.user.js
// ==/UserScript==

(function () {
    'use strict';

    const CLOCKWISE = true;   // false = turn it the other way

    // Put everything on the page inside one wrapper we can turn.
    const wrap = document.createElement('div');
    wrap.id = 'gg-label-rotate';
    while (document.body.firstChild) wrap.appendChild(document.body.firstChild);
    document.body.appendChild(wrap);
    // Keep the page's own margin around the label (the wrapper sits outside the body's margin once turned).
    const bs = getComputedStyle(document.body);
    const pad = ['Top', 'Right', 'Bottom', 'Left'].map((k) => (parseFloat(bs['margin' + k]) || 0) + (parseFloat(bs['padding' + k]) || 0) + 'px').join(' ');

    // Print only: the page is portrait, and the wrapper is laid out as a LANDSCAPE page
    // (width = page height, height = page width), then turned 90 degrees to fit exactly.
    // In print, 100vw / 100vh are the paper's printable width / height.
    const turn = CLOCKWISE
        ? 'translateX(100vw) rotate(90deg)'
        : 'translateY(100vh) rotate(-90deg)';
    const style = document.createElement('style');
    style.id = 'gg-label-print-style';
    style.textContent = `
      @media print {
        @page { size: portrait; }
        html, body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
        #gg-label-rotate { position: absolute !important; top: 0 !important; left: 0 !important;
                           width: 100vh !important; height: 100vw !important; box-sizing: border-box !important; padding: ${pad} !important;
                           transform-origin: 0 0 !important; transform: ${turn} !important; }
      }`;
    // Added last so it wins over any landscape setting from the page or Stylebot.
    const add = () => document.head.appendChild(style);
    add();
    window.addEventListener('beforeprint', add);   // re-append right before printing, like the ESP button's prep step
})();

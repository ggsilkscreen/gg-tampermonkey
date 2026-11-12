// ==UserScript==
// @name         Teesom Box Label - Print Portrait
// @namespace    ggsilkscreen
// @version      1.4.0
// @description  On the Print Box Label page, turns the label 90 degrees when you print (Print button or Ctrl+P) so it runs down a portrait letter page at its normal size. The screen view doesn't change.
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
    const LABEL_W_IN = 8.5;   // paper, portrait (letter)
    const LABEL_H_IN = 11;
    const MARGIN_IN = 0.25;   // white edge around the label
    const PX = 96;            // CSS pixels per inch

    const style = document.createElement('style');
    style.id = 'gg-label-print-style';

    // The label is the #page box. When printing, turn just that box 90 degrees at its real size.
    function prep() {
        const label = document.getElementById('page');
        if (!label) return;
        const w = label.offsetWidth, h = label.offsetHeight;
        // Once turned, the label's width runs down the sheet and its height runs across. Shrink only if needed.
        const availW = (LABEL_W_IN - 2 * MARGIN_IN) * PX, availH = (LABEL_H_IN - 2 * MARGIN_IN) * PX;
        const k = Math.min(1, availW / h, availH / w);
        const x = (LABEL_W_IN * PX - h * k) / 2, y = MARGIN_IN * PX;   // centered left-right, at the top
        const turn = CLOCKWISE
            ? `translate(${x + h * k}px, ${y}px) rotate(90deg) scale(${k})`
            : `translate(${x}px, ${y + w * k}px) rotate(-90deg) scale(${k})`;
        style.textContent = `
          @media print {
            @page { size: ${LABEL_W_IN}in ${LABEL_H_IN}in; margin: 0; }
            html, body { margin: 0 !important; padding: 0 !important; width: ${LABEL_W_IN}in !important; height: ${LABEL_H_IN}in !important; overflow: hidden !important; }
            #page { position: absolute !important; top: 0 !important; left: 0 !important; margin: 0 !important;
                    width: ${w}px !important; height: ${h}px !important;
                    transform-origin: 0 0 !important; transform: ${turn} !important; }
          }`;
        document.head.appendChild(style);   // added last so it wins
    }

    prep();
    window.addEventListener('load', prep);
    window.addEventListener('beforeprint', prep);   // runs for the Print button and Ctrl+P
})();

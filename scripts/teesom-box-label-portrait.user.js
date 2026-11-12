// ==UserScript==
// @name         Teesom Box Label - Print Portrait
// @namespace    ggsilkscreen
// @version      1.2.0
// @description  On the Print Box Label page, turns the label 90 degrees when you print (Print button or Ctrl+P). Same label, same size - just rotated. The screen view doesn't change.
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

    const style = document.createElement('style');
    style.id = 'gg-label-print-style';

    // The label is the #page box. When printing, turn just that box 90 degrees at its real size.
    function prep() {
        const label = document.getElementById('page');
        if (!label) return;
        const w = label.offsetWidth, h = label.offsetHeight;
        const turn = CLOCKWISE ? `translateX(${h}px) rotate(90deg)` : `translateY(${w}px) rotate(-90deg)`;
        style.textContent = `
          @media print {
            @page { size: portrait; }
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

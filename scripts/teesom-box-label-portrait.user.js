// ==UserScript==
// @name         Teesom Box Label - Print Portrait
// @namespace    ggsilkscreen
// @version      1.5.0
// @description  On the Print Box Label page, clicking Print turns the label 90 degrees on screen, then opens the print dialog. It turns back after printing. Nothing else on the page is changed.
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

    // Turn the label (#page) 90 degrees. It's nudged down by the difference between its width and
    // height so the turned label's top edge stays where the label's top edge was.
    function flip() {
        const label = document.getElementById('page');
        if (!label || label.dataset.ggFlipped) return;
        const shift = (label.offsetWidth - label.offsetHeight) / 2;
        label.dataset.ggFlipped = '1';
        label.style.transform = `translateY(${shift}px) rotate(${CLOCKWISE ? 90 : -90}deg)`;
    }
    function unflip() {
        const label = document.getElementById('page');
        if (!label || !label.dataset.ggFlipped) return;
        label.style.transform = '';
        delete label.dataset.ggFlipped;
    }

    // The page's Print button calls window.print(): flip first, let the screen show it, then print.
    const realPrint = window.print.bind(window);
    window.print = function () {
        flip();
        requestAnimationFrame(() => setTimeout(realPrint, 150));
    };
    window.addEventListener('beforeprint', flip);    // Ctrl+P works too
    window.addEventListener('afterprint', unflip);   // back to normal when the dialog closes
})();

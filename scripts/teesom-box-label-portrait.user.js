// ==UserScript==
// @name         Teesom Box Label - Print Portrait
// @namespace    ggsilkscreen
// @version      1.6.0
// @description  Box Label page: applies the G&G label layout (replaces the Stylebot styles - turn Stylebot off for v.teesom.com), and clicking Print turns the label 90 degrees on screen, then opens the print dialog. It turns back after printing.
// @match        https://v.teesom.com/PrintSimpleBoxLabel/*
// @match        http://v.teesom.com/PrintSimpleBoxLabel/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-box-label-portrait.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-box-label-portrait.user.js
// ==/UserScript==

(function () {
    'use strict';

    const CLOCKWISE = true;   // false = turn it the other way

    // ---- 1. G&G label layout (same styles as Ross's Stylebot setup) ----------------------------
    const LABEL_CSS = `
        #basic_info_2 { font-size: 20px !important; font-weight: 700 !important; font-style: normal !important; position: relative !important; top: 5% !important; left: -130px !important; margin-top: -10px !important; text-align: right !important; width: 325px !important; z-index: 0 !important; }
        #basic_info_1 { font-size: 50px !important; position: relative !important; top: -1% !important; left: -128px !important; text-align: right !important; font-family: Arial, Helvetica, sans-serif !important; }
        div.body_info_content.body_info_larger { position: absolute !important; top: -150% !important; left: 28% !important; color: #ffffff !important; font-weight: 700 !important; font-style: normal !important; font-size: 65px !important; background-color: #000000 !important; padding-right: 500px !important; text-align: left !important; margin-left: -20px !important; padding-left: 20px !important; font-family: Helvetica !important; font-stretch: condensed !important; padding-bottom: 10px !important; }
        div.body_info_title { position: relative !important; top: 1% !important; left: 19% !important; display: none !important; }
        #basic_body_info { position: relative !important; }
        #basic_info { position: absolute !important; top: 20px !important; left: 72% !important; margin-bottom: -45px !important; z-index: 10 !important; }
        div.body_info_content { position: relative !important; left: 5% !important; }
        div.body_info_group { position: relative !important; left: -200px !important; margin-top: 6px !important; color: #ffffff !important; }
        #basic_body_options_info { position: relative !important; left: 200px !important; top: -2px !important; margin-top: 30px !important; }
        div.basic_body_options_info_title { padding-top: 20px !important; margin-top: 17px !important; text-transform: capitalize !important; font-size: 16px !important; font-weight: 700 !important; font-style: normal !important; position: relative !important; left: 105px !important; }
        #containercontent { transform: scale(80%) !important; position: absolute !important; top: -5% !important; left: -80% !important; height: 150px !important; }
        div div img { position: relative !important; left: 10px !important; top: 19px !important; filter: brightness(60%) contrast(600%) grayscale(100%) !important; transform: scale(1.4) !important; }
        #page { width: 751.68px !important; height: 463.68px !important; }
        #basic_body_header { position: relative !important; margin-bottom: 9px !important; }
        div.basic_option_content_checkbox { display: none !important; }
        #basic_bottom_info_1 { position: relative !important; top: 50px !important; left: 290px !important; text-transform: uppercase !important; font-size: 20px !important; background-color: #000000 !important; color: #ffffff !important; padding-left: 50px !important; padding-right: 50px !important; height: 25px !important; padding-top: 1px !important; width: 300px !important; text-align: center !important; }
        #basic_bottom_info_3 { font-size: 24px !important; margin-bottom: -50px !important; text-transform: uppercase !important; font-weight: 100 !important; font-style: normal !important; margin-right: 10px !important; margin-left: 10px !important; }
        #basic_bottom_info_2 { padding-top: 10px !important; font-size: 24px !important; }
        #basic_bottom_info_4 { padding-top: 10px !important; font-size: 24px !important; }
        #basic_bottom_info { position: absolute !important; left: -10px !important; top: 385px !important; }
        div.body_info_group.body_info_group_smaller { display: none !important; }
    `;
    const style = document.createElement('style');
    style.id = 'gg-box-label-layout';
    style.textContent = LABEL_CSS;
    // Add it as early as possible, then move it to the end of <head> once the page is parsed,
    // so it comes after Teesom's own stylesheets (same as Stylebot does).
    const place = () => { const h = document.head || document.documentElement; if (h) h.appendChild(style); };
    place();
    document.addEventListener('DOMContentLoaded', place);

    // ---- 2. Print: turn the label, then open the print dialog ----------------------------------
    // Turn the label (#page) 90 degrees. It's nudged down by the difference between its width and
    // height so the turned label's top edge stays where the label's top edge was.
    function flip() {
        const label = document.getElementById('page');
        if (!label || label.dataset.ggFlipped) return;
        const shift = (label.offsetWidth - label.offsetHeight) / 2;
        label.dataset.ggFlipped = '1';
        label.style.transform = 'translateY(' + shift + 'px) rotate(' + (CLOCKWISE ? 90 : -90) + 'deg)';
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

// ==UserScript==
// @name         Print for ESP Button Injector
// @namespace    http://tampermonkey.net/
// @version      1.5.1
// @description  Adds a 'Print for ESP' button next to the custom options, hides contact info and Ship To block, and clicks Print.
// @author       You
// @match        https://app.teesom.com/saiw/print/printordertraveler.aspx*
// @match        https://app.teesom.com/saiw/print/printwoadvanced.aspx*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-print-for-esp.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-print-for-esp.user.js
// ==/UserScript==
(function() {
    'use strict';

    // Extra elements to hide before printing. Add more CSS selectors here.
    const EXTRA_HIDE_SELECTORS = [
        '.doc-header-address-shipto',
    ];

    // Ensure our button never appears in print preview / printed output / Ctrl+P,
    // no matter how printing is triggered.
    function injectPrintHideStyle() {
        if (document.getElementById('tm-esp-print-btn-style')) return;
        const style = document.createElement('style');
        style.id = 'tm-esp-print-btn-style';
        style.textContent = '@media print { #tm-esp-print-btn { display: none !important; } }';
        document.head.appendChild(style);
    }

    function injectButton() {
        // Prevent duplicate buttons if the script triggers twice
        if (document.getElementById('tm-esp-print-btn')) return;
        // 1. Create the button element
        const espBtn = document.createElement('button');
        espBtn.innerText = 'Print for ESP';
        espBtn.id = 'tm-esp-print-btn';
        // Also tag it with the site's own print-exclusion class, in case that
        // class carries additional print-hiding rules we don't know about.
        espBtn.classList.add('DoNotPrint');
        // 2. Base Styling
        espBtn.style.marginLeft = '15px';
        espBtn.style.padding = '5px 15px';
        espBtn.style.backgroundColor = '#007bff';
        espBtn.style.color = 'white';
        espBtn.style.border = '1px solid #0069d9';
        espBtn.style.borderRadius = '3px';
        espBtn.style.cursor = 'pointer';
        espBtn.style.fontSize = '12px';
        espBtn.style.verticalAlign = 'middle';
        // 3. Hover Effect
        espBtn.onmouseover = () => espBtn.style.backgroundColor = '#0069d9';
        espBtn.onmouseout = () => espBtn.style.backgroundColor = '#007bff';
        // 4. Define the Action Chain
        espBtn.onclick = function() {
            console.log("'Print for ESP' button clicked. Cleaning up traveler info...");
            // --- STEP 1: Hide contact details + extra elements ---
            const infoFields = document.querySelectorAll('.doc-header-more-info-info');
            infoFields.forEach(field => {
                const text = field.textContent.trim();
                if (text.startsWith('Contact:') ||
                    text.startsWith('Phone:') ||
                    text.startsWith('Cell:') ||
                    text.startsWith('Email:')) {
                    field.style.display = 'none';
                }
            });
            EXTRA_HIDE_SELECTORS.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => el.style.display = 'none');
            });
            // --- STEP 2: Find and click the website's native 'Print' button ---
            const nativePrintBtn = document.querySelector('button.btn.DoNotPrint');
            if (nativePrintBtn) {
                console.log("Found native Print button, triggering click...");
                nativePrintBtn.click();
            } else {
                // Fallback: If for some reason the class name changes, search by text match
                const backupPrintBtn = Array.from(document.querySelectorAll('button'))
                    .find(el => el.textContent.trim() === 'Print' && el.id !== 'tm-esp-print-btn');
                if (backupPrintBtn) {
                    backupPrintBtn.click();
                } else {
                    console.error("Could not find the page's original Print button.");
                    // Ultimate backup fallback: force the browser dialog manually if the button isn't found
                    window.print();
                }
            }
        };
        // 5. Inject the button next to "Show Custom Print Options"
        const anchorButton = Array.from(document.querySelectorAll('button, input[type="button"], a'))
            .find(el => el.textContent.trim() === 'Show Custom Print Options');
        if (anchorButton) {
            anchorButton.parentNode.insertBefore(espBtn, anchorButton.nextSibling);
            clearInterval(searchInterval);
        } else {
            const backupAnchor = Array.from(document.querySelectorAll('button, input[type="button"], a'))
                .find(el => el.textContent.trim() === 'Print');
            if (backupAnchor) {
                backupAnchor.parentNode.insertBefore(espBtn, backupAnchor.nextSibling);
                clearInterval(searchInterval);
            }
        }
    }

    injectPrintHideStyle();
    const searchInterval = setInterval(injectButton, 300);
    setTimeout(() => {
        clearInterval(searchInterval);
    }, 10000);
})();
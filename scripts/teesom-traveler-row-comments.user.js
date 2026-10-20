// ==UserScript==
// @name         Teesom Traveler - Default Show Row Comments V9.23
// @namespace    http://tampermonkey.net/
// @version      2.0.1
// @description  Forces the "Show row comments" custom print option on by default on the Traveler Sheet print page, by adding it to the URL before the page renders.
// @author       You
// @match        https://app.teesom.com/saiw/print/printordertraveler.aspx*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-traveler-row-comments.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-traveler-row-comments.user.js
// ==/UserScript==
(function() {
    'use strict';

    // Clicking "Apply" on the Custom Print Options panel works by appending
    // a4=y to the URL's query string (a4 = the "Show row comments" option).
    // Other options (a0/a1/a2/a3) are left at their existing defaults when
    // only a4 is present, so we only need to set this one param - confirmed
    // by testing directly against a live order.
    const url = new URL(window.location.href);
    if (url.searchParams.get('a4') !== 'y') {
        url.searchParams.set('a4', 'y');
        // replace (not assign) so this doesn't add a new back-button history entry
        window.location.replace(url.toString());
    }
})();


// ==UserScript==
// @name         Chipply Look (Teesom colors)
// @namespace    https://github.com/ggsilkscreen
// @version      1.1
// @description  Restyles the Chipply admin in Teesom dark blue with higher contrast: outlined Process/Categories boxes, boxed inputs, striped rows, and hides Sort, Weight, MSRP and Combined on the Products list.
// @author       GG Silkscreen
// @match        https://manage.chipply.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/chipply-look.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/chipply-look.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ===== COLORS =====
    const COLORS = {
        teesomBlue:  '#073763', // Teesom dark blue (same as the Teesom header buttons)
        teesomHover: '#062f54',
        topBar:      '#062f54', // main nav bar across the top (Chipply is near-black) - a shade darker than the Products band
        topBarText:  '#ffffff',
        accent:      '#073763', // buttons, active tab, links
        accentDark:  '#062f54', // button hover
        chipText:    '#343434', // Process / Categories boxes - same as Sizes & Colors
        chipBorder:  '#d2d1d4',
        pageBg:      '#eef2f6', // page background behind the table
        panelBg:     '#ffffff', // table / cards
        sideBg:      '#e3e9f0', // left side menu
        headerRowBg: '#dfe7f0', // table column header row
        text:        '#1a1a1a', // main text (Chipply uses light grey in places)
        mutedText:   '#4a5563', // secondary text - still readable, not faint grey
        border:      '#b9c4d0', // cell + input borders
        rowStripe:   '#f6f8fb', // every other row
        rowHover:    '#e8f1fb',
        alert:       '#c62828'  // Chipply's red "problem" cells (kept, just toned)
    };
    // =========================================================

    const C = COLORS;
    const css = `
      /* Swap Chipply's bright "primary" blue for Teesom dark blue everywhere it's used
         (Account Dashboard title bars, count badges, loading bars, icon buttons...) */
      :root, .v-theme--light { --v-theme-primary: 7,55,99 !important; }
      .titleBackground { background-color: ${C.teesomBlue} !important; }

      /* Base text: no more faint grey */
      body, .v-application, .v-main { color: ${C.text} !important; background: ${C.pageBg} !important; }
      .v-application { font-size: 14px; }

      /* Top navigation bar */
      #topNavigation, .v-app-bar, header.v-toolbar.bg-primary, .v-app-bar .v-toolbar__content {
          background: ${C.topBar} !important; color: ${C.topBarText} !important;
      }
      .v-app-bar .v-btn, .v-app-bar .v-btn__content, .v-app-bar .v-icon { color: ${C.topBarText} !important; }

      /* Left side menu */
      .v-navigation-drawer, nav.v-navigation-drawer { background: ${C.sideBg} !important; }
      .v-navigation-drawer, .v-navigation-drawer a, .v-navigation-drawer span,
      .v-navigation-drawer .v-list-item-title { color: ${C.text} !important; opacity: 1 !important; }

      /* Page title + breadcrumbs */
      h1, h2, .text-h5, .text-h6 { color: ${C.text} !important; }
      ul li a, ul li span { opacity: 1 !important; }

      /* Products table */
      .v-table, .v-table__wrapper, .v-table > .v-table__wrapper > table { background: ${C.panelBg} !important; }
      .v-table thead th {
          background: ${C.headerRowBg} !important; color: ${C.text} !important;
          font-weight: 700 !important; font-size: 13px !important;
          border-bottom: 2px solid ${C.border} !important;
      }
      .v-table tbody tr.tableRow td { border-bottom: 1px solid ${C.border} !important; color: ${C.text} !important; }
      .v-table tbody tr.tableRow:nth-child(even) td { background: ${C.rowStripe} !important; }
      .v-table tbody tr.tableRow:hover td { background: ${C.rowHover} !important; }

      /* Read-only money columns (MSRP, Proc Price, Combined) are faint grey in Chipply */
      .psvMoneyCell, .psvMoneyCell * { color: ${C.mutedText} !important; opacity: 1 !important; font-weight: 600; }

      /* Inputs: give them real boxes instead of a faint underline */
      .v-table input[type="text"], .v-table input[type="number"] {
          border: 1px solid ${C.border} !important; border-radius: 4px !important;
          background: #fff !important; color: ${C.text} !important;
          padding: 2px 4px !important; font-weight: 400 !important;
      }
      /* Weight box is only ~20px wide - keep padding tiny so the number isn't cut off */
      .v-table input[type="number"] { padding: 2px 1px !important; text-align: center; }
      .v-table input[type="text"]:focus, .v-table input[type="number"]:focus {
          outline: 2px solid ${C.accent} !important; border-color: ${C.accent} !important;
      }
      .v-field__outline, .v-input__control .v-field--variant-underlined .v-field__outline::before {
          border-color: ${C.border} !important; opacity: 1 !important;
      }

      /* Buttons: solid accent instead of bright Chipply blue */
      .v-btn.bg-primary, .v-btn.text-primary.v-btn--variant-flat, .v-btn--variant-elevated.bg-primary {
          background: ${C.accent} !important; color: #fff !important;
      }
      .v-btn.bg-primary:hover { background: ${C.accentDark} !important; }
      .v-btn--variant-outlined { border-color: ${C.border} !important; color: ${C.text} !important; }

      /* Listing / Review / Inventory tabs: make the selected one obvious */
      .v-tabs .v-btn { color: ${C.mutedText} !important; font-weight: 600; }
      .v-tabs .v-btn.v-tab--selected, .v-tabs .v-btn.v-slide-group-item--active {
          background: ${C.accent} !important; color: #fff !important;
      }

      /* Products header band (breadcrumbs + "Products" title) -> Teesom dark blue */
      .v-sheet.textHeading { background: ${C.teesomBlue} !important; }
      .v-sheet.textHeading, .v-sheet.textHeading .headingStyle, .v-sheet.textHeading li,
      .v-sheet.textHeading li a, .v-sheet.textHeading li span, .v-sheet.textHeading .v-breadcrumbs-divider,
      .v-sheet.textHeading .v-icon { color: #fff !important; opacity: 1 !important; }
      /* keep the right-side icon buttons readable on the dark band */
      .v-sheet.textHeading .v-btn { background: #fff !important; color: ${C.teesomBlue} !important; }
      .v-sheet.textHeading .v-btn .v-icon, .v-sheet.textHeading .v-btn .v-btn__content { color: ${C.teesomBlue} !important; }

      /* Process + Categories: same outlined look as the Sizes & Colors box, no bright blue */
      .v-btn.process-button, .v-btn.category-selector-btn {
          background: transparent !important; color: ${C.chipText} !important;
          border: 1px solid ${C.chipBorder} !important; border-radius: 8px !important;
          box-shadow: none !important;
      }
      .v-btn.process-button .v-icon, .v-btn.category-selector-btn .v-icon,
      .v-btn.process-button .v-btn__content, .v-btn.category-selector-btn .v-btn__content {
          color: ${C.chipText} !important;
      }
      .v-btn.process-button:hover, .v-btn.category-selector-btn:hover {
          background: ${C.rowHover} !important; border-color: ${C.teesomBlue} !important;
      }
      .v-btn.process-button .v-btn__overlay, .v-btn.category-selector-btn .v-btn__overlay { opacity: 0 !important; }
      /* the little "2" process count bubble */
      .process-button .v-badge__badge, td .v-badge__badge { background: ${C.teesomBlue} !important; color: #fff !important; }

      /* Links */
      a { color: ${C.accent}; }

      /* Disabled / greyed bits Chipply fades to ~40% */
      .text-disabled, .text-medium-emphasis, .v-list-item--disabled { opacity: 1 !important; color: ${C.mutedText} !important; }
    `;

    function addTheme() {
        if (document.getElementById('gg-chipply-theme')) return;
        const s = document.createElement('style');
        s.id = 'gg-chipply-theme';
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
    }
    // ===== Columns to hide on the Products list (header text, lowercase) =====
    const HIDE_COLUMNS = ['sort', 'weight (oz)', 'prod msrp', 'combined'];

    // Finds those columns by their header text (so it still works if Chipply reorders columns)
    // and hides the header plus every row's cell in that position.
    function hideColumns() {
        const ths = [...document.querySelectorAll('.v-table thead th')];
        if (!ths.length) return;
        const idx = [];
        ths.forEach((th, i) => {
            const name = th.innerText.replace(/\s+/g, ' ').trim().toLowerCase();
            if (HIDE_COLUMNS.includes(name)) idx.push(i + 1);
        });
        const rules = idx.map(n =>
            `.v-table thead tr > th:nth-child(${n}), .v-table tbody tr.tableRow > td:nth-child(${n}) { display: none !important; }`
        ).join('\n');
        let s = document.getElementById('gg-chipply-hide-cols');
        if (!s) { s = document.createElement('style'); s.id = 'gg-chipply-hide-cols'; document.head.appendChild(s); }
        if (s.textContent !== rules) s.textContent = rules;
    }

    function run() { addTheme(); hideColumns(); }
    run();
    // Chipply rebuilds its page on navigation; make sure the theme stays put
    let pending = false;
    new MutationObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; run(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
})();

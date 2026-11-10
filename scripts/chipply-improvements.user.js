// ==UserScript==
// @name         Chipply Improvements
// @namespace    https://github.com/ggsilkscreen
// @version      1.0
// @description  GG Silkscreen tweaks for Chipply. Products list: always-visible pencil on the left of each row opens Edit Product.
// @author       GG Silkscreen
// @match        https://manage.chipply.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/chipply-improvements.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/chipply-improvements.user.js
// ==/UserScript==

(function () {
    'use strict';

    const CSS = `
        .gg-edit-pencil {
            display: flex; align-items: center; justify-content: center;
            width: 30px; height: 30px; margin: 0 auto 4px; padding: 0;
            border: none; border-radius: 6px; cursor: pointer;
            background: #1565c0; box-shadow: 0 1px 2px rgba(0,0,0,.25);
            transition: transform .1s, background .1s;
        }
        .gg-edit-pencil:hover { background: #0d47a1; transform: scale(1.08); }
        .gg-edit-pencil svg { width: 17px; height: 17px; fill: #fff; }
        td.psvDragCell.gg-has-pencil {
            width: 40px !important; min-width: 40px !important; text-align: center;
        }
    `;

    const ICON = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

    function addStyles() {
        if (document.getElementById('gg-pencil-css')) return;
        const s = document.createElement('style');
        s.id = 'gg-pencil-css';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    function addPencils() {
        document.querySelectorAll('tbody tr.tableRow').forEach(tr => {
            const cell = tr.querySelector('td.psvDragCell');
            if (!cell || cell.querySelector('.gg-edit-pencil')) return;
            // Only rows that have Chipply's own (hover-only) Edit Product button
            if (!tr.querySelector('.rowActionsCell button[title="Edit Product"]')) return;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'gg-edit-pencil';
            btn.title = 'Edit Product';
            btn.innerHTML = ICON;

            // Don't let a click start a row drag / reorder
            btn.addEventListener('mousedown', e => e.stopPropagation());
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                // Look it up at click time in case Chipply re-rendered the row
                const edit = tr.querySelector('.rowActionsCell button[title="Edit Product"]');
                if (edit) edit.click();
            });

            cell.classList.add('gg-has-pencil');
            cell.prepend(btn);
        });
    }

    addStyles();
    addPencils();

    // Chipply redraws rows (loading more products, sorting, coming back from Edit) — re-add as needed
    let pending = false;
    new MutationObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; addStyles(); addPencils(); });
    }).observe(document.body, { childList: true, subtree: true });
})();

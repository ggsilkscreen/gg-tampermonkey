// ==UserScript==
// @name         Teesom Copy Buttons (Design Number + Email) V9.23
// @namespace    https://app.teesom.com/
// @version      1.1.1
// @description  Adds a small copy icon next to the blue "Design Number" text and next to "jcwmailme" email addresses on Teesom pages, so you can copy them without highlighting/selecting text.
// @author       Ross
// @match        https://app.teesom.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-copy-buttons.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-copy-buttons.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Each target: a CSS selector for the element to copy, a label for the
    // button tooltip, and (optionally) how to pull the text to copy out of
    // the matched element — defaults to its trimmed textContent.
    const TARGETS = [
        {
            // Design-number links on the order page, e.g.:
            // <a class="btndupadmineditart btneditartact cp" title="Design Number - Click to Edit Art">SCR-BLA0003-16351</a>
            selector: 'a.btndupadmineditart',
            label: 'Copy design number'
        },
        {
            // Email addresses shown via the "mail me" span, e.g.:
            // <span class="jcwmailme">Jenny@lobstertrap.net</span>
            selector: 'span.jcwmailme',
            label: 'Copy email address'
        }
    ];

    const PROCESSED_ATTR = 'data-copybtn-added';

    const COPY_ICON = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>`;

    const CHECK_ICON = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;

    function fallbackCopy(text, done) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        document.body.removeChild(ta);
        done();
    }

    function copyText(text, btn) {
        const done = () => {
            btn.innerHTML = CHECK_ICON;
            btn.style.color = '#2ecc71';
            setTimeout(() => {
                btn.innerHTML = COPY_ICON;
                btn.style.color = '';
            }, 1000);
        };

        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text, 'text');
            done();
            return;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else {
            fallbackCopy(text, done);
        }
    }

    function makeCopyButton(getText, label) {
        const btn = document.createElement('span');
        btn.innerHTML = COPY_ICON;
        btn.title = label;
        btn.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
            'cursor:pointer',
            'color:#888',
            'margin-right:4px',
            'vertical-align:middle',
            'transition:color .15s'
        ].join(';');

        btn.addEventListener('mouseenter', () => { btn.style.color = '#3498db'; });
        btn.addEventListener('mouseleave', () => { btn.style.color = ''; });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyText(getText(), btn);
        });

        return btn;
    }

    function addCopyButtons() {
        TARGETS.forEach(({ selector, label }) => {
            document.querySelectorAll(selector).forEach((el) => {
                if (el.hasAttribute(PROCESSED_ATTR)) return;
                el.setAttribute(PROCESSED_ATTR, '1');

                const btn = makeCopyButton(() => el.textContent.trim(), label);
                el.parentNode.insertBefore(btn, el);
            });
        });
    }

    // Run once for whatever is already on the page...
    addCopyButtons();

    // ...and keep watching, since content on Teesom pages is often loaded
    // or reloaded via AJAX after the initial page load.
    const observer = new MutationObserver(() => addCopyButtons());
    observer.observe(document.body, { childList: true, subtree: true });
})();
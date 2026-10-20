// ==UserScript==
// @name         Teesom Art - Paste Image to Upload
// @namespace    ggsilkscreen
// @version      1.1.1
// @description  With the Teesom art window open, press Ctrl+V or click "Paste Image" to upload the image on your clipboard (screenshot, copied image) straight into Art Images. Works from the Details tab or the Images tab.
// @match        https://app.teesom.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-paste-image.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-paste-image.user.js
// ==/UserScript==

(function () {
    'use strict';

    const PANEL = '#art_v2_panel';
    const FILE_INPUT = '#art_v2_file_input';
    const IMAGES_TAB_BTN = '#art_v2_panel .jcw-slideout-nav-btn[data-section="images"]';
    const DETAILS_ANCHOR = '#art_v2_panel .art-v2-detail-manage-images';   // "Manage images" button
    const IMAGES_ANCHOR = '#art_v2_panel .art-v2-upload-images';           // "Upload Images" button
    const BTN_CLASS = 'gg-paste-image-btn';

    // The art window is a slide-out that stays in the page and sits off-screen when closed.
    function artWindowIsOpen() {
        const panel = document.querySelector(PANEL);
        if (!panel || !document.body.classList.contains('jcw-slideout-open')) return false;
        const r = panel.getBoundingClientRect();
        return r.width > 0 && r.left < window.innerWidth - 100;
    }

    function toast(msg, isError) {
        const fn = isError ? window.snack_err : window.snack_info;
        if (typeof fn === 'function') { fn(msg); return; }
        const el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:999999;' +
            'padding:10px 16px;border-radius:6px;color:#fff;font:14px sans-serif;background:' +
            (isError ? '#c0392b' : '#333');
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    function stamp() {
        const d = new Date(), p = n => String(n).padStart(2, '0');
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
            p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    }

    // Clipboard screenshots all arrive as "image.png" - give each a unique name.
    function nameFiles(blobs) {
        const s = stamp();
        return blobs.map((f, i) => {
            const ext = ((f.type || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg');
            const generic = !f.name || /^image\.\w+$/i.test(f.name);
            const name = generic ? 'pasted-' + s + (blobs.length > 1 ? '-' + (i + 1) : '') + '.' + ext : f.name;
            return new File([f], name, { type: f.type || 'image/png' });
        });
    }

    // Images from a Ctrl+V paste event.
    function imagesFromPasteEvent(e) {
        const items = (e.clipboardData && e.clipboardData.items) || [];
        const out = [];
        for (const it of items) {
            if (it.kind === 'file' && it.type.indexOf('image/') === 0) {
                const f = it.getAsFile();
                if (f) out.push(f);
            }
        }
        return nameFiles(out);
    }

    // Images read directly from the clipboard (button click). Chrome asks for
    // clipboard permission for app.teesom.com the first time - click Allow.
    async function imagesFromClipboardApi() {
        const out = [];
        const items = await navigator.clipboard.read();
        for (const item of items) {
            const type = item.types.find(t => t.indexOf('image/') === 0);
            if (type) out.push(await item.getType(type));
        }
        return nameFiles(out);
    }

    // The upload input only exists once the Images tab has been rendered.
    function getFileInput() {
        return new Promise(resolve => {
            let input = document.querySelector(FILE_INPUT);
            if (input) return resolve(input);
            const tab = document.querySelector(IMAGES_TAB_BTN);
            if (!tab) return resolve(null);
            tab.click();
            const started = Date.now();
            const timer = setInterval(() => {
                input = document.querySelector(FILE_INPUT);
                if (input || Date.now() - started > 6000) {
                    clearInterval(timer);
                    resolve(input || null);
                }
            }, 100);
        });
    }

    async function uploadFiles(files) {
        const input = await getFileInput();
        if (!input) {
            toast('Paste upload: could not find the Art Images uploader (no edit permission on this art?)', true);
            return;
        }
        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));
        input.files = dt.files;
        // Teesom listens for "change" on this input and runs its normal compress + upload.
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ---- Ctrl+V -------------------------------------------------------------

    document.addEventListener('paste', async function (e) {
        if (!artWindowIsOpen()) return;

        const t = e.target;
        // Teesom's Communication tab already handles pasted images itself - leave it alone.
        if (t && t.closest && t.closest('#art_v2_sec_comms, .art-v2-comms')) return;

        // Typing in a text box and the clipboard has text in it? That's a normal text paste.
        const inTextField = t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName));
        const types = Array.from((e.clipboardData && e.clipboardData.types) || []);
        if (inTextField && types.indexOf('text/plain') !== -1) return;

        const files = imagesFromPasteEvent(e);
        if (!files.length) return;

        e.preventDefault();
        e.stopPropagation();
        uploadFiles(files);
    }, true);

    // ---- Paste Image buttons ------------------------------------------------

    async function onPasteButtonClick(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!navigator.clipboard || !navigator.clipboard.read) {
            toast('Paste Image: this browser cannot read the clipboard from a button - use Ctrl+V instead.', true);
            return;
        }
        let files;
        try {
            files = await imagesFromClipboardApi();
        } catch (err) {
            toast('Paste Image: clipboard access was blocked. Allow clipboard access for app.teesom.com (lock icon in the address bar), or use Ctrl+V.', true);
            return;
        }
        if (!files.length) {
            toast('Paste Image: no image on the clipboard. Copy an image or take a screenshot first.', true);
            return;
        }
        uploadFiles(files);
    }

    function makeButton(variantClass) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'jcw-slideout-btn ' + variantClass + ' jcw-slideout-btn-sm ' + BTN_CLASS;
        b.title = 'Upload the image on your clipboard (same as Ctrl+V)';
        b.innerHTML = '<span class="material-icons jcw-slideout-icon-14">content_paste</span> Paste Image';
        b.addEventListener('click', onPasteButtonClick);
        return b;
    }

    // Teesom re-draws these sections often, so re-add the buttons whenever they go missing.
    function ensureButtons() {
        // Details tab: under "Manage images"
        const manage = document.querySelector(DETAILS_ANCHOR);
        if (manage && !manage.parentElement.querySelector('.' + BTN_CLASS)) {
            manage.insertAdjacentElement('afterend', makeButton('jcw-slideout-btn-outline'));
        }
        // Images tab: left of "Upload Images" (only present when you can edit the art)
        const upload = document.querySelector(IMAGES_ANCHOR);
        if (upload && !upload.parentElement.querySelector('.' + BTN_CLASS)) {
            upload.insertAdjacentElement('beforebegin', makeButton('jcw-slideout-btn-outline'));
        }
    }

    let queued = false;
    new MutationObserver(function () {
        if (queued) return;
        queued = true;
        setTimeout(function () { queued = false; ensureButtons(); }, 50);
    }).observe(document.body, { childList: true, subtree: true });

    ensureButtons();
})();
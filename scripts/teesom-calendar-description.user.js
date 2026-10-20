// ==UserScript==
// @name         Teesom Calendar Description - Same Line Italic (Cached)
// @namespace    http://tampermonkey.net/
// @version      3.0.1
// @match        *://app.teesom.com/saiw/calendar.asp*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-calendar-description.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-calendar-description.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---- Settings ----
  const CACHE_KEY = 'teesomDescCache_v1';
  const REVALIDATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // quietly re-check cached entries older than 7 days
  const MAX_ENTRIES = 3000;                             // oldest entries get pruned past this
  const CONCURRENCY = 4;                                // parallel fetches (was 1 at a time + 100ms gap)

  // ---- Persistent cache (Tampermonkey storage - survives reloads/restarts) ----
  let cache = GM_getValue(CACHE_KEY, {});
  let saveTimer = null;

  function saveCache() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const keys = Object.keys(cache);
      if (keys.length > MAX_ENTRIES) {
        keys.sort((a, b) => cache[a].t - cache[b].t)
          .slice(0, keys.length - MAX_ENTRIES)
          .forEach(k => delete cache[k]);
      }
      GM_setValue(CACHE_KEY, cache);
    }, 500); // batch many writes into one
  }

  GM_registerMenuCommand('Clear description cache', () => {
    cache = {};
    GM_setValue(CACHE_KEY, cache);
    location.reload();
  });

  // ---- Styles injected once instead of per-element inline styles ----
  const style = document.createElement('style');
  style.textContent = `
    .tm-desc-host { text-overflow: clip !important; overflow: visible !important; white-space: nowrap !important; }
    .tm-desc { font-style: italic; font-size: .95em; opacity: .9; }
    .tm-desc::before { content: " - "; font-style: normal; }
  `;
  document.head.appendChild(style);

  // ---- Rendering (idempotent: safe to call repeatedly) ----
  function render(order, text) {
    const host = order.querySelector('.td-companyname');
    if (!host) return;
    let span = host.querySelector(':scope > .tm-desc');
    if (!text) { if (span) span.remove(); return; }
    if (!span) {
      span = document.createElement('span');
      span.className = 'tm-desc';
      host.appendChild(span);
      host.classList.add('tm-desc-host');
    }
    if (span.textContent !== text) span.textContent = text;
  }

  // Updates every copy of an order on the calendar (e.g. multi-day items)
  function renderAll(dbid, text) {
    document
      .querySelectorAll(`.calendardayitem[dbid="${CSS.escape(dbid)}"]`)
      .forEach(order => render(order, text));
  }

  // ---- Fetching ----
  async function fetchDesc(dbid) {
    // Same-origin fetch: sends your Teesom login cookies automatically
    const res = await fetch(`/saiw/orderentry.asp?oid=${encodeURIComponent(dbid)}`, {
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const el = doc.getElementById('ciodescription');
    if (!el) return '';
    // Works whether it's a div, textarea or input
    const raw = ('value' in el && el.value) ? el.value : el.textContent;
    return (raw || '').trim();
  }

  // ---- Small parallel queue with de-duplication ----
  const queue = [];
  const inFlight = new Set();
  let active = 0;

  function enqueue(dbid) {
    if (inFlight.has(dbid)) return;
    inFlight.add(dbid);
    queue.push(dbid);
    pump();
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const dbid = queue.shift();
      active++;
      fetchDesc(dbid)
        .then(text => {
          cache[dbid] = { d: text, t: Date.now() }; // empty descriptions cached too, so they're not re-fetched
          saveCache();
          renderAll(dbid, text);
        })
        .catch(err => console.warn(`[Teesom desc] ${dbid}:`, err))
        .finally(() => {
          active--;
          inFlight.delete(dbid);
          pump();
        });
    }
  }

  // ---- Scan the calendar ----
  function scan() {
    const now = Date.now();
    document
      .querySelectorAll('.calendardayitem[dbid]:not([data-desc-loaded])')
      .forEach(order => {
        order.setAttribute('data-desc-loaded', '1');
        const dbid = order.getAttribute('dbid');
        const hit = cache[dbid];
        if (hit) {
          render(order, hit.d);                         // instant from cache
          if (now - hit.t < REVALIDATE_AFTER_MS) return; // fresh enough, no network
        }
        enqueue(dbid); // not cached, or stale -> fetch in background
      });
  }

  // Debounced observer: many DOM changes in one frame = one scan
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  }).observe(document.body, { childList: true, subtree: true });

  scan();
})();
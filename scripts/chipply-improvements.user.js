// ==UserScript==
// @name         Chipply Improvements
// @namespace    https://github.com/ggsilkscreen
// @version      1.2.1
// @description  GG Silkscreen tweaks for Chipply. Products list: green Edit pencil above each Active toggle, plus a Print List button that opens a clean 8.5x11 portrait product list.
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
        /* Edit pencil sits in the Active column, above the toggle, in the toggle's green */
        .gg-edit-pencil {
            display: flex; align-items: center; justify-content: center;
            width: 24px; height: 24px; margin: 0 auto 6px; padding: 0;
            border: none; border-radius: 5px; cursor: pointer;
            background: #347e38; box-shadow: 0 1px 2px rgba(0,0,0,.25);
            transition: transform .1s, background .1s;
        }
        .gg-edit-pencil:hover { background: #28632b; transform: scale(1.1); }
        .gg-edit-pencil svg { width: 14px; height: 14px; fill: #fff; }
        #gg-print-list-btn {
            display: inline-flex; align-items: center; gap: 6px;
            margin-left: 12px; height: 36px; padding: 0 14px;
            border: 1px solid #c9c9c9; border-radius: 8px; background: #fff;
            font: 500 14px Poppins, Roboto, sans-serif; color: #222; cursor: pointer;
            white-space: nowrap;
        }
        #gg-print-list-btn:hover { background: #f1f5fb; border-color: #1565c0; color: #1565c0; }
        #gg-print-list-btn svg { width: 18px; height: 18px; fill: currentColor; }
    `;

    const PENCIL = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
    const PRINTER = '<svg viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>';

    function addStyles() {
        if (document.getElementById('gg-chipply-css')) return;
        const s = document.createElement('style');
        s.id = 'gg-chipply-css';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    // ---------- Edit pencil on each product row ----------
    function addPencils() {
        document.querySelectorAll('tbody tr.tableRow').forEach(tr => {
            // The Active cell = the one holding the on/off toggle; stack the pencil under it
            const slider = tr.querySelector('td span.slider');
            const activeTd = slider && slider.closest('td');
            const cell = activeTd && (activeTd.querySelector('.psvChildCell') || activeTd);
            if (!cell || tr.querySelector('.gg-edit-pencil')) return;
            if (!tr.querySelector('.rowActionsCell button[title="Edit Product"]')) return;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'gg-edit-pencil';
            btn.title = 'Edit Product';
            btn.innerHTML = PENCIL;
            btn.addEventListener('mousedown', e => e.stopPropagation());
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const edit = tr.querySelector('.rowActionsCell button[title="Edit Product"]');
                if (edit) edit.click();
            });
            cell.prepend(btn);
        });
    }

    // ---------- Print List button ----------
    const isProductsPage = () => /\/ng\/products\.html/i.test(location.pathname);

    function addPrintButton() {
        if (!isProductsPage() || document.getElementById('gg-print-list-btn')) return;
        const tabs = document.querySelector('.v-tabs');
        const holder = tabs && tabs.closest('.left-container');
        if (!holder) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'gg-print-list-btn';
        btn.title = 'Open a simple 8.5 x 11 list of these products to view or print';
        btn.innerHTML = PRINTER + '<span>Print List</span>';
        btn.addEventListener('click', openPrintList);
        holder.appendChild(btn);
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const val = (td, sel = 'input') => (td && td.querySelector(sel) ? td.querySelector(sel).value : '').trim();
    const txt = td => (td ? td.innerText : '').replace(/\s+/g, ' ').trim();

    // Chipply only draws rows near the screen; scroll each blank one into view so every product is filled in
    async function renderAllRows() {
        const scroller = document.querySelector('.v-table__wrapper');
        const keepTop = scroller ? scroller.scrollTop : 0;
        const keepWin = window.scrollY;
        for (const tr of document.querySelectorAll('tbody tr.tableRow')) {
            if (tr.children.length < 10) { tr.scrollIntoView({ block: 'center' }); await sleep(200); }
        }
        await sleep(250);
        if (scroller) scroller.scrollTop = keepTop;
        window.scrollTo(0, keepWin);
    }

    function money(v) {
        if (v === '' || v == null) return '';
        const n = parseFloat(String(v).replace(/[$,]/g, ''));
        return isNaN(n) ? esc(v) : '$' + n.toFixed(2);
    }

    function readProducts() {
        // Map header text -> column index so it keeps working if Chipply moves columns
        const heads = [...document.querySelectorAll('thead th')].map(t => t.innerText.replace(/\s+/g, ' ').trim().toLowerCase());
        const col = name => heads.indexOf(name);
        const C = {
            active: col('active'), sort: col('sort'), name: col('product name'), style: col('vendor / style'),
            process: col('process'), cat: col('categories'), cost: col('prod cost'), price: col('prod price'),
            fund: col('fund ($)'), sell: col('sell price')
        };
        const list = [];
        document.querySelectorAll('tbody tr.tableRow').forEach(tr => {
            const td = [...tr.children];
            if (td.length < 10) return;
            const proc = td[C.process];
            let process = txt(proc);
            const badge = proc && proc.querySelector('.v-badge__badge');
            if (badge && process.endsWith(' ' + badge.innerText.trim())) process = process.slice(0, -badge.innerText.trim().length - 1);
            const styleTd = td[C.style];
            const img = tr.querySelector('img');
            const activeInput = td[C.active] && td[C.active].querySelector('input');
            list.push({
                img: img ? img.src : '',
                active: activeInput ? activeInput.checked : true,
                sort: val(td[C.sort]),
                name: txt(td[C.name]),
                vendor: styleTd ? txt(styleTd) : '',
                style: val(styleTd),
                process,
                cat: txt(td[C.cat]),
                cost: val(td[C.cost]),
                price: val(td[C.price]),
                fund: val(td[C.fund]),
                sell: val(td[C.sell])
            });
        });
        return list;
    }

    function storeName() {
        const os = [...document.querySelectorAll('li span, li a')].find(e => e.innerText.trim() === 'Online Stores');
        const ul = os && os.closest('ul');
        const last = ul && ul.querySelector('li:last-child');
        return last ? last.innerText.trim() : 'Products';
    }

    async function openPrintList() {
        const win = window.open('', '_blank');
        if (!win) { alert('Chrome blocked the print window. Allow pop-ups for manage.chipply.com and try again.'); return; }
        win.document.write('<p style="font:14px sans-serif;padding:20px">Building product list…</p>');

        await renderAllRows();
        const products = readProducts();
        const store = storeName();
        const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        const rows = products.map(p => `
            <tr class="${p.active ? '' : 'inactive'}">
                <td class="c-img">${p.img ? `<img src="${esc(p.img)}">` : ''}</td>
                <td class="c-sort">${esc(p.sort)}</td>
                <td class="c-name"><b>${esc(p.name)}</b>${p.active ? '' : ' <span class="tag">Inactive</span>'}</td>
                <td class="c-style">${esc(p.style)}<div class="sub">${esc(p.vendor)}</div></td>
                <td class="c-proc">${esc(p.process)}</td>
                <td class="c-cat">${esc(p.cat)}</td>
                <td class="c-num c-cost">${money(p.cost)}</td>
                <td class="c-num c-cost">${money(p.price)}</td>
                <td class="c-num c-cost">${money(p.fund)}</td>
                <td class="c-num c-sell"><b>${money(p.sell)}</b></td>
            </tr>`).join('');

        const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(store)} - Product List</title>
<style>
  @page { size: letter portrait; margin: 0.4in; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #111; margin: 0; background: #e9ecef; }
  .bar { position: sticky; top: 0; display: flex; flex-wrap: wrap; gap: 14px; align-items: center;
         padding: 10px 16px; background: #1f1a1a; color: #fff; font-size: 13px; z-index: 2; }
  .bar button { background: #d32f2f; color: #fff; border: 0; border-radius: 6px; padding: 7px 16px; font-size: 14px; cursor: pointer; }
  .bar label { cursor: pointer; user-select: none; }
  .page { width: 8.5in; min-height: 11in; margin: 16px auto; padding: 0.4in; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
  h1 { font-size: 15pt; margin: 0 0 2px; }
  .meta { color: #555; font-size: 9pt; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .02em; color: #333;
       border-bottom: 1.5px solid #111; padding: 4px 5px; }
  td { padding: 4px 5px; border-bottom: 1px solid #ddd; vertical-align: middle; }
  tr { page-break-inside: avoid; }
  .c-img { width: 0.55in; } .c-img img { width: 0.5in; height: 0.5in; object-fit: contain; display: block; }
  .c-sort { width: 0.3in; text-align: center; color: #555; }
  .c-num { text-align: right; white-space: nowrap; }
  th.c-num { text-align: right; }
  .sub { color: #777; font-size: 8pt; }
  .tag { font-size: 7pt; font-weight: bold; color: #b00; border: 1px solid #b00; border-radius: 3px; padding: 0 3px; }
  tr.inactive td { color: #888; }
  body.no-img .c-img, body.no-cost .c-cost, body.hide-inactive tr.inactive { display: none; }
  @media print {
    body { background: #fff; }
    .bar { display: none; }
    .page { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
  }
</style></head><body>
<div class="bar">
  <button onclick="window.print()">Print</button>
  <label><input type="checkbox" id="o-img" checked> Pictures</label>
  <label><input type="checkbox" id="o-cost" checked> Cost / Price / Fund</label>
  <label><input type="checkbox" id="o-inact"> Hide inactive</label>
  <span style="opacity:.7">Letter, portrait. Set Margins to Default in the print dialog.</span>
</div>
<div class="page">
  <h1>${esc(store)}</h1>
  <div class="meta">${products.length} products &middot; printed ${esc(today)}</div>
  <table>
    <thead><tr>
      <th class="c-img"></th><th class="c-sort">#</th><th>Product</th><th>Style</th><th>Process</th><th>Category</th>
      <th class="c-num c-cost">Cost</th><th class="c-num c-cost">Price</th><th class="c-num c-cost">Fund</th><th class="c-num">Sell</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
<script>
  const b = document.body;
  document.getElementById('o-img').onchange = e => b.classList.toggle('no-img', !e.target.checked);
  document.getElementById('o-cost').onchange = e => b.classList.toggle('no-cost', !e.target.checked);
  document.getElementById('o-inact').onchange = e => b.classList.toggle('hide-inactive', e.target.checked);
<\/script>
</body></html>`;

        win.document.open();
        win.document.write(html);
        win.document.close();
    }

    // ---------- run ----------
    function run() { addStyles(); addPencils(); addPrintButton(); }
    run();

    let pending = false;
    new MutationObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; run(); });
    }).observe(document.body, { childList: true, subtree: true });
})();

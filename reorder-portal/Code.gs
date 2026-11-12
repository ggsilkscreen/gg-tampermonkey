/**
 * GG Silkscreen - Customer Reorder Portal
 *
 * A Google Sheet holds each customer's reorderable jobs (pushed from Teesom) and the reorder
 * requests customers send. Customers open a private link, enter quantities and send it.
 * No prices are shown: Teesom prices the order when it is imported.
 *
 * Files in this project: Code.gs (this file) and Index.html (the customer page).
 *
 * First-time setup (in the ggsilkscreendrive@gmail.com account):
 *   1. Run setup() once and approve the permissions. It creates the "GG Reorder Portal" Sheet.
 *   2. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Copy the /exec URL.
 *   3. Run showSetupInfo() and copy the SETUP CODE from the log.
 *      The first time someone clicks a portal button in Teesom, it asks for that code (once per computer).
 *
 * How it is used:
 *   Teesom CREATE PORTAL  -> createPortal   (makes the customer's private link)
 *   Teesom PUSH TO PORTAL -> pushJobs       (adds jobs from an order to their page)
 *   Customer page         -> submitReorder  (saved in the Requests tab, emailed to the shop)
 *   Teesom IMPORT REORDER -> pending / markBuilt
 */

var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbytwPDcB42GCqjr12NR8_2ilo-3lCZc5kk2NklHn4gUP8BLtlQfPjInHP2JTeoiN0JV/exec';   // the deployed /exec address (the editor only knows its /dev test address)
var NOTIFY_EMAIL_DEFAULT = 'ross@ggsilkscreen.com';   // where new requests are emailed (change in Script Properties: NOTIFY_EMAIL)

var TABS = {
  Customers: ['compId', 'token', 'name', 'code', 'contact', 'contId', 'rep', 'created', 'updated'],
  Jobs: ['id', 'compId', 'orderNo', 'jobName', 'pushed', 'active', 'json'],
  Requests: ['id', 'submitted', 'compId', 'customer', 'name', 'email', 'phone', 'neededBy', 'pieces', 'status', 'builtAt', 'teesomOrder', 'notes', 'json']
};

function props_() { return PropertiesService.getScriptProperties(); }
function book_() {
  var id = props_().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setup() first.');
  return SpreadsheetApp.openById(id);
}
function sheet_(name) { return book_().getSheetByName(name); }
function now_() { return new Date().toISOString(); }
function randomToken_(n) {
  var c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', s = '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random() + Date.now());
  for (var i = 0; i < n; i++) s += c.charAt((bytes[i % bytes.length] + 256 + Math.floor(Math.random() * 256)) % c.length);
  return s;
}

// ---------------------------------------------------------------- setup

function setup() {
  var p = props_(), ss;
  if (p.getProperty('SHEET_ID')) ss = SpreadsheetApp.openById(p.getProperty('SHEET_ID'));
  else { ss = SpreadsheetApp.create('GG Reorder Portal'); p.setProperty('SHEET_ID', ss.getId()); }
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var first = ss.getSheetByName('Sheet1'); if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
  if (!p.getProperty('API_SECRET')) p.setProperty('API_SECRET', randomToken_(40));
  if (!p.getProperty('NOTIFY_EMAIL')) p.setProperty('NOTIFY_EMAIL', NOTIFY_EMAIL_DEFAULT);
  Logger.log('Sheet: ' + ss.getUrl());
  return showSetupInfo();
}

/** Run after deploying. The SETUP CODE is what Teesom asks for the first time a portal button is used. */
function showSetupInfo() {
  var url = WEB_APP_URL || ScriptApp.getService().getUrl();
  var secret = props_().getProperty('API_SECRET');
  var code = Utilities.base64Encode(JSON.stringify({ url: url, secret: secret }));
  Logger.log('Web app URL: ' + url);
  Logger.log('Requests are emailed to: ' + props_().getProperty('NOTIFY_EMAIL'));
  Logger.log('SETUP CODE (paste into Teesom when asked):\n' + code);
  return code;
}

// ---------------------------------------------------------------- sheet helpers

function rows_(name) {
  var sh = sheet_(name), v = sh.getDataRange().getValues(), head = v[0], out = [];
  for (var r = 1; r < v.length; r++) {
    var o = { _row: r + 1 };
    head.forEach(function (h, i) { o[h] = v[r][i]; });
    out.push(o);
  }
  return out;
}
function put_(name, obj, row) {
  var sh = sheet_(name), head = TABS[name];
  var vals = [head.map(function (h) { return obj[h] == null ? '' : String(obj[h]); })];
  if (row) sh.getRange(row, 1, 1, head.length).setValues(vals);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, head.length).setValues(vals);
}
function customerByToken_(token) {
  if (!token) return null;
  return rows_('Customers').filter(function (c) { return c.token === token; })[0] || null;
}
function customerById_(compId) {
  return rows_('Customers').filter(function (c) { return c.compId === compId; })[0] || null;
}
/** The customer page gets a short code for each job instead of Teesom's ids. */
function pubId_(id) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'job:' + id).slice(0, 8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function link_(token) { return ScriptApp.getService().getUrl() + '?k=' + token; }

// ---------------------------------------------------------------- Teesom API (doPost)

function doPost(e) {
  var out;
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body.secret || body.secret !== props_().getProperty('API_SECRET')) throw new Error('Wrong setup code. Re-enter it from showSetupInfo().');
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var fn = { createPortal: apiCreatePortal_, pushJobs: apiPushJobs_, listJobs: apiListJobs_, removeJob: apiRemoveJob_, pending: apiPending_, markBuilt: apiMarkBuilt_ }[body.action];
      if (!fn) throw new Error('Unknown action ' + body.action);
      out = fn(body);
      out.ok = true;
    } finally { lock.releaseLock(); }
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** body.customer = { compId, name, code, contact, contId, rep } ; makes or refreshes the customer's portal. */
function apiCreatePortal_(body) {
  var c = body.customer || {};
  if (!c.compId || !c.name) throw new Error('No Teesom customer was sent.');
  var have = customerById_(c.compId), isNew = !have, t = now_();
  var row = {
    compId: c.compId, token: have ? have.token : randomToken_(24), name: c.name, code: c.code || '',
    contact: c.contact || '', contId: c.contId || '', rep: c.rep || '',
    created: have ? have.created : t, updated: t
  };
  if (body.newLink) row.token = randomToken_(24);
  put_('Customers', row, have ? have._row : null);
  var jobs = rows_('Jobs').filter(function (j) { return j.compId === c.compId && j.active !== 'no'; }).length;
  return { isNew: isNew, customer: row.name, token: row.token, link: link_(row.token), jobs: jobs };
}

/** body.customer as above; body.order = { no, title }; body.jobs = [{ key, name, garments:[...], designs:[...] }] */
function apiPushJobs_(body) {
  var portal = apiCreatePortal_({ customer: body.customer });
  var c = body.customer, order = body.order || {}, existing = rows_('Jobs'), added = 0, replaced = 0;
  (body.jobs || []).forEach(function (job) {
    var id = c.compId + '|' + order.no + '|' + job.key;
    var have = existing.filter(function (j) { return j.id === id; })[0];
    var data = { name: job.name, orderNo: order.no, orderTitle: order.title || '', garments: job.garments || [], designs: job.designs || [] };
    put_('Jobs', { id: id, compId: c.compId, orderNo: order.no, jobName: job.name, pushed: now_(), active: 'yes', json: JSON.stringify(data) }, have ? have._row : null);
    if (have) replaced++; else added++;
  });
  var total = rows_('Jobs').filter(function (j) { return j.compId === c.compId && j.active !== 'no'; }).length;
  return { customer: portal.customer, link: portal.link, isNew: portal.isNew, added: added, replaced: replaced, jobs: total };
}

function apiListJobs_(body) {
  var compId = body.compId;
  var c = customerById_(compId);
  var jobs = rows_('Jobs').filter(function (j) { return j.compId === compId && j.active !== 'no'; })
    .map(function (j) { return { id: j.id, orderNo: j.orderNo, jobName: j.jobName, pushed: j.pushed }; });
  return { exists: !!c, link: c ? link_(c.token) : '', jobs: jobs };
}

function apiRemoveJob_(body) {
  var j = rows_('Jobs').filter(function (x) { return x.id === body.id; })[0];
  if (!j) throw new Error('That job is not on the portal.');
  var obj = {}; TABS.Jobs.forEach(function (h) { obj[h] = j[h]; }); obj.active = 'no';
  put_('Jobs', obj, j._row);
  return { removed: true };
}

function apiPending_() {
  var list = rows_('Requests').filter(function (r) { return r.status === 'New'; }).map(function (r) {
    var cust = customerById_(r.compId) || {};
    return { id: r.id, submitted: r.submitted, customer: r.customer, pieces: Number(r.pieces) || 0, neededBy: r.neededBy, request: JSON.parse(r.json),
      teesom: { compId: r.compId, contId: cust.contId || '', contact: cust.contact || '', rep: cust.rep || '' } };
  });
  return { requests: list };
}

function apiMarkBuilt_(body) {
  var r = rows_('Requests').filter(function (x) { return x.id === body.id; })[0];
  if (!r) throw new Error('Request ' + body.id + ' not found.');
  var obj = {}; TABS.Requests.forEach(function (h) { obj[h] = r[h]; });
  obj.status = 'Built'; obj.builtAt = now_(); obj.teesomOrder = body.teesomOrder || '';
  put_('Requests', obj, r._row);
  return { marked: true };
}

// ---------------------------------------------------------------- customer page

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('GG Silkscreen - Reorder').addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Called from the page. Only what the customer needs: no costs, prices or Teesom ids. */
function getPortal(token) {
  var c = customerByToken_(token);
  if (!c) return { ok: false, error: 'This reorder link is not valid. Please contact GG Silkscreen at (508) 830-1075 or sales@ggsilkscreen.com.' };
  var jobs = rows_('Jobs').filter(function (j) { return j.compId === c.compId && j.active !== 'no'; })
    .map(function (j) { var d = JSON.parse(j.json); return { id: pubId_(j.id), name: d.name, orderNo: d.orderNo, garments: d.garments, designs: d.designs, pushed: j.pushed }; })
    .sort(function (a, b) { return String(b.pushed).localeCompare(String(a.pushed)); });
  return { ok: true, customer: c.name, contact: c.contact, jobs: jobs };
}

/** form = { name, email, phone, neededBy, notes, lines:[{ jobId, style, color, sizes:[[size, qty]] }] } */
function submitReorder(token, form) {
  var c = customerByToken_(token);
  if (!c) throw new Error('This reorder link is not valid.');
  form = form || {};
  if (!String(form.name || '').trim()) throw new Error('Please enter your name.');
  if (!/^\S+@\S+\.\S+$/.test(String(form.email || '').trim())) throw new Error('Please enter a valid email address.');
  var jobs = {}; rows_('Jobs').forEach(function (j) { if (j.compId === c.compId && j.active !== 'no') jobs[pubId_(j.id)] = JSON.parse(j.json); });

  // Rebuild every line from the stored job so nothing but sizes and quantities comes from the browser.
  var byJob = {}, pieces = 0;
  (form.lines || []).forEach(function (l) {
    var job = jobs[l.jobId]; if (!job) return;
    var g = job.garments.filter(function (x) { return x.style === l.style && x.color === l.color; })[0]; if (!g) return;
    var allowed = {}; g.sizes.forEach(function (s) { allowed[String(s.size)] = true; });
    var sizes = (l.sizes || []).map(function (s) { return [String(s[0]), Math.floor(Number(s[1]) || 0)]; })
      .filter(function (s) { return allowed[s[0]] && s[1] > 0 && s[1] < 100000; });
    if (!sizes.length) return;
    var J = byJob[l.jobId] || (byJob[l.jobId] = { jobId: l.jobId, name: job.name, orderNo: job.orderNo, designs: job.designs, items: [] });
    J.items.push({ style: g.style, name: g.name, color: g.color, img: g.img, sizes: sizes });
    sizes.forEach(function (s) { pieces += s[1]; });
  });
  var list = Object.keys(byJob).map(function (k) { return byJob[k]; });
  if (!pieces) throw new Error('Please enter a quantity for at least one size.');

  var id = 'RO-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyMMdd-HHmm') + '-' + randomToken_(3).toUpperCase();
  var request = {
    type: 'gg-reorder', version: 2, id: id, submitted: now_(), customer: c.name, customerCode: c.code,
    name: String(form.name).trim(), email: String(form.email).trim(), phone: String(form.phone || '').trim(),
    neededBy: String(form.neededBy || '').trim(), notes: String(form.notes || '').trim().slice(0, 2000),
    pieces: pieces, jobs: list
  };
  put_('Requests', { id: id, submitted: request.submitted, compId: c.compId, customer: c.name, name: request.name, email: request.email,
    phone: request.phone, neededBy: request.neededBy, pieces: pieces, status: 'New', builtAt: '', teesomOrder: '', notes: request.notes, json: JSON.stringify(request) });
  try { notify_(request); } catch (err) { Logger.log('Email failed: ' + err); }
  return { ok: true, id: id, pieces: pieces };
}

function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function notify_(r) {
  var to = props_().getProperty('NOTIFY_EMAIL') || NOTIFY_EMAIL_DEFAULT;
  var html = '<div style="font-family:Arial,sans-serif;color:#1b2733">' +
    '<h2 style="color:#163C5C;margin:0 0 4px">Reorder request: ' + esc_(r.customer) + '</h2>' +
    '<p style="margin:0 0 12px">' + r.pieces + ' pieces &middot; ' + esc_(r.id) + '</p>' +
    '<p style="margin:0 0 12px"><b>From:</b> ' + esc_(r.name) + ' &lt;' + esc_(r.email) + '&gt;' + (r.phone ? ' &middot; ' + esc_(r.phone) : '') +
    '<br><b>Needed by:</b> ' + esc_(r.neededBy || 'not given') + (r.notes ? '<br><b>Notes:</b> ' + esc_(r.notes) : '') + '</p>';
  r.jobs.forEach(function (j) {
    html += '<div style="border:1px solid #d7dce1;border-radius:8px;padding:10px 12px;margin:0 0 10px">' +
      '<div style="font-weight:bold;color:#163C5C">' + esc_(j.name) + ' <span style="color:#55636f;font-weight:normal">(from order #' + esc_(j.orderNo) + ')</span></div>' +
      '<div style="color:#55636f;font-size:13px;margin:2px 0 6px">Art: ' + j.designs.map(function (d) { return esc_(d.number) + (d.location ? ' (' + esc_(d.location) + ')' : ''); }).join(', ') + '</div>';
    j.items.forEach(function (it) {
      html += '<div style="font-size:14px;margin:2px 0"><b>' + esc_(it.style) + '</b> ' + esc_(it.color) + ': ' +
        it.sizes.map(function (s) { return esc_(s[0]) + ' x ' + s[1]; }).join(', ') + '</div>';
    });
    html += '</div>';
  });
  html += '<p style="color:#55636f;font-size:13px">To build it: Teesom &gt; Order List &gt; IMPORT REORDER.</p></div>';
  MailApp.sendEmail({ to: to, replyTo: r.email, subject: 'Reorder request - ' + r.customer + ' (' + r.pieces + ' pcs)', htmlBody: html, name: 'GG Reorder Portal' });
}

if (typeof module !== 'undefined') module.exports = { doPost: doPost, doGet: doGet, getPortal: getPortal, submitReorder: submitReorder, setup: setup, showSetupInfo: showSetupInfo };

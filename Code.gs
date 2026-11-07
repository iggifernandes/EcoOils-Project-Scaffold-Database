// VERSION 1.6.6  (bump here and on the var VERSION line below)
/**
 * EcoOils Mentari — Scaffold Inspection Database
 * Backend v1.0.0 · Google Apps Script bound to the Google Sheet.
 * Setup: see SETUP.md. Run setup() once, then deploy as a Web App.
 */
var VERSION = '1.6.6';
var ADMIN_EMAIL = 'YOUR_EMAIL@gmail.com';   // first admin (can log in with an emailed code)
var ADMIN_NAME = 'Iggy';
var TZ = Session.getScriptTimeZone() || 'Asia/Jakarta';
var MAX_MAIL_PER_RUN = 80;                 // free Gmail limit is ~100/day

var SHEETS = {
  Supervisors: ['id','name','contractor','phone','email','certType','certNo','issueDate','expiryDate','approval','certPhotoId','notes','createdAt','updatedAt','locked','verifiedBy','verifiedAt','deleted','deletedAt','deletedBy','deleteReason','extraPhotoIds','workStatus','statusDate','statusReason','statusBy'],
  Inspectors: ['id','name','company','phone','email','certType','certNo','issueDate','expiryDate','approval','certPhotoId','extraPhotoIds','notes','createdAt','updatedAt','locked','verifiedBy','verifiedAt','deleted','deletedAt','deletedBy','deleteReason','pinHash','pinSetAt','pinFails','pinLockUntil','workStatus','statusDate','statusReason','statusBy'],
  Scaffolders: ['id','name','contractor','role','phone','certType','certNo','issueDate','expiryDate','approval','photoId','certPhotoId','notes','createdAt','updatedAt','basicDate','basicExpiry','wahType','wahDate','wahExpiry','locked','verifiedBy','verifiedAt','deleted','deletedAt','deletedBy','deleteReason','extraPhotoIds','workStatus','statusDate','statusReason','statusBy'],
  DeleteRequests: ['reqId','kind','personId','personName','reason','requestedBy','requestedAt','status','decidedBy','decidedAt','decisionNote'],
  Submissions: ['subId','kind','personId','date','by','snapshot'],
  Scaffolds: ['refId','contractor','type','location','requestedBy','builtById','builtByName','erectedDate','loadClass','loadKg','status','lastInspectionDate','nextDueDate','inspector','tagFrontId','tagBackId','decommDate','notes','createdBy','createdAt','subLocation','redTagAt','redTagBy','redTagReason','redTagPrev','noRungs','noStandards','noLifts','boardingArea','structure','tagPending','tagPendingBy'],
  ScaffoldRequests: ['reqId','contractor','type','location','requestedBy','builtById','builtByName','erectedDate','loadClass','loadKg','notes','createdBy','createdAt','status','refId'],
  RedTags: ['tagId','refId','action','at','byEmail','byName','reason','photoId'],
  Inspections: ['inspId','refId','date','time','kind','inspector','inspectorEmail','result','failCount','checklist','comments','photoFrontId','photoBackId','createdAt','declaration'],
  Users: ['email','name','role','contractor','active'],
  Config: ['key','value'],
  Counters: ['key','n'],
  WaQueue: ['id','date','key','toName','phone','message','link','status','sentBy','sentAt'],
  Log: ['ts','user','action','detail']
};

var DEFAULT_CONFIG = {
  intervalDays: '7',
  contractors: 'GSB,WEN,KKS,PBS',
  types: 'T:Tube & Coupler|S:System (Cuplock/Ringlock)|M:Mobile Tower|H:Hanging / Suspended|X:Other',
  // Main locations = the site location list. Admin can edit it under Settings.
  mainLocations: 'ADMINISTRATION BUILDING|BLOCK 6B|COOLING TOWER|CONTROL ROOM, MCC ROOM|DDE TREATMENT PLANT (DTP)|DIESEL TANK|DIRTY COOLING TOWER|DRY AND LIQUID CHEMICAL STORAGE|EFFLUENT TREATMENT PLANT (ETP)|ELECTRICAL SUBSTATION (PLN)|EXTRACTION PLANT|FA PLANT|FIRE WATER PUMP HOUSE|FIRE WATER TANK|HEXANE AND DIESEL RECEIVING BAY|HEXANE TANK|LOADING/UNLOADING AREA (PUMP HOUSE)|OFFICE VEHICLE PARKING AREA|OIL POLISHING PLANT|PIPE RACK|PRE TREATMENT UNIT (PTU)|RAW WATER PIT|SCHEDULED & DOMESTIC WASTE SHED|SECURITY BUILDING|SECURITY POST|SILO|TANK FARM|TRUCK PARKING AREA|VAPOR ABSORPTION MACHINE (VAM) SHED|WAREHOUSE|WASTE WATER TREATMENT PLANT (WWTP)|WATER TANK|WATER TREATMENT PLANT (WTP) AND WATER TANKS|WEIGHT BRIDGE|WORKSHOP AREA'
};

var LOAD_CLASSES = [
  { k: 'Light Duty', kg: '150' },
  { k: 'General Purpose', kg: '200' },
  { k: 'Heavy Duty', kg: '250' },
  { k: 'Special Purpose', kg: '' }
];

// Checklist item ids. Labels live in the front-end (EN/ID/MS).
var CHK_HANDOVER = ['F1','F2','F3','S1','S2','S3','S4','S5','P1','P2','P3','P4','E1','E2','E3','E4','A1','A2','A3','A4','V1','V2','V3','V4','V5'];
var CHK_WEEKLY = ['W1','W2','W3','W4','W5','W6','W7','W8'];
var ROLES = ['admin','ic_admin','inspector','supervisor','viewer'];

/* ───────────── setup ───────────── */

function setup() {
  var book = ss();
  Object.keys(SHEETS).forEach(function (n) {
    var s = book.getSheetByName(n) || book.insertSheet(n);
    var h = SHEETS[n];
    s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    s.setFrozenRows(1);
    s.getRange(1, 1, s.getMaxRows(), h.length).setNumberFormat('@');
  });
  var d = book.getSheetByName('Sheet1');
  if (d && book.getSheets().length > 1) book.deleteSheet(d);
  if (!prop('ROOT_FOLDER')) setProp('ROOT_FOLDER', DriveApp.createFolder('EcoOils Scaffold Inspection Photos').getId());
  if (!prop('SECRET')) setProp('SECRET', Utilities.getUuid() + Utilities.getUuid());
  ensureConfig();
  ensureAdmin();
  installTriggers();
  Logger.log('Setup complete. Now deploy as Web App.');
}

function ensureConfig() {
  var have = {};
  rows('Config').forEach(function (r) { have[r.key] = 1; });
  Object.keys(DEFAULT_CONFIG).forEach(function (k) { if (!have[k]) appendRow('Config', { key: k, value: DEFAULT_CONFIG[k] }); });
}

function ensureAdmin() {
  var e = String(ADMIN_EMAIL).trim().toLowerCase();
  if (!e || e.indexOf('@') < 0) throw new Error('Set ADMIN_EMAIL at the top of Code.gs first.');
  if (!getUser(e)) appendRow('Users', { email: e, name: ADMIN_NAME, role: 'admin', contractor: '', active: 'TRUE' });
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyReminders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyReminders').timeBased().atHour(7).everyDays(1).create();
}

/* ───────────── low-level helpers ───────────── */

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sh(n) {
  var s = ss().getSheetByName(n);
  if (!s && SHEETS[n]) {            // upgrade-safe: create a missing tab on first use
    var h = SHEETS[n];
    s = ss().insertSheet(n);
    s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    s.setFrozenRows(1);
    s.getRange(1, 1, s.getMaxRows(), h.length).setNumberFormat('@');
  }
  return s;
}
function prop(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function setProp(k, v) { PropertiesService.getScriptProperties().setProperty(k, v); }

function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
function fmtDate(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function today() { return fmtDate(new Date()); }
function nowTime() { return Utilities.formatDate(new Date(), TZ, 'HH:mm'); }
function toMs(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function daysBetween(a, b) { return Math.round((toMs(b) - toMs(a)) / 864e5); }
function addDays(s, n) { return new Date(toMs(s) + n * 864e5).toISOString().slice(0, 10); }
function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(toMs(s)); }

function rows(n) {
  var s = sh(n);
  var v = s.getDataRange().getValues();
  var h = SHEETS[n], out = [];
  for (var i = 1; i < v.length; i++) {
    var o = { _row: i + 1 }, any = false;
    for (var j = 0; j < h.length; j++) {
      var x = v[i][j];
      if (x instanceof Date) x = fmtDate(x);
      x = (x === null || x === undefined) ? '' : String(x);
      if (x !== '') any = true;
      o[h[j]] = x;
    }
    if (any) out.push(o);
  }
  return out;
}

function toRowArray(n, o) {
  return SHEETS[n].map(function (k) { return (o[k] === null || o[k] === undefined) ? '' : String(o[k]); });
}

function appendRow(n, o) {
  var s = sh(n), r = s.getLastRow() + 1, w = SHEETS[n].length;
  if (r > s.getMaxRows()) s.insertRowsAfter(s.getMaxRows(), 1000);
  s.getRange(r, 1, 1, w).setNumberFormat('@').setValues([toRowArray(n, o)]);
}

function writeRow(n, row, o) {
  var w = SHEETS[n].length;
  sh(n).getRange(row, 1, 1, w).setNumberFormat('@').setValues([toRowArray(n, o)]);
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function audit(user, action, detail) {
  try { appendRow('Log', { ts: today() + ' ' + nowTime(), user: user, action: action, detail: String(detail || '').slice(0, 400) }); } catch (e) {}
}

function nextCounter(key) {
  var r = rows('Counters').filter(function (x) { return x.key === key; })[0];
  var n = (r ? Number(r.n) : 0) + 1;
  if (r) writeRow('Counters', r._row, { key: key, n: n }); else appendRow('Counters', { key: key, n: n });
  return n;
}

function cfg() {
  var m = {};
  rows('Config').forEach(function (r) { m[r.key] = r.value; });
  Object.keys(DEFAULT_CONFIG).forEach(function (k) { if (!m[k]) m[k] = DEFAULT_CONFIG[k]; });
  return {
    intervalDays: Math.max(1, Number(m.intervalDays) || 7),
    contractors: m.contractors.split(',').map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean),
    types: m.types.split('|').map(function (x) { var p = x.split(':'); return { k: p[0].trim().toUpperCase(), label: p.slice(1).join(':').trim() }; }).filter(function (x) { return x.k; }),
    mainLocations: m.mainLocations.split('|').map(function (x) { return x.trim(); }).filter(Boolean),
    loadClasses: LOAD_CLASSES,
    checklists: { Handover: CHK_HANDOVER, Special: CHK_HANDOVER, Weekly: CHK_WEEKLY }
  };
}

/* ───────────── mail / WhatsApp ───────────── */

var mailCount = 0;
function mail(to, subject, body) {
  if (!to) return false;
  if (mailCount >= MAX_MAIL_PER_RUN) return false;
  try { MailApp.sendEmail({ to: to, subject: subject, body: body, name: 'EcoOils Mentari HSSE' }); mailCount++; return true; }
  catch (e) { audit('system', 'mailFail', to + ' ' + e.message); return false; }
}

function normPhone(p) {
  var d = String(p || '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (d.charAt(0) === '0') d = '62' + d.slice(1);
  return d;
}

/* ───────────── auth (emailed code, signed token) ───────────── */

function getUser(email) {
  email = String(email || '').trim().toLowerCase();
  return rows('Users').filter(function (u) { return u.email.toLowerCase() === email; })[0] || null;
}

function sign(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, prop('SECRET')));
}

function makeToken(email, days) {
  var raw = email + '|' + (Date.now() + days * 864e5);
  return Utilities.base64EncodeWebSafe(raw) + '.' + sign(raw);
}

function auth(token) {
  if (!token) throw new Error('AUTH');
  var p = String(token).split('.');
  if (p.length !== 2) throw new Error('AUTH');
  var raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString();
  if (sign(raw) !== p[1]) throw new Error('AUTH');
  var q = raw.split('|');
  if (Date.now() > Number(q[1])) throw new Error('AUTH');
  var u = getUser(q[0]);
  if (!u || u.active === 'FALSE') throw new Error('AUTH');
  return u;
}

function requestCode(email) {
  email = String(email || '').trim().toLowerCase();
  var u = getUser(email);
  var c = CacheService.getScriptCache();
  if (u && u.active !== 'FALSE' && !c.get('sent:' + email)) {
    var code = String(Math.floor(100000 + Math.random() * 900000));
    c.put('sent:' + email, '1', 60);
    c.put('code:' + email, code, 600);
    c.remove('tries:' + email);
    mail(email, 'Scaffold Register login code', 'Your login code is ' + code + '\nValid for 10 minutes. Do not share it.\n\nEcoOils Mentari HSSE');
  }
  return { ok: true };
}

function verify(email, code, keep) {
  email = String(email || '').trim().toLowerCase();
  var c = CacheService.getScriptCache();
  var tries = Number(c.get('tries:' + email) || 0);
  if (tries >= 5) throw new Error('Too many attempts. Request a new code.');
  var good = c.get('code:' + email);
  if (!good || String(code || '').trim() !== good) { c.put('tries:' + email, String(tries + 1), 600); throw new Error('Wrong or expired code.'); }
  c.remove('code:' + email);
  var u = getUser(email);
  if (!u || u.active === 'FALSE') throw new Error('Not allowed.');
  audit(email, 'login', '');
  return { ok: true, token: makeToken(email, keep ? 30 : 1), user: pub(u) };
}

function pub(u) { return { email: u.email, name: u.name, role: u.role, contractor: u.contractor }; }
function need(u, roles) { if (roles.indexOf(u.role) < 0) throw new Error('Your role (' + u.role + ') cannot do this.'); }

/* ───────────── photos ───────────── */

function folderFor(name) {
  var root = DriveApp.getFolderById(prop('ROOT_FOLDER'));
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function saveImage(folderName, dataUrl, fileName) {
  var m = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Invalid photo.');
  if (m[2].length > 2400000) throw new Error('Photo too large. Retake at lower resolution.');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], fileName);
  return folderFor(folderName).createFile(blob).getId();
}

// v1.6.6: certificates may be JPG, PNG or PDF (PDF up to about 4.5 MB)
function saveDoc(folderName, dataUrl, baseName) {
  var m = /^data:(image\/jpeg|image\/png|application\/pdf);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Certificate must be a JPG, PNG or PDF file.');
  if (m[2].length > 6400000) throw new Error('File too large (max about 4.5 MB). Use a smaller file.');
  var ext = m[1] === 'application/pdf' ? '.pdf' : m[1] === 'image/png' ? '.png' : '.jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], String(baseName).replace(/\.[A-Za-z0-9]+$/, '') + ext);
  return folderFor(folderName).createFile(blob).getId();
}

function extraIds(r) { try { var a = JSON.parse(r.extraPhotoIds || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

function knownFile(id) {
  var found = false;
  rows('Scaffolds').forEach(function (r) { if (r.tagFrontId === id || r.tagBackId === id) found = true; });
  if (!found) rows('Inspections').forEach(function (r) { if (r.photoFrontId === id || r.photoBackId === id) found = true; });
  if (!found) rows('Supervisors').forEach(function (r) { if (r.certPhotoId === id || extraIds(r).indexOf(id) >= 0) found = true; });
  if (!found) rows('Inspectors').forEach(function (r) { if (r.certPhotoId === id || extraIds(r).indexOf(id) >= 0) found = true; });
  if (!found) rows('Scaffolders').forEach(function (r) { if (r.photoId === id || r.certPhotoId === id || extraIds(r).indexOf(id) >= 0) found = true; });
  return found;
}

function getPhoto(u, p) {
  var id = String(p.id || '');
  if (!id || !knownFile(id)) throw new Error('Photo not found.');
  var b = DriveApp.getFileById(id).getBlob();
  return { ok: true, dataUrl: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) };
}

/* ───────────── decorate ───────────── */

function effStatus(s) {
  if (s.status === 'Active' && s.nextDueDate && s.nextDueDate < today()) return 'Overdue';
  return s.status;
}

function locFull(s) { return s.subLocation ? s.location + ' / ' + s.subLocation : s.location; }

function decScaffold(s) {
  var o = {};
  Object.keys(s).forEach(function (k) { if (k !== '_row') o[k] = s[k]; });
  o.rawStatus = s.status;
  o.locationFull = locFull(s);
  o.status = effStatus(s);
  o.daysToDue = s.nextDueDate ? daysBetween(today(), s.nextDueDate) : null;
  return o;
}

function supStatus(s) {
  if (s.workStatus) return s.workStatus;
  if (s.approval === 'Suspended') return 'Suspended';
  if (s.approval === 'Pending') return 'Pending';
  if (!s.expiryDate || s.expiryDate < today()) return 'Expired';
  return 'Approved';
}

function decSup(s, role) {
  var o = {};
  Object.keys(s).forEach(function (k) { if (k !== '_row') o[k] = s[k]; });
  o.status = supStatus(s);
  o.daysLeft = s.expiryDate ? daysBetween(today(), s.expiryDate) : null;
  if (role !== 'admin' && role !== 'ic_admin') { delete o.phone; delete o.email; }
  return o;
}

function isHelper(s) { return /helper/i.test(String(s.role || '')); }
function crewDates(s) {
  var a = [];
  [s.expiryDate, s.basicExpiry, s.wahExpiry].forEach(function (x) { if (x) a.push(x); });
  return a.sort();
}
function crewStatus(s) {
  if (s.workStatus) return s.workStatus;
  if (s.approval === 'Suspended') return 'Suspended';
  if (isHelper(s)) { if (!s.basicExpiry || !s.wahExpiry) return 'Incomplete'; }
  else if (!s.expiryDate) return 'NoCert';
  var d = crewDates(s);
  if (d.length && d[0] < today()) return 'Expired';
  return 'Approved';
}

function decCrew(s, role) {
  var o = {};
  Object.keys(s).forEach(function (k) { if (k !== '_row') o[k] = s[k]; });
  o.status = crewStatus(s);
  var cd = crewDates(s);
  o.daysLeft = cd.length ? daysBetween(today(), cd[0]) : null;
  if (role !== 'admin' && role !== 'ic_admin') delete o.phone;
  return o;
}

/* ───────────── v1.6.0: IC HSSE role, work status, people movements ───────────── */
var WORK_STATUS = ['OnLeave', 'Resigned', 'Demobilised', 'LeftSite', 'Deleted'];
function ownOnly(u) { return u.role === 'supervisor' || u.role === 'ic_admin'; }
function inWork(r) { return !r.workStatus && r.deleted !== '1'; }                 // normal, active person
function inTabs(r) { return r.deleted !== '1' && (!r.workStatus || r.workStatus === 'OnLeave'); }
function personCompany(kind, r) { return String(kind === 'Inspector' ? r.company : r.contractor || '').trim().toUpperCase(); }

function mailAdmins(subject, body) {
  rows('Users').forEach(function (x) { if (x.active !== 'FALSE' && x.role === 'admin') mail(x.email, subject, body); });
}

// IC HSSE users may only ADD people for their own contractor. Everything else stays with the manager.
function icAdd(u, p, kind) {
  if (u.role !== 'ic_admin') return p;
  if (p.id || p.renew) throw new Error('Only the HSSE Manager can edit or renew records.');
  if (!u.contractor) throw new Error('Your login has no contractor. Ask the HSSE Manager.');
  p.fromImport = false; p.approval = (kind === 'Scaffolder') ? 'Approved' : 'Pending';
  if (kind === 'Inspector') p.company = u.contractor; else p.contractor = u.contractor;
  return p;
}

function movementRows(u) {
  var out = [];
  [['Supervisor', 'Supervisors'], ['Scaffolder', 'Scaffolders'], ['Inspector', 'Inspectors']].forEach(function (k) {
    rows(k[1]).forEach(function (r) {
      var ws = r.workStatus || (r.deleted === '1' ? 'Deleted' : '');
      if (!ws) return;
      var comp = personCompany(k[0], r);
      if (ownOnly(u) && comp !== String(u.contractor || '').toUpperCase()) return;
      out.push({ kind: k[0], id: r.id, name: r.name, contractor: comp, role: k[0] === 'Scaffolder' ? (r.role || 'Scaffolder') : k[0], workStatus: ws,
        statusDate: r.statusDate || String(r.deletedAt || '').slice(0, 10), reason: r.statusReason || r.deleteReason || '', by: r.statusBy || r.deletedBy || '' });
    });
  });
  out.sort(function (a, b) { return String(b.statusDate).localeCompare(String(a.statusDate)); });
  return out;
}

function setLoginActive(r, kind, on) {
  if (kind === 'Scaffolder' || !r.email) return;
  var lu = getUser(r.email);
  if (lu && lu.role === kind.toLowerCase()) { lu.active = on ? 'TRUE' : 'FALSE'; writeRow('Users', lu._row, lu); }
}

function setWorkStatus(u, p) {
  need(u, ['admin', 'ic_admin']);
  return withLock(function () {
    var n = kindSheet(p.kind);
    if (!n) throw new Error('Unknown record type.');
    var st = String(p.status || '');
    if (st !== 'Active' && WORK_STATUS.indexOf(st) < 0) throw new Error('Unknown status.');
    var r = rows(n).filter(function (x) { return x.id === p.id; })[0];
    if (!r) throw new Error('Record not found.');
    if (u.role === 'ic_admin' && personCompany(p.kind, r) !== String(u.contractor || '').toUpperCase()) throw new Error('Not your contractor.');
    var cur = r.workStatus || (r.deleted === '1' ? 'Deleted' : '');
    var date = String(p.date || today());
    if (!isDate(date)) throw new Error('Date must be YYYY-MM-DD.');
    var reason = String(p.reason || '').trim();
    if (st !== 'Active' && reason.length < 3) throw new Error('Give a reason.');
    if (st === 'Active') {
      if (!cur) throw new Error('This person is already active.');
      if (cur !== 'OnLeave' && u.role !== 'admin') throw new Error('Only the HSSE Manager can bring someone back after ' + cur + '.');
    } else if (cur === st) throw new Error('Already ' + st + '.');
    else if (cur && cur !== 'OnLeave' && st === 'OnLeave') throw new Error('A person who has ' + cur + ' cannot be put on leave.');
    var t = today() + ' ' + nowTime();
    if (st === 'Active') {
      r.workStatus = ''; r.statusDate = date; r.statusReason = reason.slice(0, 300); r.statusBy = u.email;
      r.deleted = ''; r.deletedAt = ''; r.deletedBy = ''; r.deleteReason = '';
      setLoginActive(r, p.kind, true);
    } else {
      r.workStatus = st; r.statusDate = date; r.statusReason = reason.slice(0, 300); r.statusBy = u.email;
      if (st === 'Deleted') { r.deleted = '1'; r.deletedAt = t; r.deletedBy = u.email; r.deleteReason = reason.slice(0, 300); }
      setLoginActive(r, p.kind, false);
    }
    writeRow(n, r._row, r);
    audit(u.email, 'workStatus', p.kind + ' ' + r.id + ' ' + r.name + ' ' + (cur || 'Active') + ' > ' + (st) + ' ' + reason.slice(0, 120));
    if (u.role === 'ic_admin') mailAdmins('Status change: ' + r.name + ' → ' + st, p.kind + ' ' + r.id + ' ' + r.name + ' (' + personCompany(p.kind, r) + ') is now ' + st + ' as of ' + date + '.\nReason: ' + reason + '\nBy: ' + u.email);
    return { ok: true, status: st };
  });
}

// Manager approves a supervisor/inspector that an IC HSSE user added.
function approvePerson(u, p) {
  need(u, ['admin']);
  return withLock(function () {
    var n = kindSheet(p.kind);
    if (!n || p.kind === 'Scaffolder') throw new Error('Only supervisors and inspectors need approval.');
    var r = live(n).filter(function (x) { return x.id === p.id; })[0];
    if (!r) throw new Error('Record not found.');
    if (r.approval !== 'Pending') throw new Error('Not waiting for approval.');
    r.approval = 'Approved'; r.updatedAt = today() + ' ' + nowTime();
    writeRow(n, r._row, r);
    audit(u.email, 'approvePerson', p.kind + ' ' + r.id + ' ' + r.name);
    if (r.email) mail(r.email, 'Approved: ' + r.name, 'Your ' + p.kind.toLowerCase() + ' record was approved by the HSSE Manager. You can now log in with your email code.');
    return { ok: true };
  });
}

/* ───────────── actions ───────────── */

function cfgFor(u) {
  var g = cfg();
  if (ownOnly(u)) g.contractors = g.contractors.filter(function (x) { return x === String(u.contractor || '').toUpperCase(); });
  return g;
}

function listAll(u) {
  var sc = rows('Scaffolds').map(decScaffold);
  var pend = {};
  rows('DeleteRequests').forEach(function (d) { if (d.status === 'Pending') pend[d.kind + ':' + d.personId] = d.reqId; });
  var sp = live('Supervisors').filter(inTabs).map(function (s) { var o = decSup(s, u.role); o.pendingDelete = pend['Supervisor:' + s.id] ? '1' : ''; return o; });
  var cr = live('Scaffolders').filter(inTabs).map(function (s) { var o = decCrew(s, u.role); o.pendingDelete = pend['Scaffolder:' + s.id] ? '1' : ''; return o; });
  var ip = live('Inspectors').filter(inTabs).map(function (s) { var o = decSup(s, u.role); o.pinSet = s.pinHash ? '1' : ''; delete o.pinHash; delete o.pinFails; delete o.pinLockUntil; delete o.pinSetAt; o.pendingDelete = pend['Inspector:' + s.id] ? '1' : ''; return o; });
  if (ownOnly(u)) {
    sc = sc.filter(function (s) { return s.contractor === u.contractor; });
    sp = sp.filter(function (s) { return s.contractor === u.contractor; });
    cr = cr.filter(function (s) { return s.contractor === u.contractor; });
    // a contractor only ever sees its own company: inspectors from other companies are hidden
    ip = ip.filter(function (s) { return String(s.company || '').trim().toUpperCase() === String(u.contractor || '').trim().toUpperCase(); });
  }
  var byRef = {};
  sc.forEach(function (s) { byRef[s.refId] = s; });
  var failBy = {}, cutoff = addDays(today(), -90), hoPass = {};
  rows('Inspections').forEach(function (i) {
    if (i.kind === 'Handover' && i.result === 'Pass') hoPass[i.refId] = 1;
    var s = byRef[i.refId];
    if (s && i.result === 'Fail' && i.date >= cutoff) failBy[s.contractor] = (failBy[s.contractor] || 0) + 1;
  });
  sc.forEach(function (s) { s.handoverDone = hoPass[s.refId] ? '1' : ''; });
  if (ownOnly(u)) {
    var mine = {}; mine[u.contractor] = failBy[u.contractor] || 0; failBy = mine;
  }
  var pt = pendingTagFor(u);
  var rq = rows('ScaffoldRequests').filter(function (x) { return x.status === 'Open' && (!ownOnly(u) || x.contractor === u.contractor); }).map(function (x) { delete x._row; return x; });
  var mr = inspectorRecordFor(u);
  var out = { ok: true, myPin: { record: !!mr, has: !!(mr && mr.pinHash) }, requests: rq, pendingTag: pt ? decScaffold(pt) : null, today: today(), version: VERSION, user: pub(u), cfg: cfgFor(u), scaffolds: sc, supervisors: sp, inspectors: ip, scaffolders: cr, failByContractor: failBy, movements: movementRows(u), users: [], wa: [] };
  if (u.role === 'admin') {
    out.users = rows('Users').map(function (x) { return { email: x.email, name: x.name, role: x.role, contractor: x.contractor, active: x.active }; });
    out.wa = rows('WaQueue').filter(function (w) { return w.status === 'Pending'; }).map(function (w) { delete w._row; return w; });
    out.deleteRequests = rows('DeleteRequests').map(function (d) { delete d._row; return d; }).slice(-40).reverse();
  }
  return out;
}

function live(n) { return rows(n).filter(function (r) { return r.deleted !== '1'; }); }

function validSupervisorFor(contractor, supId) {
  var s = live('Supervisors').filter(function (x) { return x.id === supId; })[0];
  if (!s) throw new Error('Supervisor not found.');
  if (s.contractor !== contractor) throw new Error('Supervisor belongs to another contractor.');
  var st = supStatus(s);
  if (st !== 'Approved') throw new Error('Supervisor ' + s.name + ' is ' + st + ' and cannot be used.');
  return s;
}

function tb(v) { return String(v == null ? '' : v).trim().slice(0, 40); }

function approvedInspectorById(id) {
  var s = live('Inspectors').filter(function (x) { return x.id === id; })[0];
  if (!s) throw new Error('Inspector not found.');
  var st = supStatus(s);
  if (st !== 'Approved') throw new Error('Inspector ' + s.name + ' is ' + st + ' and cannot be used.');
  return s;
}

// "Built by" can name several foremen (SUP-...) and, in a small team, an inspector (INSP-...).
function builderList(contractor, raw) {
  var ids = (Array.isArray(raw) ? raw : String(raw || '').split(',')).map(function (x) { return String(x).trim(); }).filter(Boolean);
  var seen = {};
  ids = ids.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
  if (!ids.length) throw new Error('Name at least one person in "Built by" (the foreman).');
  if (ids.length > 6) throw new Error('At most 6 names in "Built by".');
  var names = ids.map(function (id) {
    if (id.indexOf('INSP-') === 0) return approvedInspectorById(id).name + ' (Inspector)';
    return validSupervisorFor(contractor, id).name;
  });
  return { ids: ids.join(','), names: names.join(' / ') };
}

function builderRecords(s) {
  var out = [];
  String(s.builtById || '').split(',').forEach(function (id) {
    id = id.trim(); if (!id) return;
    var n = id.indexOf('INSP-') === 0 ? 'Inspectors' : 'Supervisors';
    var r = rows(n).filter(function (x) { return x.id === id; })[0];
    if (r) out.push(r);
  });
  return out;
}

function needInspectorApproval(u) {
  if (u.role !== 'inspector') return;
  var r = live('Inspectors').filter(function (x) { return String(x.email || '').toLowerCase() === String(u.email).toLowerCase(); })[0];
  if (!r) throw new Error('You are not registered as a scaffold inspector yet. Ask the admin to add your certificate under Inspectors.');
  var st = supStatus(r);
  if (st !== 'Approved') throw new Error('Your inspector certificate is ' + st + '. You cannot inspect or tag scaffolds until the admin approves it.');
}

// v1.6.1: extra certificate pages sent together with the form (up to 12 per record)
function applyExtras(o, photos) {
  if (!Array.isArray(photos) || !photos.length) return;
  var list = extraIds(o);
  if (list.length + photos.length > 12) throw new Error('At most 12 extra photos per record.');
  photos.forEach(function (d) { list.push(saveDoc('_certificates', d, o.id + '_extra_' + today() + '_' + (list.length + 1) + '.jpg')); });
  o.extraPhotoIds = JSON.stringify(list);
}

function applyTagBack(s, p) {
  ['noRungs', 'noStandards', 'noLifts', 'boardingArea', 'structure'].forEach(function (k) { if (p[k] !== undefined) s[k] = tb(p[k]); });
}

function saveTagBack(u, p) {
  need(u, ['admin', 'inspector', 'supervisor']);
  needInspectorApproval(u);
  return withLock(function () {
    var s = rows('Scaffolds').filter(function (x) { return x.refId === p.refId; })[0];
    if (!s) throw new Error('Scaffold not found.');
    if (u.role === 'supervisor' && s.contractor !== u.contractor) throw new Error('Not your contractor.');
    applyTagBack(s, p);
    writeRow('Scaffolds', s._row, s);
    audit(u.email, 'saveTagBack', s.refId);
    return { ok: true };
  });
}

function createScaffoldCore(u, p, quiet, dry) {
  {
    var c = cfg();
    var contractor = String(p.contractor || '').toUpperCase();
    if (u.role === 'supervisor') contractor = u.contractor;
    if (c.contractors.indexOf(contractor) < 0) throw new Error('Unknown contractor.');
    var type = String(p.type || '').toUpperCase();
    if (!c.types.some(function (t) { return t.k === type; })) throw new Error('Unknown scaffold type.');
    var location = String(p.location || '').trim();
    var requestedBy = String(p.requestedBy || '').trim();
    var notes = String(p.notes || '').trim();
    if (!location || !requestedBy || !notes) throw new Error('All fields are required: main location, requested by and notes.');
    var known = c.mainLocations.filter(function (x) { return x.toUpperCase() === location.toUpperCase(); })[0];
    if (!known) throw new Error('Main location must be chosen from the list.');
    location = known;
    var lc = LOAD_CLASSES.filter(function (x) { return x.k === p.loadClass; })[0];
    if (!lc) throw new Error('Choose a load class.');
    var kg = lc.kg;
    if (lc.k === 'Special Purpose') { kg = String(Number(p.loadKg) || ''); if (!kg) throw new Error('Enter the special-purpose load in kg/m².'); }
    var bl = builderList(contractor, p.builtByIds !== undefined ? p.builtByIds : p.builtById);
    var subLoc0 = u.role === 'supervisor' ? '' : String(p.subLocation || '').trim().slice(0, 80);
    var t = today();
    var date = p.erectedDate || t;
    if (!isDate(date) || date > t || daysBetween(date, t) > 7) throw new Error('Erected date must be within the last 7 days.');
    if (dry) return { ok: true, dry: { contractor: contractor, type: type, location: location, requestedBy: requestedBy, notes: notes, loadClass: lc.k, loadKg: kg, builtById: bl.ids, builtByName: bl.names, erectedDate: date } };
    var yymm = date.slice(2, 4) + date.slice(5, 7);
    var n = nextCounter(contractor + '-' + yymm);
    var refId = contractor + '-' + type + '-' + yymm + '-' + pad(n, 3);
    appendRow('Scaffolds', {
      refId: refId, contractor: contractor, type: type, location: location, requestedBy: requestedBy,
      builtById: bl.ids, builtByName: bl.names, erectedDate: date, loadClass: lc.k, loadKg: kg,
      status: 'Pending', lastInspectionDate: '', nextDueDate: '', inspector: '', tagFrontId: '', tagBackId: '',
      decommDate: '', notes: notes.slice(0, 300), createdBy: u.email, createdAt: t + ' ' + nowTime(), subLocation: subLoc0,
      noRungs: tb(p.noRungs), noStandards: tb(p.noStandards), noLifts: tb(p.noLifts), boardingArea: tb(p.boardingArea), structure: tb(p.structure)
    });
    audit(u.email, 'createScaffold', refId);
    var to = quiet ? [] : rows('Users').filter(function (x) { return x.active !== 'FALSE' && (x.role === 'inspector' || x.role === 'admin') && x.email !== u.email; }).map(function (x) { return x.email; });
    to.forEach(function (e) {
      mail(e, 'Scaffold awaiting inspection: ' + refId,
        refId + ' (' + contractor + ', ' + location + ') was registered by ' + u.name + ' and is awaiting handover inspection. The inspector enters the sub location at handover.\nIt must not be used until inspected and the signed tag photo is uploaded.');
    });
    return { ok: true, refId: refId };
  }
}

// Kept for internal use and tests. Not exposed as an action: the ID is only generated by registerAndInspect.
function createScaffold(u, p) {
  need(u, ['admin', 'supervisor', 'inspector']);
  needInspectorApproval(u);
  return withLock(function () { return createScaffoldCore(u, p, false); });
}

/* ───────────── inspector PIN (set and reset only by email code) ───────────── */
function inspectorRecordFor(u) {
  return live('Inspectors').filter(function (x) { return String(x.email || '').toLowerCase() === String(u.email).toLowerCase(); })[0] || null;
}
function pinHashOf(email, pin) { return sign('pin:' + String(email).toLowerCase() + ':' + pin); }

// Every inspector-signed action needs the inspector's own PIN, so nobody can inspect on their behalf.
function needPin(u, p) {
  var r = inspectorRecordFor(u);
  if (!r) return;
  if (!r.pinHash) throw new Error('PIN_NOT_SET: set your inspector PIN first (press Set PIN, a code is sent to your email).');
  var now = new Date().getTime();
  if (Number(r.pinLockUntil || 0) > now) throw new Error('PIN locked after too many wrong tries. Try again in ' + Math.ceil((Number(r.pinLockUntil) - now) / 60000) + ' min, or reset your PIN by email.');
  var pin = String(p.pin || '').trim();
  if (!/^\d{4,6}$/.test(pin) || pinHashOf(u.email, pin) !== r.pinHash) {
    var f = Number(r.pinFails || 0) + 1;
    r.pinFails = String(f);
    if (f >= 5) { r.pinLockUntil = String(now + 15 * 60000); r.pinFails = '0'; }
    writeRow('Inspectors', r._row, r);
    audit(u.email, 'pinFail', r.id);
    throw new Error('Wrong PIN.' + (f >= 5 ? ' Locked for 15 minutes.' : ' ' + (5 - f) + ' tries left.'));
  }
  if (r.pinFails && r.pinFails !== '0') { r.pinFails = '0'; writeRow('Inspectors', r._row, r); }
}

function pinRequest(u) {
  var r = inspectorRecordFor(u);
  if (!r) throw new Error('You are not registered as a scaffold inspector.');
  var c = CacheService.getScriptCache(), e = String(u.email).toLowerCase();
  if (c.get('pinsent:' + e)) throw new Error('A code was just sent. Wait a minute before asking again.');
  var code = String(Math.floor(100000 + Math.random() * 900000));
  c.put('pinsent:' + e, '1', 60);
  c.put('pincode:' + e, code, 600);
  c.remove('pintries:' + e);
  mail(r.email, 'Scaffold inspector PIN code', 'Your code to set or reset your inspector PIN is ' + code + '\nValid for 10 minutes. Do not share it. If you did not ask for it, ignore this email.');
  audit(u.email, 'pinRequest', r.id);
  return { ok: true };
}

function pinSet(u, p) {
  return withLock(function () {
    var r = inspectorRecordFor(u);
    if (!r) throw new Error('You are not registered as a scaffold inspector.');
    var c = CacheService.getScriptCache(), e = String(u.email).toLowerCase();
    var tries = Number(c.get('pintries:' + e) || 0);
    if (tries >= 5) throw new Error('Too many attempts. Ask for a new code.');
    var good = c.get('pincode:' + e);
    if (!good || String(p.code || '').trim() !== good) { c.put('pintries:' + e, String(tries + 1), 600); throw new Error('Wrong or expired code.'); }
    var pin = String(p.pin || '').trim();
    if (!/^\d{4,6}$/.test(pin)) throw new Error('The PIN must be 4 to 6 digits.');
    if (/^(\d)\1+$/.test(pin) || '0123456789'.indexOf(pin) >= 0 || '9876543210'.indexOf(pin) >= 0) throw new Error('Choose a PIN that is not all the same digit or a simple sequence.');
    c.remove('pincode:' + e);
    r.pinHash = pinHashOf(u.email, pin); r.pinSetAt = today() + ' ' + nowTime(); r.pinFails = '0'; r.pinLockUntil = '';
    writeRow('Inspectors', r._row, r);
    audit(u.email, 'pinSet', r.id);
    mail(r.email, 'Your inspector PIN was set', 'Your scaffold inspector PIN was set or changed on ' + today() + ' ' + nowTime() + '. If this was not you, tell the admin straight away.');
    return { ok: true };
  });
}

// Admin can switch a PIN off (for example if it may be known by someone else). The inspector sets a new one by email.
function clearPin(u, p) {
  need(u, ['admin']);
  return withLock(function () {
    var r = live('Inspectors').filter(function (x) { return x.id === p.id; })[0];
    if (!r) throw new Error('Inspector not found.');
    r.pinHash = ''; r.pinSetAt = ''; r.pinFails = '0'; r.pinLockUntil = '';
    writeRow('Inspectors', r._row, r);
    audit(u.email, 'clearPin', r.id);
    return { ok: true };
  });
}

function preCheckInspection(p) {
  var ids = cfg().checklists.Handover;
  var ans = p.answers || {}, com = p.comments || {};
  ids.forEach(function (id) {
    var a = ans[id];
    if (['P', 'F', 'N'].indexOf(a) < 0) throw new Error('Checklist item ' + id + ' is not answered.');
    if (a === 'F' && !String(com[id] || '').trim()) throw new Error('Item ' + id + ' failed: add a comment.');
  });
  var subLoc = String(p.subLocation || '').trim();
  if (!subLoc) throw new Error('Sub location is required (entered by the inspector).');
  if (subLoc.length > 80) throw new Error('Sub location is too long (max 80).');
  if (!String(p.overall || '').trim()) throw new Error('Overall comments are required (write None if nothing to add).');
  if (p.declared !== true) throw new Error('Tick the inspector declaration before submitting.');
}

// The ID is generated only after the inspection is finished. Then the inspector MUST upload the tag photo.
function registerAndInspect(u, p) {
  need(u, ['admin', 'inspector']);
  needInspectorApproval(u);
  return withLock(function () {
    needPin(u, p);
    preCheckInspection(p);
    var req = null;
    if (p.requestId) {
      req = rows('ScaffoldRequests').filter(function (x) { return x.reqId === p.requestId && x.status === 'Open'; })[0];
      if (!req) throw new Error('That foreman request is no longer open.');
    }
    var cr = createScaffoldCore(u, p, true);
    var s = rows('Scaffolds').filter(function (x) { return x.refId === cr.refId; })[0];
    var res = runInspection(u, p, s, true);
    if (req) { req.status = 'Done'; req.refId = cr.refId; writeRow('ScaffoldRequests', req._row, req); }
    audit(u.email, 'registerAndInspect', cr.refId + ' ' + res.result);
    return res;
  });
}

function requestScaffold(u, p) {
  need(u, ['admin', 'supervisor']);
  return withLock(function () {
    var d = createScaffoldCore(u, p, true, true).dry;
    var reqId = 'REQ-' + pad(nextCounter('REQ'), 4);
    appendRow('ScaffoldRequests', { reqId: reqId, contractor: d.contractor, type: d.type, location: d.location, requestedBy: d.requestedBy, builtById: d.builtById, builtByName: d.builtByName, erectedDate: d.erectedDate, loadClass: d.loadClass, loadKg: d.loadKg, notes: d.notes, createdBy: u.email, createdAt: today() + ' ' + nowTime(), status: 'Open', refId: '' });
    audit(u.email, 'requestScaffold', reqId + ' ' + d.contractor + ' ' + d.location);
    rows('Users').forEach(function (x) { if (x.active !== 'FALSE' && (x.role === 'inspector' || x.role === 'admin') && x.email !== u.email) mail(x.email, 'Scaffold ready for inspection: ' + d.contractor + ', ' + d.location, u.name + ' (' + d.contractor + ') reports a scaffold built at ' + d.location + ' by ' + d.builtByName + '. Open the app > New scaffold > Foreman requests, fill in the tag, inspect it and generate the ID.'); });
    return { ok: true, reqId: reqId };
  });
}

function pendingTagFor(u) {
  return rows('Scaffolds').filter(function (x) { return x.tagPending === '1' && String(x.tagPendingBy).toLowerCase() === String(u.email).toLowerCase(); })[0] || null;
}

function uploadTagPhoto(u, p) {
  need(u, ['admin', 'inspector']);
  needInspectorApproval(u);
  return withLock(function () {
    var s = rows('Scaffolds').filter(function (x) { return x.refId === p.refId; })[0];
    if (!s) throw new Error('Scaffold not found.');
    var hos = rows('Inspections').filter(function (i) { return i.refId === s.refId && i.kind === 'Handover'; });
    var ho = hos[hos.length - 1];
    var mine = s.tagPending === '1' && (u.role === 'admin' || String(s.tagPendingBy).toLowerCase() === String(u.email).toLowerCase());
    var late = s.tagPending !== '1' && !s.tagFrontId && ho && ho.result === 'Pass';
    if (!mine && !late) throw new Error('This scaffold is not waiting for a tag photo.');
    if (!p.photo) throw new Error('Take the photo of the signed tag.');
    var id = saveImage(s.refId, p.photo, s.refId + '_' + today() + '_Handover_front.jpg');
    s.tagFrontId = id;
    if (ho && !ho.photoFrontId) { ho.photoFrontId = id; writeRow('Inspections', ho._row, ho); }
    s.tagPending = ''; s.tagPendingBy = '';
    if (s.status === 'Pending' && ho && ho.result === 'Pass') { s.status = 'Active'; s.nextDueDate = addDays(today(), cfg().intervalDays); s.lastInspectionDate = today(); }
    writeRow('Scaffolds', s._row, s);
    audit(u.email, 'uploadTagPhoto', s.refId);
    return { ok: true, status: effStatus(s) };
  });
}

function releaseTagLock(u, p) {
  need(u, ['admin']);
  return withLock(function () {
    var s = rows('Scaffolds').filter(function (x) { return x.refId === p.refId; })[0];
    if (!s) throw new Error('Scaffold not found.');
    if (s.tagPending !== '1') throw new Error('Nothing to release.');
    var reason = String(p.reason || '').trim();
    if (reason.length < 5) throw new Error('Give the reason for releasing the lock (at least 5 characters).');
    var who = s.tagPendingBy;
    s.tagPending = ''; s.tagPendingBy = '';
    writeRow('Scaffolds', s._row, s);
    audit(u.email, 'releaseTagLock', s.refId + ' (' + who + ') reason: ' + reason.slice(0, 150));
    return { ok: true };
  });
}

function submitInspection(u, p) {
  need(u, ['admin', 'inspector', 'supervisor']);
  needInspectorApproval(u);
  return withLock(function () {
    needPin(u, p);
    var s = rows('Scaffolds').filter(function (x) { return x.refId === p.refId; })[0];
    if (!s) throw new Error('Scaffold not found.');
    return runInspection(u, p, s, false);
  });
}

function runInspection(u, p, s, reg) {
  {
    var c = cfg();
    if (u.role === 'supervisor' && s.contractor !== u.contractor) throw new Error('Not your contractor.');
    if (s.status === 'Dismantled') throw new Error('Scaffold is dismantled.');
    var kind = reg ? 'Handover' : String(p.kind || '');
    if (['Handover', 'Weekly', 'Special'].indexOf(kind) < 0) throw new Error('Invalid inspection type.');
    var hoDone = rows('Inspections').some(function (i) { return i.refId === s.refId && i.kind === 'Handover' && i.result === 'Pass'; });
    if (!hoDone && kind !== 'Handover') throw new Error('This scaffold has not passed its Handover inspection yet. Do the full Handover inspection first.');
    if (hoDone && kind === 'Handover') throw new Error('Handover already passed. Use Weekly or Special.');
    if (kind !== 'Weekly') need(u, ['admin', 'inspector']);
    if (s.status === 'DoNotUse' && u.role === 'supervisor') throw new Error('This scaffold is red-tagged. Only an inspector can re-inspect it and remove the red tag.');
    var ids = c.checklists[kind];
    var ans = p.answers || {}, com = p.comments || {};
    var fails = 0, items = {};
    ids.forEach(function (id) {
      var a = ans[id];
      if (['P', 'F', 'N'].indexOf(a) < 0) throw new Error('Checklist item ' + id + ' is not answered.');
      var cm = String(com[id] || '').trim();
      if (a === 'F') { if (!cm) throw new Error('Item ' + id + ' failed: add a comment.'); fails++; }
      items[id] = a === 'F' ? { a: a, c: cm.slice(0, 200) } : { a: a };
    });
    var subLoc = String(p.subLocation || '').trim();
    if (kind === 'Handover') { if (!subLoc) throw new Error('Sub location is required (entered by the inspector).'); if (subLoc.length > 80) throw new Error('Sub location is too long (max 80).'); }
    if (!String(p.overall || '').trim()) throw new Error('Overall comments are required (write None if nothing to add).');
    if (p.declared !== true) throw new Error('Tick the inspector declaration before submitting.');
    if (kind === 'Handover' && !p.photoFront && !reg) throw new Error('Handover needs a photo of the front of the signed tag.');
    if (kind !== 'Handover' && !p.photoBack) throw new Error('Upload a photo of the back of the tag (inspection grid).');
    var t = today(), tm = nowTime();
    var folder = s.refId;
    var fId = p.photoFront ? saveImage(folder, p.photoFront, s.refId + '_' + t + '_' + kind + '_front.jpg') : '';
    var bId = p.photoBack ? saveImage(folder, p.photoBack, s.refId + '_' + t + '_' + kind + '_back.jpg') : '';
    var result = fails ? 'Fail' : 'Pass';
    var inspId = 'INS-' + pad(nextCounter('INS'), 5);
    appendRow('Inspections', {
      inspId: inspId, refId: s.refId, date: t, time: tm, kind: kind, inspector: u.name, inspectorEmail: u.email,
      result: result, failCount: fails, checklist: JSON.stringify(items), comments: String(p.overall || '').slice(0, 400),
      photoFrontId: fId, photoBackId: bId, createdAt: t + ' ' + tm,
      declaration: (fails ? 'NOT FIT: inspector confirmed the findings; scaffold is NOT fit to use' : 'FIT: inspector confirmed the scaffold was inspected and is fit to use') + (inspectorRecordFor(u) ? ' | signed with inspector PIN' : '')
    });
    var wasRed = s.status === 'DoNotUse';
    s.lastInspectionDate = t;
    if (fails) {
      if (!wasRed) { s.redTagPrev = s.status; s.redTagAt = t + ' ' + tm; s.redTagBy = u.name; s.redTagReason = 'Failed ' + kind + ' inspection ' + inspId + ' (' + fails + ' item(s))'; logRedTag(s.refId, 'Applied', u, s.redTagReason, ''); }
      s.status = 'DoNotUse'; s.nextDueDate = '';
    } else {
      s.status = reg ? 'Pending' : 'Active'; s.nextDueDate = reg ? '' : addDays(t, c.intervalDays);
      if (wasRed) { logRedTag(s.refId, 'Removed', u, 'Passed ' + kind + ' re-inspection ' + inspId, ''); s.redTagAt = ''; s.redTagBy = ''; s.redTagReason = ''; s.redTagPrev = ''; }
    }
    s.inspector = u.name;
    applyTagBack(s, p);
    if (kind === 'Handover') s.subLocation = subLoc;
    if (fId) s.tagFrontId = fId;
    if (bId) s.tagBackId = bId;
    if (reg) { s.tagPending = '1'; s.tagPendingBy = u.email; }
    writeRow('Scaffolds', s._row, s);
    audit(u.email, 'inspection', s.refId + ' ' + kind + ' ' + result);
    if (fails) {
      builderRecords(s).forEach(function (sup) { if (sup.email) mail(sup.email, 'DO NOT USE: scaffold ' + s.refId, 'Scaffold ' + s.refId + ' (' + s.location + ') failed inspection with ' + fails + ' item(s). Do not use it. Rectify and request re-inspection.'); });
    }
    return { ok: true, result: result, fails: fails, nextDueDate: s.nextDueDate, inspId: inspId, refId: s.refId };
  }
}

function logRedTag(refId, action, u, reason, photoId) {
  appendRow('RedTags', { tagId: 'RT-' + pad(nextCounter('RT'), 5), refId: refId, action: action, at: today() + ' ' + nowTime(), byEmail: u.email, byName: u.name, reason: reason, photoId: photoId || '' });
}

function redTag(u, p) {
  need(u, ['admin', 'inspector', 'supervisor']);
  needInspectorApproval(u);
  return withLock(function () {
    needPin(u, p);
    var s = rows('Scaffolds').filter(function (x) { return x.refId === p.refId; })[0];
    if (!s) throw new Error('Scaffold not found.');
    if (u.role === 'supervisor' && s.contractor !== u.contractor) throw new Error('Not your contractor.');
    if (s.status === 'Dismantled') throw new Error('Scaffold is dismantled.');
    if (s.status === 'DoNotUse') throw new Error('This scaffold is already red-tagged since ' + s.redTagAt + '.');
    var reason = String(p.reason || '').trim();
    if (reason.length < 5) throw new Error('Give the reason for the red tag (at least 5 characters).');
    var photoId = p.photo ? saveImage(s.refId, p.photo, s.refId + '_' + today() + '_redtag.jpg') : '';
    var at = today() + ' ' + nowTime();
    s.redTagPrev = s.status === 'Pending' ? 'Pending' : 'Active';
    s.status = 'DoNotUse'; s.redTagAt = at; s.redTagBy = u.name; s.redTagReason = reason.slice(0, 300);
    writeRow('Scaffolds', s._row, s);
    logRedTag(s.refId, 'Applied', u, reason.slice(0, 300), photoId);
    audit(u.email, 'redTag', s.refId + ' ' + reason.slice(0, 100));
    var msg = 'RED TAG - DO NOT USE: scaffold ' + s.refId + ' (' + locFull(s) + ', ' + s.contractor + ')\nRed tagged ' + at + ' by ' + u.name + '.\nReason: ' + reason + '\nDo not use this scaffold until it is re-inspected by an inspector and the red tag is removed.';
    var to = {};
    builderRecords(s).forEach(function (sup) { if (sup.email) to[sup.email] = 1; });
    rows('Users').forEach(function (x) { if (x.active !== 'FALSE' && (x.role === 'admin' || x.role === 'inspector')) to[x.email] = 1; });
    Object.keys(to).forEach(function (e) { mail(e, 'RED TAG: ' + s.refId, msg); });
    return { ok: true, redTagAt: at };
  });
}

function removeRedTag(u, p) {
  need(u, ['admin', 'inspector']);
  needInspectorApproval(u);
  return withLock(function () {
    needPin(u, p);
    var s = rows('Scaffolds').filter(function (x) { return x.refId === p.refId; })[0];
    if (!s) throw new Error('Scaffold not found.');
    if (s.status !== 'DoNotUse') throw new Error('This scaffold is not red-tagged.');
    var reason = String(p.reason || '').trim();
    if (reason.length < 5) throw new Error('Give the reason for removing the red tag (at least 5 characters).');
    var prev = s.redTagPrev === 'Pending' ? 'Pending' : 'Active';
    s.status = prev;
    if (prev === 'Active' && !s.nextDueDate) s.nextDueDate = today();
    logRedTag(s.refId, 'Removed', u, reason.slice(0, 300), '');
    s.redTagAt = ''; s.redTagBy = ''; s.redTagReason = ''; s.redTagPrev = '';
    writeRow('Scaffolds', s._row, s);
    audit(u.email, 'removeRedTag', s.refId + ' ' + reason.slice(0, 100));
    return { ok: true, status: prev };
  });
}

function history(u, p) {
  var s = rows('Scaffolds').filter(function (x) { return x.refId === p.refId; })[0];
  if (!s) throw new Error('Scaffold not found.');
  if (ownOnly(u) && s.contractor !== u.contractor) throw new Error('Not your contractor.');
  var list = rows('Inspections').filter(function (i) { return i.refId === p.refId; }).map(function (i) {
    var items = {}; try { items = JSON.parse(i.checklist || '{}'); } catch (e) {}
    var failed = Object.keys(items).filter(function (k) { return items[k].a === 'F'; }).map(function (k) { return { id: k, c: items[k].c }; });
    return { inspId: i.inspId, date: i.date, time: i.time, kind: i.kind, inspector: i.inspector, result: i.result, failCount: i.failCount, failed: failed, comments: i.comments, photoFrontId: i.photoFrontId, photoBackId: i.photoBackId };
  }).reverse();
  var rt = rows('RedTags').filter(function (x) { return x.refId === p.refId; }).map(function (x) { return { action: x.action, at: x.at, byName: x.byName, reason: x.reason, photoId: x.photoId }; }).reverse();
  return { ok: true, history: list, redTags: rt };
}

function dismantle(u, p) {
  need(u, ['admin', 'supervisor', 'inspector']);
  return withLock(function () {
    var s = rows('Scaffolds').filter(function (x) { return x.refId === p.refId; })[0];
    if (!s) throw new Error('Scaffold not found.');
    if (u.role === 'supervisor' && s.contractor !== u.contractor) throw new Error('Not your contractor.');
    if (s.status === 'Dismantled') throw new Error('Already dismantled.');
    s.status = 'Dismantled'; s.decommDate = today(); s.nextDueDate = '';
    writeRow('Scaffolds', s._row, s);
    audit(u.email, 'dismantle', s.refId);
    return { ok: true };
  });
}

var CREW_RENEW = ['certType', 'certNo', 'issueDate', 'expiryDate', 'basicDate', 'basicExpiry', 'wahType', 'wahDate', 'wahExpiry', 'photo', 'certPhoto'];
var SUP_RENEW = ['certType', 'certNo', 'issueDate', 'expiryDate', 'certPhoto'];

function needVerified(p) {
  if (p.verified !== true || p.confirmed !== true)
    throw new Error('Tick "I have verified the certificate and all data is true and checked" and confirm the submission. Nothing is saved without both.');
}
function mergeRenew(cur, p, fields) {
  if (cur.locked !== '1') return p;                 // legacy unlocked record: ordinary edit
  var q = {};
  Object.keys(cur).forEach(function (k) { if (k !== '_row') q[k] = cur[k]; });
  fields.forEach(function (k) { if (p[k] !== undefined) q[k] = p[k]; });
  q.id = cur.id; q.renew = true; q.verified = p.verified; q.confirmed = p.confirmed;
  return q;
}
function lockedGuard(ex, p, what) {
  if (ex && ex.locked === '1' && !p.renew)
    throw new Error('This ' + what + ' was submitted and verified, so it cannot be changed. Use Renew to submit a new certificate, or ask the admin to unlock it (with a reason).');
}
function recordSubmission(kind, o, u) {
  var snap = {};
  Object.keys(o).forEach(function (k) { if (k !== '_row' && k !== 'pinHash') snap[k] = o[k]; });
  appendRow('Submissions', { subId: 'SUB-' + pad(nextCounter('SUB'), 5), kind: kind, personId: o.id, date: today() + ' ' + nowTime(), by: u.email, snapshot: JSON.stringify(snap) });
}

function saveSupervisorInner(u, p) {
  needVerified(p);
  if (p.id) { var cur0 = rows('Supervisors').filter(function (x) { return x.id === p.id; })[0]; if (cur0 && p.renew) p = mergeRenew(cur0, p, SUP_RENEW); }
  var c = cfg();
  var name = String(p.name || '').trim();
  var contractor = String(p.contractor || '').trim().toUpperCase();
  var certNo = String(p.certNo || '').trim();
  if (!name) throw new Error('Name is required.');
  if (c.contractors.indexOf(contractor) < 0) throw new Error('Unknown contractor "' + contractor + '".');
  if (!certNo) throw new Error('Certificate number is required.');
  if (!isDate(p.expiryDate)) throw new Error('Expiry date must be YYYY-MM-DD.');
  if (p.issueDate && !isDate(p.issueDate)) throw new Error('Issue date must be YYYY-MM-DD.');
  var email = String(p.email || '').trim().toLowerCase();
  if (email && email.indexOf('@') < 0) throw new Error('Invalid email.');
  var approval = p.approval === 'Suspended' ? 'Suspended' : p.approval === 'Pending' ? 'Pending' : 'Approved';
  var all = live('Supervisors');
  var ex = p.id ? all.filter(function (x) { return x.id === p.id; })[0] : null;
  if (p.id && !ex) throw new Error('Supervisor not found.');
  lockedGuard(ex, p, 'supervisor record');
  if (p.renew && !p.certPhoto) throw new Error('Upload the photo of the new certificate.');
  var t = today() + ' ' + nowTime();
  var o = ex || { id: 'SUP-' + pad(nextCounter('SUP'), 3), createdAt: t, certPhotoId: '' };
  o.name = name; o.contractor = contractor; o.phone = String(p.phone || '').trim(); o.email = email;
  o.certType = String(p.certType || '').trim(); o.certNo = certNo; o.issueDate = p.issueDate || '';
  o.expiryDate = p.expiryDate; o.approval = approval; o.notes = String(p.notes || '').slice(0, 300); o.updatedAt = t;
  if (!p.fromImport && !p.certPhoto && !o.certPhotoId) throw new Error('Upload the photo of the certificate.');
  if (p.certPhoto) o.certPhotoId = saveDoc('_certificates', p.certPhoto, o.id + '_' + today() + '.jpg');
  applyExtras(o, p.extraPhotos);
  o.locked = '1'; o.verifiedBy = u.email; o.verifiedAt = t;
  if (ex) writeRow('Supervisors', ex._row, o); else appendRow('Supervisors', o);
  recordSubmission('Supervisor', o, u);
  if (email) {
    var eu = getUser(email);
    if (!eu) appendRow('Users', { email: email, name: name, role: 'supervisor', contractor: contractor, active: 'TRUE' });
    else if (eu.role === 'supervisor' && eu.contractor !== contractor) { eu.contractor = contractor; writeRow('Users', eu._row, eu); }
  }
  audit(u.email, ex ? 'editSupervisor' : 'addSupervisor', o.id + ' ' + name);
  return o.id;
}

function saveSupervisor(u, p) {
  need(u, ['admin', 'ic_admin']);
  p = icAdd(u, p, 'Supervisor');
  return withLock(function () { return { ok: true, id: saveSupervisorInner(u, p) }; });
}

function importSupervisors(u, p) {
  need(u, ['admin']);
  needVerified(p);
  return withLock(function () {
    var added = 0, errors = [];
    (p.rows || []).forEach(function (r, i) {
      try { r.verified = p.verified; r.confirmed = p.confirmed; r.fromImport = true; saveSupervisorInner(u, r); added++; } catch (e) { errors.push('Line ' + (i + 1) + ': ' + e.message); }
    });
    return { ok: true, added: added, errors: errors };
  });
}

function saveCrewInner(u, p) {
  needVerified(p);
  if (p.id) { var cur0 = rows('Scaffolders').filter(function (x) { return x.id === p.id; })[0]; if (cur0 && p.renew) p = mergeRenew(cur0, p, CREW_RENEW); }
  var c = cfg();
  var name = String(p.name || '').trim();
  var contractor = String(p.contractor || '').trim().toUpperCase();
  var certNo = String(p.certNo || '').trim();
  var expiry = String(p.expiryDate || '').trim();
  var issue = String(p.issueDate || '').trim();
  if (!name) throw new Error('Name is required.');
  if (c.contractors.indexOf(contractor) < 0) throw new Error('Unknown contractor "' + contractor + '".');
  if (!certNo !== !expiry) throw new Error('Enter both certificate number and expiry date, or leave both empty.');
  if (expiry && !isDate(expiry)) throw new Error('Expiry date must be YYYY-MM-DD.');
  if (issue && !isDate(issue)) throw new Error('Issue date must be YYYY-MM-DD.');
  var all = live('Scaffolders');
  var ex = p.id ? all.filter(function (x) { return x.id === p.id; })[0] : null;
  if (p.id && !ex) throw new Error('Scaffolder not found.');
  lockedGuard(ex, p, 'scaffolder record');
  var role = String(p.role || 'Scaffolder').trim().slice(0, 40), helper = isHelper({ role: role });
  var bD = String(p.basicDate || '').trim(), bE = String(p.basicExpiry || '').trim();
  var wT = String(p.wahType || '').trim(), wD = String(p.wahDate || '').trim(), wE = String(p.wahExpiry || '').trim();
  [bD, bE, wD, wE].forEach(function (x) { if (x && !isDate(x)) throw new Error('Training dates must be YYYY-MM-DD.'); });
  if (!bD !== !bE) throw new Error('Scaffolding Basic Awareness: enter both date and expiry, or leave both empty.');
  if (wT && ['Internal', 'External'].indexOf(wT) < 0) throw new Error('Working at Height training type must be Internal or External.');
  if (!wT !== !wD || !wD !== !wE) throw new Error('Working at Height training: enter type, date and expiry together, or leave all empty.');
  if (bD && bE < bD) throw new Error('Basic Awareness expiry is before its date.');
  if (wD && wE < wD) throw new Error('Working at Height expiry is before its date.');
  if (helper && (!bD || !wT)) throw new Error('A Scaffolder Helper needs Scaffolding Basic Awareness and Working at Height training (internal or external).');
  if (certNo && !p.fromImport && !p.certPhoto && !(ex && ex.certPhotoId)) throw new Error('Upload the photo of the certificate.');
  if (p.renew && certNo && !p.certPhoto) throw new Error('Upload the photo of the new certificate.');
  if (certNo && all.some(function (x) { return (!ex || x.id !== ex.id) && x.contractor === contractor && x.certNo.toLowerCase() === certNo.toLowerCase(); }))
    throw new Error('Certificate ' + certNo + ' is already registered for ' + contractor + '.');
  var t = today() + ' ' + nowTime();
  var o = ex || { id: 'SCR-' + pad(nextCounter('SCR'), 3), createdAt: t, photoId: '', certPhotoId: '' };
  o.name = name; o.contractor = contractor; o.role = role;
  o.basicDate = bD; o.basicExpiry = bE; o.wahType = wT; o.wahDate = wD; o.wahExpiry = wE;
  o.phone = String(p.phone || '').trim(); o.certType = String(p.certType || '').trim(); o.certNo = certNo;
  o.issueDate = issue; o.expiryDate = expiry; o.approval = p.approval === 'Suspended' ? 'Suspended' : 'Approved';
  o.notes = String(p.notes || '').slice(0, 300); o.updatedAt = t;
  if (p.photo) o.photoId = saveImage('_scaffolders', p.photo, o.id + '_photo_' + today() + '.jpg');
  if (p.certPhoto) o.certPhotoId = saveDoc('_certificates', p.certPhoto, o.id + '_cert_' + today() + '.jpg');
  applyExtras(o, p.extraPhotos);
  o.locked = '1'; o.verifiedBy = u.email; o.verifiedAt = t;
  if (ex) writeRow('Scaffolders', ex._row, o); else appendRow('Scaffolders', o);
  recordSubmission('Scaffolder', o, u);
  audit(u.email, ex ? 'editScaffolder' : 'addScaffolder', o.id + ' ' + name);
  return o.id;
}

function saveScaffolder(u, p) {
  need(u, ['admin', 'ic_admin']);
  p = icAdd(u, p, 'Scaffolder');
  return withLock(function () { return { ok: true, id: saveCrewInner(u, p) }; });
}

function importScaffolders(u, p) {
  need(u, ['admin']);
  needVerified(p);
  return withLock(function () {
    var added = 0, errors = [];
    (p.rows || []).forEach(function (r, i) {
      try { r.verified = p.verified; r.confirmed = p.confirmed; r.fromImport = true; saveCrewInner(u, r); added++; } catch (e) { errors.push('Line ' + (i + 1) + ': ' + e.message); }
    });
    return { ok: true, added: added, errors: errors };
  });
}

function kindSheet(k) { return k === 'Supervisor' ? 'Supervisors' : k === 'Scaffolder' ? 'Scaffolders' : k === 'Inspector' ? 'Inspectors' : ''; }

function unlockRecord(u, p) {
  need(u, ['admin']);
  return withLock(function () {
    var reason = String(p.reason || '').trim();
    if (reason.length < 5) throw new Error('Give a reason for unlocking (at least 5 characters).');
    var n = kindSheet(p.kind);
    if (!n) throw new Error('Unknown record type.');
    var r = rows(n).filter(function (x) { return x.id === p.id; })[0];
    if (!r) throw new Error('Record not found.');
    r.locked = '';
    writeRow(n, r._row, r);
    audit(u.email, 'unlock' + p.kind, p.id + ' reason: ' + reason.slice(0, 200));
    return { ok: true };
  });
}

function linkedScaffolds(supId) {
  return rows('Scaffolds').filter(function (x) { return String(x.builtById).split(',').indexOf(supId) >= 0 && x.status !== 'Dismantled'; }).length;
}

function requestDelete(u, p) {
  // v1.3.1: admin deletes directly (soft delete, logged). The UI asks for confirmation first.
  need(u, ['admin']);
  return withLock(function () {
    var n = kindSheet(p.kind);
    if (!n) throw new Error('Unknown record type.');
    var r = live(n).filter(function (x) { return x.id === p.id; })[0];
    if (!r) throw new Error('Record not found.');
    var reason = String(p.reason || '').trim() || 'Deleted by admin';
    var t = today() + ' ' + nowTime();
    if ((p.kind === 'Supervisor' || p.kind === 'Inspector') && r.email) { var lu = getUser(r.email); if (lu && lu.role === p.kind.toLowerCase()) { lu.active = 'FALSE'; writeRow('Users', lu._row, lu); } }
    r.deleted = '1'; r.deletedAt = t; r.deletedBy = u.email; r.deleteReason = reason.slice(0, 300);
    r.workStatus = 'Deleted'; r.statusDate = today(); r.statusReason = reason.slice(0, 300); r.statusBy = u.email;
    writeRow(n, r._row, r);
    var reqId = 'DEL-' + pad(nextCounter('DEL'), 4);
    appendRow('DeleteRequests', { reqId: reqId, kind: p.kind, personId: p.id, personName: r.name, reason: reason.slice(0, 300), requestedBy: u.email, requestedAt: t, status: 'Approved', decidedBy: u.email, decidedAt: t, decisionNote: 'Direct delete by admin' });
    audit(u.email, 'deleteRecord', p.kind + ' ' + p.id + ' ' + r.name);
    return { ok: true, reqId: reqId, status: 'Deleted' };
  });
}

function decideDelete(u, p) {
  need(u, ['admin']);
  return withLock(function () {
    var d = rows('DeleteRequests').filter(function (x) { return x.reqId === p.reqId; })[0];
    if (!d) throw new Error('Request not found.');
    if (d.status !== 'Pending') throw new Error('This request was already ' + d.status.toLowerCase() + '.');
    var note = String(p.note || '').trim();
    var t = today() + ' ' + nowTime();
    if (p.approve !== true) {
      if (note.length < 5) throw new Error('Give the reason for rejecting (at least 5 characters).');
      d.status = 'Rejected'; d.decidedBy = u.email; d.decidedAt = t; d.decisionNote = note.slice(0, 300);
      writeRow('DeleteRequests', d._row, d);
      audit(u.email, 'rejectDelete', d.reqId);
      return { ok: true, status: 'Rejected' };
    }
    var admins = rows('Users').filter(function (x) { return x.active !== 'FALSE' && x.role === 'admin'; });
    var n = kindSheet(d.kind);
    var r = live(n).filter(function (x) { return x.id === d.personId; })[0];
    if (!r) throw new Error('Record not found or already deleted.');
    if (d.kind === 'Supervisor') {
      if (r.email) { var lu = getUser(r.email); if (lu && lu.role === 'supervisor') { lu.active = 'FALSE'; writeRow('Users', lu._row, lu); } }
    }
    r.deleted = '1'; r.deletedAt = t; r.deletedBy = u.email; r.deleteReason = d.reason;
    writeRow(n, r._row, r);
    d.status = 'Approved'; d.decidedBy = u.email; d.decidedAt = t; d.decisionNote = note.slice(0, 300);
    writeRow('DeleteRequests', d._row, d);
    audit(u.email, 'approveDelete', d.kind + ' ' + d.personId + ' ' + r.name + ' reason: ' + d.reason.slice(0, 150));
    return { ok: true, status: 'Approved' };
  });
}

var INSP_RENEW = ['certType', 'certNo', 'issueDate', 'expiryDate', 'certPhoto'];

function saveInspectorInner(u, p) {
  needVerified(p);
  if (p.id) { var cur0 = rows('Inspectors').filter(function (x) { return x.id === p.id; })[0]; if (cur0 && p.renew) p = mergeRenew(cur0, p, INSP_RENEW); }
  var name = String(p.name || '').trim();
  var certNo = String(p.certNo || '').trim();
  var email = String(p.email || '').trim().toLowerCase();
  if (!name) throw new Error('Name is required.');
  if (!email || email.indexOf('@') < 0) throw new Error('A valid email is required: it is the inspector login.');
  if (!certNo) throw new Error('Certificate number is required.');
  if (!isDate(p.expiryDate)) throw new Error('Expiry date must be YYYY-MM-DD.');
  if (p.issueDate && !isDate(p.issueDate)) throw new Error('Issue date must be YYYY-MM-DD.');
  var approval = p.approval === 'Suspended' ? 'Suspended' : p.approval === 'Pending' ? 'Pending' : 'Approved';
  var all = live('Inspectors');
  var ex = p.id ? all.filter(function (x) { return x.id === p.id; })[0] : null;
  if (p.id && !ex) throw new Error('Inspector not found.');
  if (all.some(function (x) { return x.email === email && (!ex || x.id !== ex.id); })) throw new Error('Another inspector already uses this email.');
  lockedGuard(ex, p, 'inspector record');
  if (p.renew && !p.certPhoto) throw new Error('Upload the photo of the new certificate.');
  var t = today() + ' ' + nowTime();
  var o = ex || { id: 'INSP-' + pad(nextCounter('INSP'), 3), createdAt: t, certPhotoId: '', extraPhotoIds: '', pinHash: '', pinFails: '0', pinLockUntil: '' };
  if (ex && ex.email !== email) { o.pinHash = ''; o.pinSetAt = ''; }
  o.name = name; o.company = String(p.company || '').trim().slice(0, 60); o.phone = String(p.phone || '').trim(); o.email = email;
  o.certType = String(p.certType || '').trim(); o.certNo = certNo; o.issueDate = p.issueDate || '';
  o.expiryDate = p.expiryDate; o.approval = approval; o.notes = String(p.notes || '').slice(0, 300); o.updatedAt = t;
  if (!p.certPhoto && !o.certPhotoId) throw new Error('Upload the photo of the certificate.');
  if (p.certPhoto) o.certPhotoId = saveDoc('_certificates', p.certPhoto, o.id + '_' + today() + '.jpg');
  applyExtras(o, p.extraPhotos);
  o.locked = '1'; o.verifiedBy = u.email; o.verifiedAt = t;
  if (ex) writeRow('Inspectors', ex._row, o); else appendRow('Inspectors', o);
  recordSubmission('Inspector', o, u);
  var eu = getUser(email);
  if (!eu) appendRow('Users', { email: email, name: name, role: 'inspector', contractor: '', active: 'TRUE' });
  else if (eu.role === 'viewer') { eu.role = 'inspector'; writeRow('Users', eu._row, eu); }
  if (!ex) mail(email, 'Scaffold inspector account', 'You are registered as a scaffold inspector.\nOpen the app, log in with the code sent to this email, then press "Set PIN". Your PIN is yours alone: it is needed to sign every inspection, so nobody can inspect on your behalf. Never share it.');
  audit(u.email, ex ? 'editInspector' : 'addInspector', o.id + ' ' + name);
  return o.id;
}

function saveInspector(u, p) {
  need(u, ['admin', 'ic_admin']);
  p = icAdd(u, p, 'Inspector');
  return withLock(function () { return { ok: true, id: saveInspectorInner(u, p) }; });
}

// Extra certificate photos (second page, back side, endorsements). Admin only; allowed even on locked records.
function addCertPhotos(u, p) {
  need(u, ['admin']);
  return withLock(function () {
    var n = kindSheet(p.kind);
    if (!n) throw new Error('Unknown record type.');
    var r = live(n).filter(function (x) { return x.id === p.id; })[0];
    if (!r) throw new Error('Record not found.');
    var photos = Array.isArray(p.photos) ? p.photos : [];
    if (!photos.length) throw new Error('Choose at least one photo.');
    var list = extraIds(r);
    if (list.length + photos.length > 12) throw new Error('At most 12 extra photos per record.');
    photos.forEach(function (d) { list.push(saveDoc('_certificates', d, r.id + '_extra_' + today() + '_' + (list.length + 1) + '.jpg')); });
    r.extraPhotoIds = JSON.stringify(list);
    r.updatedAt = today() + ' ' + nowTime();
    writeRow(n, r._row, r);
    audit(u.email, 'addCertPhotos', p.kind + ' ' + r.id + ' +' + photos.length);
    return { ok: true, extraPhotoIds: r.extraPhotoIds };
  });
}

function saveUser(u, p) {
  need(u, ['admin']);
  return withLock(function () {
    var email = String(p.email || '').trim().toLowerCase();
    if (email.indexOf('@') < 0) throw new Error('Invalid email.');
    if (ROLES.indexOf(p.role) < 0) throw new Error('Invalid role.');
    var contractor = String(p.contractor || '').toUpperCase();
    if ((p.role === 'supervisor' || p.role === 'ic_admin') && cfg().contractors.indexOf(contractor) < 0) throw new Error('A supervisor or IC HSSE user needs a contractor.');
    var ex = getUser(email);
    var o = { email: email, name: String(p.name || email).trim(), role: p.role, contractor: (p.role === 'supervisor' || p.role === 'ic_admin') ? contractor : '', active: p.active === false || p.active === 'FALSE' ? 'FALSE' : 'TRUE' };
    if (ex && ex.role === 'admin' && ex.email === u.email && (o.role !== 'admin' || o.active === 'FALSE')) throw new Error('You cannot remove your own admin access.');
    if (ex) writeRow('Users', ex._row, o); else appendRow('Users', o);
    audit(u.email, 'saveUser', email + ' ' + o.role);
    return { ok: true };
  });
}

function saveConfig(u, p) {
  need(u, ['admin']);
  return withLock(function () {
    var vals = {
      intervalDays: String(Math.max(1, Math.min(31, Number(p.intervalDays) || 7))),
      contractors: String(p.contractors || '').toUpperCase().replace(/\s/g, ''),
      types: String(p.types || ''),
      mainLocations: String(p.mainLocations || '').split(/[\r\n|]+/).map(function (x) { return x.trim(); }).filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; }).join('|')
    };
    if (!vals.mainLocations) throw new Error('Main locations cannot be empty.');
    if (!vals.contractors) throw new Error('Contractors cannot be empty.');
    if (!/^([A-Za-z]:[^|:]+)(\|[A-Za-z]:[^|:]+)*$/.test(vals.types.trim())) throw new Error('Types format: T:Tube|S:System');
    var existing = rows('Config');
    Object.keys(vals).forEach(function (k) {
      var r = existing.filter(function (x) { return x.key === k; })[0];
      if (r) writeRow('Config', r._row, { key: k, value: vals[k] }); else appendRow('Config', { key: k, value: vals[k] });
    });
    audit(u.email, 'saveConfig', JSON.stringify(vals));
    return { ok: true };
  });
}

function waMark(u, p) {
  need(u, ['admin']);
  return withLock(function () {
    var r = rows('WaQueue').filter(function (x) { return x.id === p.id; })[0];
    if (!r) throw new Error('Not found.');
    r.status = 'Sent'; r.sentBy = u.name; r.sentAt = today() + ' ' + nowTime();
    writeRow('WaQueue', r._row, r);
    return { ok: true };
  });
}

function runNow(u) {
  need(u, ['admin']);
  var res = runReminders();
  return { ok: true, result: res };
}

var ACTIONS = {
  listAll: listAll, getPhoto: getPhoto,  submitInspection: submitInspection,
  history: history, dismantle: dismantle, saveSupervisor: saveSupervisor, importSupervisors: importSupervisors,
  setWorkStatus: setWorkStatus, approvePerson: approvePerson, pinRequest: pinRequest, pinSet: pinSet, clearPin: clearPin, registerAndInspect: registerAndInspect, requestScaffold: requestScaffold, uploadTagPhoto: uploadTagPhoto, releaseTagLock: releaseTagLock, saveInspector: saveInspector, addCertPhotos: addCertPhotos, saveTagBack: saveTagBack, saveScaffolder: saveScaffolder, requestDelete: requestDelete, decideDelete: decideDelete, redTag: redTag, removeRedTag: removeRedTag, unlockRecord: unlockRecord, importScaffolders: importScaffolders, saveUser: saveUser, saveConfig: saveConfig, waMark: waMark, runNow: runNow
};

/* ───────────── web app entry ───────────── */

function route(r) {
  var a = r.action;
  if (a === 'ping') return { ok: true, version: VERSION };
  if (a === 'requestCode') return requestCode(r.email);
  if (a === 'verify') return verify(r.email, r.code, r.keep);
  var u = auth(r.token);
  var fn = ACTIONS[a];
  if (!fn) throw new Error('Unknown action.');
  if (['listAll', 'getPhoto', 'history', 'uploadTagPhoto', 'releaseTagLock', 'pinRequest', 'pinSet'].indexOf(a) < 0) {
    var pt = pendingTagFor(u);
    if (pt) throw new Error('TAG_PHOTO_PENDING: take and upload the photo of the signed tag for ' + pt.refId + ' first. Nothing else is possible until then.');
  }
  return fn(u, r);
}

function doPost(e) {
  var out;
  try { out = route(JSON.parse(e.postData.contents)); }
  catch (err) { out = { ok: false, error: String(err && err.message ? err.message : err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('Scaffold Inspection Database API v' + VERSION).setMimeType(ContentService.MimeType.TEXT);
}

/* ───────────── reminders (daily trigger, 07:00) ───────────── */

function dailyReminders() {
  return withLock(function () { return runReminders(); });
}

function runReminders() {
  mailCount = 0;
  var t = today(), c = cfg();
  var sups = live('Supervisors').filter(inWork), supById = {};
  rows('Supervisors').forEach(function (s) { supById[s.id] = s; });
  var done = {};
  rows('WaQueue').forEach(function (w) { if (w.date === t) done[w.key] = 1; });
  var wa = 0, mails = 0;
  var overdue = [], pending = [], dnu = [], certSoon = [], certExpired = [], crewNoCert = [];

  function remind(key, sup, subject, msg) {
    if (!sup || done[key]) return;
    done[key] = 1;
    if (sup.email && mail(sup.email, subject, msg)) mails++;
    var ph = normPhone(sup.phone);
    if (ph) {
      appendRow('WaQueue', { id: 'WA-' + pad(nextCounter('WA'), 5), date: t, key: key, toName: sup.name, phone: ph, message: msg, link: 'https://wa.me/' + ph + '?text=' + encodeURIComponent(msg), status: 'Pending', sentBy: '', sentAt: '' });
      wa++;
    }
  }

  rows('Scaffolds').forEach(function (s) {
    if (s.status === 'Dismantled') return;
    var sup = supById[String(s.builtById || '').split(',').filter(function (x) { return x.indexOf('SUP-') === 0; })[0]];
    var tag = s.refId + ' (' + locFull(s) + ')';
    if (s.status === 'Active' && s.nextDueDate) {
      var d = daysBetween(t, s.nextDueDate);
      if (d === 1) remind('due1:' + s.refId, sup, 'Inspection due tomorrow: ' + s.refId, 'Pengingat HSSE Mentari: inspeksi mingguan scaffold ' + tag + ' jatuh tempo BESOK (' + s.nextDueDate + '). Mohon lakukan inspeksi, isi checklist dan unggah foto tag di aplikasi.');
      else if (d === 0) remind('due0:' + s.refId, sup, 'Inspection due today: ' + s.refId, 'Pengingat HSSE Mentari: inspeksi mingguan scaffold ' + tag + ' jatuh tempo HARI INI. Mohon lakukan inspeksi dan unggah foto tag di aplikasi.');
      else if (d < 0) {
        overdue.push(s.refId + ' · ' + s.contractor + ' · ' + locFull(s) + ' · due ' + s.nextDueDate + ' (' + (-d) + ' d late)');
        remind('over:' + s.refId, sup, 'OVERDUE inspection: ' + s.refId, 'TERLAMBAT: inspeksi scaffold ' + tag + ' seharusnya ' + s.nextDueDate + '. Scaffold TIDAK BOLEH digunakan sampai diinspeksi ulang dan foto tag diunggah di aplikasi.');
      }
    } else if (s.status === 'Pending') {
      if (daysBetween(s.erectedDate, t) >= 1) pending.push(s.refId + ' · ' + s.contractor + ' · ' + locFull(s) + ' · erected ' + s.erectedDate);
    } else if (s.status === 'DoNotUse') {
      dnu.push(s.refId + ' · ' + s.contractor + ' · ' + locFull(s) + (s.redTagAt ? ' · RED TAGGED ' + s.redTagAt : ''));
      remind('dnu:' + s.refId, sup, 'DO NOT USE: ' + s.refId, 'Scaffold ' + tag + ' diberi RED TAG' + (s.redTagAt ? ' sejak ' + s.redTagAt : '') + ' dan DILARANG DIGUNAKAN. Perbaiki temuan, lalu minta inspeksi ulang oleh inspektur.');
    }
  });

  sups.forEach(function (s) {
    if (s.approval === 'Suspended' || !s.expiryDate) return;
    var d = daysBetween(t, s.expiryDate);
    if (d < 0) { certExpired.push(s.name + ' · ' + s.contractor + ' · ' + s.certNo + ' · expired ' + s.expiryDate); return; }
    if ([30, 14, 7, 1, 0].indexOf(d) >= 0) {
      certSoon.push(s.name + ' · ' + s.contractor + ' · ' + s.certNo + ' · expires ' + s.expiryDate + ' (' + d + ' d)');
      remind('cert' + d + ':' + s.id, s, 'Certificate expiry: ' + s.name, 'Pengingat: sertifikat supervisor scaffold atas nama ' + s.name + ' (' + s.certNo + ') berakhir ' + (d === 0 ? 'HARI INI' : 'dalam ' + d + ' hari') + ' (' + s.expiryDate + '). Mohon perbarui sertifikat dan kirim salinannya ke HSSE.');
    }
  });

  live('Scaffolders').filter(inWork).forEach(function (s) {
    if (s.approval === 'Suspended') return;
    var helper = isHelper(s);
    if (helper ? (!s.basicExpiry || !s.wahExpiry) : !s.expiryDate) crewNoCert.push(s.name + ' · ' + s.contractor + (helper ? ' (training missing)' : ''));
    [['cert', s.expiryDate, 'Certificate', 'sertifikat scaffolder', 'ccert', s.certNo],
     ['basic', s.basicExpiry, 'Scaffolding Basic Awareness', 'pelatihan Scaffolding Basic Awareness', 'cbas', ''],
     ['wah', s.wahExpiry, 'Working at Height training', 'pelatihan Working at Height', 'cwah', '']].forEach(function (x) {
      if (!x[1]) return;
      var d = daysBetween(t, x[1]);
      var tag = '[Scaffolder] ' + s.name + ' · ' + s.contractor + ' · ' + x[2] + (x[5] ? ' ' + x[5] : '') + ' · ';
      if (d < 0) { certExpired.push(tag + 'expired ' + x[1]); return; }
      if ([30, 14, 7, 1, 0].indexOf(d) >= 0) {
        certSoon.push(tag + 'expires ' + x[1] + ' (' + d + ' d)');
        remind(x[4] + d + ':' + s.id, s, x[2] + ' expiry: ' + s.name, 'Pengingat: ' + x[3] + ' atas nama ' + s.name + (x[5] ? ' (' + x[5] + ')' : '') + ' berakhir ' + (d === 0 ? 'HARI INI' : 'dalam ' + d + ' hari') + ' (' + x[1] + '). Mohon perbarui dan kirim salinannya ke HSSE.');
      }
    });
  });

  var lines = [];
  function sec(title, arr) { if (arr.length) { lines.push(title + ' (' + arr.length + ')'); arr.forEach(function (x) { lines.push('  • ' + x); }); lines.push(''); } }
  sec('OVERDUE re-inspection', overdue);
  sec('RED TAGGED - DO NOT USE (awaiting re-inspection)', dnu);
  sec('PENDING handover inspection (> 1 day)', pending);
  var tagLate = [];
  rows('Scaffolds').forEach(function (s) { if (s.tagPending === '1' && s.createdAt && daysBetween(s.createdAt.slice(0, 10), t) >= 1) tagLate.push(s.refId + ' · ' + s.contractor + ' · inspector ' + s.tagPendingBy + ' has not uploaded the tag photo'); });
  sec('TAG PHOTO MISSING (> 24 h) - inspector is locked until uploaded', tagLate);
  sec('Certificates EXPIRED (supervisors and scaffolders)', certExpired);
  sec('Certificates expiring (supervisors and scaffolders)', certSoon);
  if (new Date(toMs(t)).getUTCDay() === 1) sec('Scaffolders with no certificate or missing training (Monday list)', crewNoCert);
  if (lines.length) {
    var body = 'Scaffold Register — daily digest ' + t + '\n\n' + lines.join('\n') + '\nWhatsApp reminders waiting in the app (Reminders tab): ' + wa + ' new today.';
    rows('Users').forEach(function (x) {
      if (x.active !== 'FALSE' && x.role === 'admin') if (mail(x.email, 'Scaffold Register digest ' + t, body)) mails++;
    });
    if (pending.length) rows('Users').forEach(function (x) { if (x.active !== 'FALSE' && x.role === 'inspector') mail(x.email, 'Scaffolds awaiting handover inspection', 'Pending:\n  • ' + pending.join('\n  • ')); });
  }
  audit('system', 'reminders', 'wa=' + wa + ' mails=' + mails);
  return { wa: wa, mails: mails, overdue: overdue.length, pending: pending.length, dnu: dnu.length, certSoon: certSoon.length, certExpired: certExpired.length };
}

/* =====================================================================================================
   api_sync.js  -  connects the pages to the MySQL API (see /server). Does NOTHING when config.js has no API_BASE.

   The pages (app.js, admin_sript.js) read and write the browser tables `btt_db_*` synchronously. To keep that logic
   unchanged, this file:
     - fills those tables from the API when a page opens (customers: services + open dates + their own booking;
       staff/owner: everything their role may see), and
     - for staff/owner, sends each change to the API in one request (one MySQL transaction) right after it is made.
   It uses synchronous requests on purpose (so no page code had to become async). The page waits for each reply.
   Load it as a plain (non-defer) <script> in <head>, before app.js.
===================================================================================================== */
(function () {
  'use strict';
  var BASE = String(window.BEARCAT_API_BASE || '').replace(/\/+$/, '');
  var R = window.BearcatRemote = { enabled: !!BASE, admin: false, base: BASE };
  if (!BASE) return;

  var PREFIX = 'btt_db_';
  var TOKEN_KEY = 'bearcatAdminToken', SESSION_KEY = 'bearcatAdminSession', ROLE_KEY = 'bearcatDemoRole', REF_KEY = 'bearcatCustomerDemoReference';
  var PK = { customers: 'customer_id', staff: 'staff_id', services: 'service_id', bookings: 'booking_id', booking_items: 'item_id', travelers: 'traveler_id', payments: 'payment_id', booking_changes: 'change_id', refunds: 'refund_id', audit_log: 'log_id', notifications: 'notification_id', notification_templates: 'template_type', settings: 'setting_key', availability: 'availability_id' };
  var CAN_DELETE = { availability: true }; // the only table the pages ever remove rows from
  var REF_RE = /^BTT-\d{8}-[A-Z0-9]{4}$/;
  var nativeSet = Storage.prototype.setItem;
  var nativeRemove = Storage.prototype.removeItem;

  function ss(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function token() { return ss(TOKEN_KEY) || ''; }
  function putLocal(name, rows) { nativeSet.call(localStorage, PREFIX + name, JSON.stringify(rows)); }
  function getLocal(name) { try { var v = JSON.parse(localStorage.getItem(PREFIX + name) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }

  /** One blocking request. Returns { status, data }. status 0 = could not reach the server. */
  function call(method, path, body) {
    var x = new XMLHttpRequest();
    try {
      x.open(method, BASE + '/api' + path, false);
      if (body != null) x.setRequestHeader('Content-Type', 'application/json');
      var t = token();
      if (t && /^\/(admin|auth\/change-password)/.test(path)) x.setRequestHeader('Authorization', 'Bearer ' + t);
      x.send(body == null ? null : JSON.stringify(body));
    } catch (e) { return { status: 0, data: { ok: false, error: 'Cannot reach the server. Check your internet connection, or wait a minute if the server is waking up, then try again.' } }; }
    var d = null; try { d = JSON.parse(x.responseText); } catch (e) { /* not JSON */ }
    return { status: x.status, data: d || { ok: false, error: 'Unexpected reply from the server (' + x.status + ').' } };
  }
  R.call = call;
  R.message = function (r) { return (r && r.data && r.data.error) || 'Something went wrong. Please try again.'; };

  // ------------------------------------------------------------------ customer side
  function hydratePublic() {
    var last = Number(ss('bearcatPubStamp') || 0);
    if (Date.now() - last < 5000 && getLocal('services').length) return; // pages opened a moment ago: reuse
    var r = call('GET', '/public/bootstrap');
    if (r.status !== 200) return;
    putLocal('services', r.data.services || []); putLocal('availability', r.data.availability || []);
    try { sessionStorage.setItem('bearcatPubStamp', String(Date.now())); } catch (e) { /* ignore */ }
  }
  function upsert(name, row) { var rows = getLocal(name), pk = PK[name], i = -1; rows.forEach(function (x, n) { if (x[pk] === row[pk]) i = n; }); if (i >= 0) rows[i] = row; else rows.push(row); putLocal(name, rows); }
  /** Replace the local copy of ONE booking (and its rows) with what the server sent. */
  R.mergeBundle = function (b) {
    if (!b || !b.booking) return;
    var id = b.booking.booking_id;
    if (b.customer) upsert('customers', b.customer);
    upsert('bookings', b.booking);
    [['booking_items', b.items], ['travelers', b.travelers], ['payments', b.payments], ['booking_changes', b.changes], ['refunds', b.refunds]].forEach(function (p) {
      var kept = getLocal(p[0]).filter(function (x) { return x.booking_id !== id; });
      putLocal(p[0], kept.concat(p[1] || []));
    });
  };
  var memo = {};
  /** Fresh copy of a booking from the server (cached for 3 seconds). Returns true when the booking exists. */
  R.refreshBooking = function (ref) {
    ref = String(ref || '').toUpperCase();
    if (!REF_RE.test(ref)) return false;
    if (memo[ref] && Date.now() - memo[ref].at < 3000) return memo[ref].ok;
    var r = call('GET', '/public/bookings/' + encodeURIComponent(ref));
    var ok = r.status === 200 && !!r.data.booking;
    if (ok) R.mergeBundle(r.data);
    memo[ref] = { at: Date.now(), ok: ok };
    return ok;
  };
  /** POST for the customer pages. Returns { ok, message, data }. */
  R.post = function (path, body) {
    var r = call('POST', path, body);
    if (r.status >= 200 && r.status < 300 && r.data.ok !== false) { memo = {}; return { ok: true, data: r.data }; }
    return { ok: false, message: R.message(r) };
  };

  // ------------------------------------------------------------------ staff / owner side
  var snap = {}; // name -> { id: json } as last known to match the server
  function toMap(name, rows) { var m = {}, pk = PK[name]; rows.forEach(function (r) { m[r[pk]] = JSON.stringify(r); }); return m; }

  function hydrateAdmin() {
    var r = call('GET', '/admin/bootstrap');
    if (r.status === 401) { R.clearSession(); return false; }
    if (r.status !== 200) return false;
    Object.keys(PK).forEach(function (name) { var rows = (r.data.tables && r.data.tables[name]) || []; putLocal(name, rows); snap[name] = toMap(name, rows); });
    R.admin = true;
    return true;
  }
  R.rehydrate = hydrateAdmin;
  R.clearSession = function () {
    try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(ROLE_KEY); } catch (e) { /* ignore */ }
    R.clearCache();
  };
  R.clearCache = function () { Object.keys(PK).forEach(function (n) { try { localStorage.removeItem(PREFIX + n); } catch (e) { /* ignore */ } }); try { sessionStorage.removeItem('bearcatPubStamp'); } catch (e) { /* ignore */ } };

  function diff(name) {
    var rows = getLocal(name), pk = PK[name], prev = snap[name] || {}, cur = {}, ch = { inserts: [], updates: [], deletes: [] };
    rows.forEach(function (r) { var id = r[pk], j = JSON.stringify(r); cur[id] = j; if (!(id in prev)) ch.inserts.push(r); else if (prev[id] !== j) ch.updates.push(r); });
    if (CAN_DELETE[name]) Object.keys(prev).forEach(function (id) { if (!(id in cur)) ch.deletes.push(isNaN(id) ? id : Number(id)); });
    return ch;
  }
  var batching = 0, dirty = {};
  function send(names) {
    var tables = {}, any = false;
    names.forEach(function (n) { var d = diff(n); if (d.inserts.length || d.updates.length || d.deletes.length) { tables[n] = d; any = true; } });
    if (!any) return;
    var r = call('POST', '/admin/batch', { tables: tables });
    if (r.status === 200 && r.data.ok) {
      var map = r.data.idMap || {};
      names.forEach(function (n) { // the server may have chosen a different id for a new row
        if (map[n]) { var pk = PK[n], rows = getLocal(n); rows.forEach(function (row) { if (map[n][row[pk]] != null) row[pk] = map[n][row[pk]]; }); putLocal(n, rows); }
        snap[n] = toMap(n, getLocal(n));
      });
      return;
    }
    if (r.status === 401) { R.clearSession(); }
    else hydrateAdmin(); // put the screen back in line with the database
    var err = new Error(R.message(r)); err.remote = true; throw err;
  }
  /** Group several table writes into ONE request / transaction: begin(); ...writes...; commit(). */
  R.begin = function () { batching += 1; if (batching === 1) dirty = {}; };
  R.commit = function () { batching = Math.max(batching - 1, 0); if (batching === 0) { var names = Object.keys(dirty); dirty = {}; if (names.length) send(names); } };
  R.abort = function () { batching = 0; dirty = {}; hydrateAdmin(); };

  function installWriteThrough() {
    Storage.prototype.setItem = function (k, v) {
      nativeSet.call(this, k, v);
      if (this === localStorage && R.admin && String(k).indexOf(PREFIX) === 0) {
        var name = String(k).slice(PREFIX.length);
        if (!PK[name]) return;
        if (batching) dirty[name] = true; else send([name]);
      }
    };
  }

  // ------------------------------------------------------------------ start
  var isAdminPage = /\/(A\d{3}[^\/]*)\.html$/i.test(location.pathname);
  if (isAdminPage) {
    if (token() && hydrateAdmin()) installWriteThrough();
  } else {
    hydratePublic();
    var ref = ss(REF_KEY);
    if (ref && REF_RE.test(ref)) R.refreshBooking(ref);
  }
})();

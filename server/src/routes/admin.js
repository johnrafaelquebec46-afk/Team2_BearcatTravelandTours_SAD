'use strict';
/**
 * Staff / owner endpoints (all need a login token).
 *   GET  /api/admin/bootstrap  -> every table, in the shape the browser pages already read
 *   POST /api/admin/batch      -> the changes one action made, applied together in ONE database transaction
 * The browser decides WHAT to change (existing admin_sript.js logic); this file decides WHETHER it is allowed.
 */
const express = require('express');
const { pool, withTx } = require('../db');
const { TABLES, ORDER } = require('./../tables');
const { fromDb, toDb, isoToDb, HttpError, bad } = require('../convert');
const { requireAuth, roleOf } = require('../auth');
const { ALLOWED, norm } = require('../rules');

const router = express.Router();
router.use('/admin', requireAuth);

const q = (name) => `\`${TABLES[name].sql}\``;
const SHA_RE = /^sha256\$[A-Za-z0-9]+\$[0-9a-f]{64}$/;

router.get('/admin/bootstrap', async (req, res, next) => {
  try {
    const out = {};
    for (const name of ORDER) {
      let sql = `SELECT * FROM ${q(name)}`;
      if (name === 'audit_log') sql = `SELECT * FROM (SELECT * FROM audit_log ORDER BY log_id DESC LIMIT 2000) x ORDER BY log_id`;
      if (name === 'notifications') sql = `SELECT * FROM (SELECT * FROM notification_log ORDER BY notification_id DESC LIMIT 1000) x ORDER BY notification_id`;
      const [rows] = await pool.query(sql);
      let list = rows.map((r) => fromDb(name, r));
      if (name === 'staff') list = list.map((s) => ({ ...s, password_hash: '', ...(req.user.role !== 'owner' && s.staff_id !== req.user.id ? { email: '', contact_no: '' } : {}) }));
      out[name] = list;
    }
    res.json({ ok: true, user: req.user, tables: out });
  } catch (e) { next(e); }
});

// What each role may do per table. (Customer-side rows are created by the public endpoints, never here.)
const PERM = {
  owner: {
    staff: 'iu', services: 'iu', availability: 'iud', settings: 'iu', notification_templates: 'iu',
    bookings: 'u', booking_items: 'u', payments: 'u', booking_changes: 'iu', refunds: 'iu', audit_log: 'i', notifications: 'i',
  },
  staff: {
    staff: 'u', availability: 'u', bookings: 'u', booking_items: 'u', payments: 'u', booking_changes: 'iu', refunds: 'i', audit_log: 'i', notifications: 'i',
  },
};
// columns the browser may change on UPDATE (everything else is ignored)
const UPDATABLE = {
  bookings: ['handled_by', 'status', 'total_amount', 'deposit_amount', 'payment_due_by', 'remarks', 'approved_at', 'updated_at'],
  booking_items: ['service_date', 'pax_qty', 'unit_rate', 'subtotal'],
  payments: ['payment_status', 'verified_by', 'verified_at'],
  booking_changes: ['decided_by', 'change_fee_percent', 'change_fee', 'price_difference', 'status', 'details', 'decided_at'],
  refunds: ['amount', 'method', 'status', 'reference_no', 'owner_remarks', 'decided_by', 'decided_at', 'paid_at'],
  availability: ['max_capacity', 'available_slots', 'status', 'notes'],
  services: ['service_type', 'service_name', 'description', 'base_rate', 'rate_unit', 'deposit_percent', 'is_available'],
  settings: ['setting_value', 'updated_by', 'updated_at'],
  notification_templates: ['subject', 'body', 'updated_by', 'updated_at'],
  staff: ['full_name', 'email', 'password_hash', 'role', 'is_active', 'contact_no'],
};

const forceStaff = (row, col, id) => { if (row[col] != null) row[col] = id; };

/** Extra rules for each table. `old` is the stored row (UPDATE only). Returns the column->value object to write. */
async function checkRow(conn, name, op, data, old, user) {
  const owner = user.role === 'owner';
  if (name === 'bookings' && op === 'update') {
    const from = norm(old.status); const to = norm(data.status === undefined ? old.status : data.status);
    if (from !== to) {
      if (!(ALLOWED[from] || []).includes(to)) throw bad(`A booking that is "${from}" cannot be changed to "${to}".`);
      if (to === 'confirmed') {
        const [[v]] = await conn.query('SELECT COUNT(*) AS n FROM payment WHERE booking_id = ? AND payment_status = ?', [old.booking_id, 'verified']);
        if (!v.n) throw bad('A booking can only be confirmed after a payment is verified.');
      }
      data.status = to;
    }
    forceStaff(data, 'handled_by', user.id);
  }
  if (name === 'payments' && op === 'update') {
    if (data.payment_status !== undefined && data.payment_status !== old.payment_status) {
      if (old.payment_status !== 'submitted') throw bad('This payment was already handled.');
      if (!['verified', 'not_verified'].includes(data.payment_status)) throw bad('Invalid payment status.');
      data.verified_by = user.id;
    }
  }
  if (name === 'booking_changes') {
    if (op === 'insert') { data.status = 'pending'; data.decided_by = null; data.decided_at = null; }
    else {
      if (data.status !== undefined && data.status !== old.status) { if (old.status !== 'pending') throw bad('This request was already decided.'); if (!['approved', 'rejected'].includes(data.status)) throw bad('Invalid request status.'); }
      forceStaff(data, 'decided_by', user.id);
    }
  }
  if (name === 'refunds') {
    if (op === 'insert') { data.status = 'pending'; data.requested_by = user.id; data.decided_by = null; data.decided_at = null; data.paid_at = null; }
    else {
      if (!owner) throw new HttpError(403, 'Only the owner can approve, reject or pay out a refund.');
      if (data.status !== undefined && data.status !== old.status && ['paid', 'rejected'].includes(old.status)) throw bad('This refund was already settled.');
      forceStaff(data, 'decided_by', user.id);
    }
    if (data.amount !== undefined && data.booking_id !== undefined) { /* amount is checked below against verified payments */ }
  }
  if (name === 'audit_log') { data.staff_id = user.id; }
  if (name === 'settings' || name === 'notification_templates') data.updated_by = user.id;
  if (name === 'staff') {
    const self = old && old.staff_id === user.id;
    if (!owner) { // staff may only edit their own name, email and contact number
      if (!self) throw new HttpError(403, 'You can only edit your own account.');
      for (const k of Object.keys(data)) if (!['full_name', 'email', 'contact_no'].includes(k)) delete data[k];
    }
    if (data.password_hash !== undefined) { if (data.password_hash && SHA_RE.test(data.password_hash) && owner) { /* new account / reset set by the owner */ } else delete data.password_hash; }
    if (op === 'insert') { data.password_hash = data.password_hash || null; if (!data.password_hash) throw bad('A new account needs a password.'); data.role = roleOf(data.role); }
    else if (data.role !== undefined) data.role = roleOf(data.role);
  }
  return data;
}

async function checkRefundAmount(conn, bookingId, amount) {
  const [[v]] = await conn.query("SELECT COALESCE(SUM(amount),0) AS paid FROM payment WHERE booking_id = ? AND payment_status = 'verified'", [bookingId]);
  if (Number(amount) > Number(v.paid) + 0.009) throw bad('The refund cannot be more than the verified payments for this booking.');
}

router.post('/admin/batch', async (req, res, next) => {
  try {
    const tables = req.body && req.body.tables; const user = req.user;
    if (!tables || typeof tables !== 'object') throw bad('Nothing to save.');
    const idMap = {};
    await withTx(async (conn) => {
      for (const name of ORDER) {
        const ch = tables[name]; if (!ch) continue;
        const perm = (PERM[user.role] || {})[name] || '';
        const spec = TABLES[name]; const pk = spec.pk;
        const inserts = Array.isArray(ch.inserts) ? ch.inserts : []; const updates = Array.isArray(ch.updates) ? ch.updates : []; const deletes = Array.isArray(ch.deletes) ? ch.deletes : [];
        if ((inserts.length && !perm.includes('i')) || (updates.length && !perm.includes('u')) || (deletes.length && !perm.includes('d'))) throw new HttpError(403, `Your role cannot change "${name}".`);

        for (const row of updates) {
          const [[old]] = await conn.query(`SELECT * FROM ${q(name)} WHERE \`${pk}\` = ? FOR UPDATE`, [row[pk]]);
          if (!old) throw new HttpError(409, 'A record you changed no longer exists. Refresh the page and try again.');
          const oldRow = fromDb(name, old); const incoming = toDb(name, row);
          const data = {}; (UPDATABLE[name] || []).forEach((c) => { if (c in incoming) data[c] = incoming[c]; });
          const final = await checkRow(conn, name, 'update', data, oldRow, user);
          if (name === 'refunds' && final.amount !== undefined) await checkRefundAmount(conn, oldRow.booking_id, final.amount);
          const keys = Object.keys(final); if (!keys.length) continue;
          await conn.query(`UPDATE ${q(name)} SET ${keys.map((k) => `\`${k}\` = ?`).join(', ')} WHERE \`${pk}\` = ?`, [...keys.map((k) => final[k]), row[pk]]);
        }

        for (const row of inserts) {
          const ownPk = pk === 'setting_key' || pk === 'template_type'; // key/value tables are written by their key
          let data = toDb(name, row); const given = ownPk ? null : data[pk]; if (!ownPk) delete data[pk];
          data = await checkRow(conn, name, 'insert', data, null, user);
          if (name === 'refunds') await checkRefundAmount(conn, data.booking_id, data.amount);
          const keys = Object.keys(data);
          const run = (withId) => {
            const cols = withId ? [pk, ...keys] : keys; const vals = withId ? [given, ...keys.map((k) => data[k])] : keys.map((k) => data[k]);
            const upsert = ownPk ? ` ON DUPLICATE KEY UPDATE ${keys.filter((k) => k !== pk).map((k) => `\`${k}\` = VALUES(\`${k}\`)`).join(', ')}` : '';
            return conn.query(`INSERT INTO ${q(name)} (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})${upsert}`, vals);
          };
          if (!ownPk && given != null) { // keep the browser's id when it is free; otherwise MySQL picks one and the browser is told
            try { await run(true); continue; } catch (e) { if (e.code !== 'ER_DUP_ENTRY' || !/PRIMARY/.test(e.message)) throw e; }
            const [r] = await run(false); (idMap[name] = idMap[name] || {})[given] = r.insertId;
          } else await run(false);
        }

        for (const id of deletes) {
          if (name === 'availability') {
            const [[a]] = await conn.query('SELECT max_capacity, available_slots FROM service_availability WHERE availability_id = ?', [id]);
            if (a && a.max_capacity !== a.available_slots) throw bad('Seats on this date are already reserved by bookings, so it cannot be removed.');
          }
          await conn.query(`DELETE FROM ${q(name)} WHERE \`${pk}\` = ?`, [id]);
        }
      }
      if (tables.staff) { // never lock everyone out
        const [[o]] = await conn.query("SELECT COUNT(*) AS n FROM staff WHERE is_active = 1 AND LOWER(role) LIKE 'owner%'");
        if (!o.n) throw bad('At least one active owner account must remain.');
      }
    });
    res.json({ ok: true, idMap });
  } catch (e) { next(e); }
});
module.exports = { router };

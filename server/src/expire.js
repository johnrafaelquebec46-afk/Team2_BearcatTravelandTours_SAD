'use strict';
/**
 * Automatic cancellation of unpaid bookings.
 * An APPROVED booking whose payment_due_by has passed (no payment submitted) becomes CANCELLED, its seats are released,
 * the action is written to audit_log and the customer notice is logged in notification_log.
 * Runs: when the server starts, every minute, and just before a booking / the admin data is read (so a sleeping
 * server still catches up the moment anyone opens a page).
 */
const { pool, withTx } = require('./db');
const { isoToDb } = require('./convert');

const MARK = 'System: Automatically cancelled - the down payment was not received within the payment deadline.';
const peso = (n) => `PHP ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
const TZ = Number(process.env.BUSINESS_TZ_OFFSET_HOURS || 8);
const fmtDT = (dbStr) => (dbStr ? new Date(Date.parse(`${String(dbStr).replace(' ', 'T')}Z`) + TZ * 3600000).toISOString().replace('T', ' ').slice(0, 16) : '');

let running = null;
/** Cancels every overdue approved booking. Returns how many were cancelled. Safe to call often. */
function expireOverdue() {
  if (running) return running; // one sweep at a time
  running = (async () => {
    const now = isoToDb(new Date());
    const [due] = await pool.query("SELECT booking_id FROM booking WHERE status = 'approved' AND payment_due_by IS NOT NULL AND payment_due_by < ?", [now]);
    let n = 0;
    for (const { booking_id: id } of due) {
      try { if (await cancelOne(id)) n += 1; } catch (e) { console.error('[expire] booking', id, e.message); }
    }
    if (n) console.log(`[expire] auto-cancelled ${n} unpaid booking(s)`);
    return n;
  })().finally(() => { running = null; });
  return running;
}

async function cancelOne(id) {
  return withTx(async (conn) => {
    const now = isoToDb(new Date());
    const [[b]] = await conn.query('SELECT * FROM booking WHERE booking_id = ? FOR UPDATE', [id]);
    if (!b || b.status !== 'approved' || !b.payment_due_by || b.payment_due_by >= now) return false; // changed meanwhile (paid / extended)
    const [[paid]] = await conn.query("SELECT COUNT(*) AS n FROM payment WHERE booking_id = ? AND payment_status IN ('submitted','verified')", [id]);
    if (paid.n) return false; // a payment exists - staff decide, never auto-cancel

    const remarks = [b.remarks, MARK].filter(Boolean).join(' | ').slice(0, 60000);
    await conn.query("UPDATE booking SET status = 'cancelled', remarks = ?, updated_at = ? WHERE booking_id = ? AND status = 'approved'", [remarks, now, id]);

    // give the seats back
    const [items] = await conn.query('SELECT bi.service_id, bi.service_date, bi.pax_qty, s.service_name FROM booking_item bi JOIN service s ON s.service_id = bi.service_id WHERE bi.booking_id = ?', [id]);
    for (const it of items) {
      await conn.query("UPDATE service_availability SET available_slots = LEAST(available_slots + ?, max_capacity), status = IF(status = 'fully_booked' AND LEAST(available_slots + ?, max_capacity) > 0, 'available', status) WHERE service_id = ? AND service_date = ?", [it.pax_qty, it.pax_qty, it.service_id, it.service_date]);
    }

    await conn.query('INSERT INTO audit_log (staff_id, action, booking_id, reference, details, created_at) VALUES (NULL,?,?,?,?,?)',
      ['Auto-cancelled unpaid booking', id, b.booking_ref, `Down payment of ${peso(b.deposit_amount)} was not received by ${fmtDT(b.payment_due_by)}.`, now]);

    // customer notice (logged as "queued" - no email/SMS gateway yet)
    const [[c]] = await conn.query('SELECT * FROM customer WHERE customer_id = ?', [b.customer_id]);
    const [sets] = await conn.query('SELECT setting_key, setting_value FROM system_setting');
    const S = Object.fromEntries(sets.map((r) => [r.setting_key, r.setting_value]));
    if (c) {
      const svcNames = [...new Set(items.map((i) => i.service_name))].join(', ');
      const subject = `Your booking ${b.booking_ref} was cancelled - payment deadline missed`;
      const message = `Hello ${c.full_name},\n\nYour booking ${b.booking_ref} for ${svcNames} (${fmtDate(items[0] && items[0].service_date)}) has been cancelled automatically.\n\nReason: your down payment of ${peso(b.deposit_amount)} was not received by ${fmtDT(b.payment_due_by)} (1-hour deadline after approval). No payment was recorded, so there is nothing to refund.\n\nYou are welcome to submit a new booking request at any time.\n\n${S.business_name || 'Bearcat Travel & Tours'}`;
      const targets = [];
      if ((S.email_enabled ?? '1') === '1' && c.email) targets.push(['email', c.email]);
      if ((S.sms_enabled ?? '1') === '1' && c.contact_no) targets.push(['sms', c.contact_no]);
      for (const [channel, recipient] of targets) {
        await conn.query("INSERT INTO notification_log (booking_id, reference, recipient, channel, template_type, subject, message, status, created_at) VALUES (?,?,?,?,?,?,?,'queued',?)",
          [id, b.booking_ref, recipient, channel, 'booking_closed', channel === 'email' ? subject : null, message, now]);
      }
    }
    return true;
  });
}

/** Start the background sweep (call once from server.js). */
function startSweeper(everyMs = 60000) {
  expireOverdue().catch((e) => console.error('[expire]', e.message));
  const t = setInterval(() => expireOverdue().catch((e) => console.error('[expire]', e.message)), everyMs);
  if (t.unref) t.unref();
}
module.exports = { expireOverdue, startSweeper, MARK };

'use strict';
/** Customer-facing endpoints. No login: a booking is reached by its reference code (same as the existing tracking page). */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool, withTx } = require('../db');
const { fromDb, isoToDb, HttpError, bad } = require('../convert');

const router = express.Router();
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Too many requests. Please wait a few minutes and try again.' } });
const readLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Too many requests. Please slow down.' } });

const clean = (v, max = 255) => String(v == null ? '' : v).replace(/[<>"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const REF_RE = /^BTT-\d{8}-[A-Z0-9]{4}$/;
const TZ = Number(process.env.BUSINESS_TZ_OFFSET_HOURS || 8);
const bizToday = () => new Date(Date.now() + TZ * 3600000).toISOString().slice(0, 10);
const newRef = () => `BTT-${bizToday().replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')}`;
const rows = (name, list) => list.map((r) => fromDb(name, r));

async function bundle(conn, ref) {
  const [[b]] = await conn.query('SELECT * FROM booking WHERE booking_ref = ?', [ref]);
  if (!b) return null;
  const id = b.booking_id;
  const [[c]] = await conn.query('SELECT * FROM customer WHERE customer_id = ?', [b.customer_id]);
  const [items] = await conn.query('SELECT * FROM booking_item WHERE booking_id = ?', [id]);
  const [travelers] = await conn.query('SELECT * FROM traveler WHERE booking_id = ?', [id]);
  const [payments] = await conn.query('SELECT * FROM payment WHERE booking_id = ?', [id]);
  const [changes] = await conn.query('SELECT * FROM booking_change WHERE booking_id = ?', [id]);
  const [refunds] = await conn.query('SELECT * FROM refund WHERE booking_id = ?', [id]);
  const safePayments = rows('payments', payments).map((p) => ({ ...p, verified_by: null })); // staff ids stay private
  const safeBooking = { ...fromDb('bookings', b), handled_by: null };
  return {
    ok: true, customer: fromDb('customers', c), booking: safeBooking, items: rows('booking_items', items), travelers: rows('travelers', travelers),
    payments: safePayments, changes: rows('booking_changes', changes).map((x) => ({ ...x, decided_by: null })),
    refunds: rows('refunds', refunds).map((r) => ({ ...r, requested_by: null, decided_by: null, owner_remarks: null })),
  };
}
const refParam = (req) => { const ref = String(req.params.ref || '').toUpperCase(); if (!REF_RE.test(ref)) throw new HttpError(404, 'Booking reference not found. Check your BTT reference code.'); return ref; };

// Services and open/closed dates (no personal data)
router.get('/public/bootstrap', readLimiter, async (req, res, next) => {
  try {
    const [services] = await pool.query('SELECT * FROM service ORDER BY service_id');
    const [avail] = await pool.query('SELECT * FROM service_availability WHERE service_date >= ? ORDER BY service_date', [bizToday()]);
    res.json({ ok: true, services: rows('services', services), availability: rows('availability', avail).map((a) => ({ ...a, notes: null })) });
  } catch (e) { next(e); }
});

router.get('/public/bookings/:ref', readLimiter, async (req, res, next) => {
  try {
    const b = await bundle(pool, refParam(req));
    if (!b) throw new HttpError(404, 'Booking reference not found. Check your BTT reference code.');
    res.json(b);
  } catch (e) { next(e); }
});

// New booking request. Prices are calculated HERE from the service table, never trusted from the browser.
router.post('/public/bookings', writeLimiter, async (req, res, next) => {
  try {
    const c = req.body.customer || {}; const it = req.body.item || {}; const tr = Array.isArray(req.body.travelers) ? req.body.travelers : [];
    const name = clean(c.full_name, 100); const email = clean(c.email, 100).toLowerCase(); const phone = clean(c.contact_no, 20);
    if (name.length < 2) throw bad('Enter the full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email address.');
    if (!/^(09|\+639)\d{9}$/.test(phone.replace(/[\s\-()]/g, ''))) throw bad('Enter a valid Philippine mobile number.');
    const date = String(it.service_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < bizToday()) throw bad('Choose a travel date that is today or later.');
    if (tr.length < 1 || tr.length > 100) throw bad('Add at least one traveler.');
    const travelers = tr.map((t) => ({ full_name: clean(t.full_name, 100), birthdate: String(t.birthdate || '').slice(0, 10), id_no: clean(t.id_no, 50) }));
    travelers.forEach((t) => { if (t.full_name.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(t.birthdate) || t.birthdate > bizToday() || t.id_no.length < 4) throw bad('Each traveler needs a name, a valid birthdate and an ID number.'); });
    const pax = Math.min(Math.max(Math.trunc(Number(it.pax_qty) || travelers.length), 1), 100);
    const roundTrip = it.trip_type === 'round-trip';

    const out = await withTx(async (conn) => {
      const [[svc]] = await conn.query('SELECT * FROM service WHERE service_id = ?', [Number(it.service_id)]);
      if (!svc || !svc.is_available) throw bad('That service is not available right now.');
      const now = isoToDb(new Date());
      const [[old]] = await conn.query('SELECT customer_id FROM customer WHERE LOWER(email) = ?', [email]);
      let cid;
      if (old) { cid = old.customer_id; await conn.query('UPDATE customer SET full_name = ?, contact_no = ? WHERE customer_id = ?', [name, phone, cid]); }
      else { const [r] = await conn.query('INSERT INTO customer (full_name, email, contact_no, created_at) VALUES (?,?,?,?)', [name, email, phone, now]); cid = r.insertId; }
      const unit = Number(svc.base_rate) || 0;
      const subtotal = Math.round(unit * (svc.rate_unit === 'per pax' ? pax : 1) * (roundTrip ? 2 : 1) * 100) / 100;
      const deposit = Math.round(subtotal * (Number(svc.deposit_percent) || 30)) / 100;
      const remarks = clean(`${roundTrip ? 'round-trip' : 'one-way'} | Dep: ${clean(it.departure_schedule, 40) || 'TBA'}${it.return_date ? ` | Ret: ${clean(it.return_date, 12)} ${clean(it.return_schedule, 40)}` : ''}`, 500);
      let ref = newRef();
      for (let i = 0; i < 6; i += 1) { const [[x]] = await conn.query('SELECT 1 AS n FROM booking WHERE booking_ref = ?', [ref]); if (!x) break; ref = newRef(); }
      const [bk] = await conn.query('INSERT INTO booking (booking_ref, customer_id, handled_by, status, total_amount, deposit_amount, payment_due_by, remarks, created_at, approved_at, updated_at) VALUES (?,?,NULL,?,?,?,?,?,?,NULL,?)',
        [ref, cid, 'pending', subtotal, deposit, isoToDb(Date.now() + 24 * 3600000), remarks, now, now]);
      await conn.query('INSERT INTO booking_item (booking_id, service_id, service_date, pax_qty, pickup_location, destination, unit_rate, subtotal) VALUES (?,?,?,?,?,?,?,?)',
        [bk.insertId, svc.service_id, date, pax, clean(it.pickup_location, 255), clean(it.destination, 255), unit, subtotal]);
      for (const t of travelers) await conn.query('INSERT INTO traveler (booking_id, full_name, birthdate, id_no) VALUES (?,?,?,?)', [bk.insertId, t.full_name, t.birthdate, t.id_no]);
      return bundle(conn, ref);
    });
    res.status(201).json(out);
  } catch (e) { next(e); }
});

// Payment proof (only the file name is stored, like the existing customer pages)
router.post('/public/bookings/:ref/payments', writeLimiter, async (req, res, next) => {
  try {
    const ref = refParam(req); const method = clean(req.body.method, 40); const payRef = clean(req.body.reference, 80); const amount = Math.round(Number(req.body.amount) * 100) / 100;
    const proof = clean(req.body.proof_file, 200);
    if (!method || payRef.length < 4) throw bad('Select a payment method and enter a valid payment reference number.');
    if (!(amount > 0) || amount > 10000000) throw bad('Payment amount must be greater than PHP 0.00.');
    if (!proof) throw bad('Upload a valid payment proof file.');
    const out = await withTx(async (conn) => {
      const [[b]] = await conn.query('SELECT * FROM booking WHERE booking_ref = ? FOR UPDATE', [ref]);
      if (!b) throw new HttpError(404, 'Booking reference not found.');
      if (b.status !== 'approved') throw new HttpError(409, 'This booking is not waiting for a payment right now.');
      if (b.payment_due_by && new Date(String(b.payment_due_by).replace(' ', 'T') + 'Z').getTime() < Date.now()) throw new HttpError(409, 'The payment deadline has passed. Please check your booking status.');
      const now = isoToDb(new Date());
      await conn.query('INSERT INTO payment (booking_id, verified_by, amount, method, proof_file, payment_status, paid_at, verified_at) VALUES (?,NULL,?,?,?,?,?,NULL)', [b.booking_id, amount, `${method} (${payRef})`.slice(0, 50), proof, 'submitted', now]);
      await conn.query('UPDATE booking SET status = ?, updated_at = ? WHERE booking_id = ?', ['payment_submitted', now, b.booking_id]);
      return bundle(conn, ref);
    });
    res.status(201).json(out);
  } catch (e) { next(e); }
});

// Change / cancellation request
router.post('/public/bookings/:ref/changes', writeLimiter, async (req, res, next) => {
  try {
    const ref = refParam(req); const type = clean(req.body.request_type, 50) || 'change'; const details = clean(req.body.details, 1000);
    if (details.length < 5) throw bad('Provide complete details or reason (at least 5 characters) before submitting.');
    const out = await withTx(async (conn) => {
      const [[b]] = await conn.query('SELECT * FROM booking WHERE booking_ref = ? FOR UPDATE', [ref]);
      if (!b) throw new HttpError(404, 'Booking reference not found.');
      if (!['pending', 'approved', 'payment_submitted', 'confirmed'].includes(b.status)) throw new HttpError(409, 'This booking can no longer be changed or cancelled.');
      await conn.query('INSERT INTO booking_change (booking_id, decided_by, request_type, details, change_fee_percent, change_fee, price_difference, status, requested_at, decided_at) VALUES (?,NULL,?,?,0,0,0,?,?,NULL)', [b.booking_id, type, details, 'pending', isoToDb(new Date())]);
      return bundle(conn, ref);
    });
    res.status(201).json(out);
  } catch (e) { next(e); }
});
module.exports = { router };

'use strict';
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { HttpError, isoToDb } = require('../convert');
const { checkPassword, hashPassword, sign, requireAuth, roleOf, sha256 } = require('../auth');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Too many attempts. Please wait a few minutes and try again.' } });
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
const audit = (staffId, action, details) => pool.query('INSERT INTO audit_log (staff_id, action, details, created_at) VALUES (?,?,?,?)', [staffId, action, details || null, isoToDb(new Date())]).catch(() => { });

router.post('/auth/login', limiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase(); const pw = String(req.body.password || ''); const want = req.body.role === 'owner' ? 'owner' : 'staff';
    const [[acct]] = await pool.query('SELECT * FROM staff WHERE LOWER(email) = ?', [email]);
    if (!acct || !(await checkPassword(pw, acct.password_hash))) throw new HttpError(401, 'Incorrect email or password.');
    if (!acct.is_active) throw new HttpError(403, 'This account is deactivated. Please contact the owner.');
    if (want === 'owner' && roleOf(acct.role) !== 'owner') throw new HttpError(403, 'This account is not a management / owner account. Choose "Company personnel".');
    if (String(acct.password_hash).startsWith('sha256$')) await pool.query('UPDATE staff SET password_hash = ? WHERE staff_id = ?', [await hashPassword(pw), acct.staff_id]); // upgrade weak hash
    await audit(acct.staff_id, 'Signed in');
    res.json({ ok: true, token: sign(acct), staff: { staff_id: acct.staff_id, full_name: acct.full_name, role: roleOf(acct.role) } });
  } catch (e) { next(e); }
});

router.post('/auth/change-password', limiter, requireAuth, async (req, res, next) => {
  try {
    const cur = String(req.body.current || ''); const next_ = String(req.body.next || '');
    const [[acct]] = await pool.query('SELECT password_hash FROM staff WHERE staff_id = ?', [req.user.id]);
    if (!(await checkPassword(cur, acct.password_hash))) throw new HttpError(400, 'Your current password is not correct.');
    if (next_) {
      if (next_.length < 8) throw new HttpError(400, 'The new password must be at least 8 characters.');
      await pool.query('UPDATE staff SET password_hash = ? WHERE staff_id = ?', [await hashPassword(next_), req.user.id]);
      await audit(req.user.id, 'Changed own password');
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/auth/forgot', limiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase(); const out = { ok: true };
    if (isEmail(email)) {
      const [[acct]] = await pool.query('SELECT staff_id FROM staff WHERE LOWER(email) = ? AND is_active = 1', [email]);
      if (acct) {
        const token = crypto.randomBytes(24).toString('hex');
        await pool.query('INSERT INTO password_reset (email, token_hash, expires_at, used) VALUES (?,?,?,0)', [email, sha256(token), isoToDb(Date.now() + 30 * 60000)]);
        if (String(process.env.SHOW_RESET_LINK).toLowerCase() === 'true') out.token = token; else console.log(`[reset] token for ${email}: ${token}`);
      }
    }
    res.json(out); // same answer whether or not the account exists
  } catch (e) { next(e); }
});

router.post('/auth/reset', limiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase(); const token = String(req.body.token || ''); const pw = String(req.body.password || '');
    if (pw.length < 8) throw new HttpError(400, 'The password must be at least 8 characters.');
    const [[r]] = await pool.query('SELECT reset_id FROM password_reset WHERE email = ? AND token_hash = ? AND used = 0 AND expires_at > ?', [email, sha256(token), isoToDb(new Date())]);
    if (!r) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
    const [[acct]] = await pool.query('SELECT staff_id FROM staff WHERE LOWER(email) = ?', [email]);
    if (!acct) throw new HttpError(400, 'Account not found.');
    await pool.query('UPDATE staff SET password_hash = ? WHERE staff_id = ?', [await hashPassword(pw), acct.staff_id]);
    await pool.query('UPDATE password_reset SET used = 1 WHERE email = ?', [email]);
    await audit(acct.staff_id, 'Password reset');
    res.json({ ok: true });
  } catch (e) { next(e); }
});
module.exports = { router };

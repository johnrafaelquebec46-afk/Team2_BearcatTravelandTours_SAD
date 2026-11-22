'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { HttpError } = require('./convert');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 24) { console.error('[config] JWT_SECRET is missing or too short (use at least 24 random characters).'); process.exit(1); }

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k.toString('hex')))));
const roleOf = (r) => (/owner|manage/i.test(String(r || '')) ? 'owner' : 'staff');

async function hashPassword(pw) { const salt = crypto.randomBytes(16).toString('hex'); return `scrypt$${salt}$${await scrypt(pw, salt)}`; }
/** Accepts scrypt (server) and sha256$salt$hex (created by the browser when an owner adds an account). */
async function checkPassword(pw, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (!salt || !hash) return false;
  let calc = '';
  if (kind === 'scrypt') calc = await scrypt(pw, salt); else if (kind === 'sha256') calc = sha256(salt + pw); else return false;
  const a = Buffer.from(calc); const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const sign = (staff) => jwt.sign({ sid: staff.staff_id, role: roleOf(staff.role) }, SECRET, { expiresIn: '8h' });

/** Reads the Bearer token, reloads the account (so deactivation / role changes apply at once). */
async function requireAuth(req, res, next) {
  try {
    const h = req.get('Authorization') || ''; const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) throw new HttpError(401, 'Please log in.');
    let p; try { p = jwt.verify(token, SECRET); } catch (_) { throw new HttpError(401, 'Your session expired. Please log in again.'); }
    const [[row]] = await pool.query('SELECT staff_id, full_name, email, role, is_active FROM staff WHERE staff_id = ?', [p.sid]);
    if (!row || !row.is_active) throw new HttpError(401, 'This account is no longer active.');
    req.user = { id: row.staff_id, name: row.full_name, email: row.email, role: roleOf(row.role) };
    next();
  } catch (e) { next(e); }
}
module.exports = { hashPassword, checkPassword, sign, requireAuth, roleOf, sha256 };

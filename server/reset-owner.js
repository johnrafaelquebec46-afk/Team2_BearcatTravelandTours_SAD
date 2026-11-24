'use strict';
/**  node scripts/reset-owner.js
 *   Sets the owner login to OWNER_EMAIL / OWNER_PASSWORD from .env (creates it if missing, reactivates it, updates the password).
 */
require('dotenv').config();
const { pool } = require('../src/db');
const { hashPassword } = require('../src/auth');
(async () => {
  try {
    const email = String(process.env.OWNER_EMAIL || '').trim().toLowerCase(); const pw = process.env.OWNER_PASSWORD || '';
    if (!email || pw.length < 8) throw new Error('Set OWNER_EMAIL and an OWNER_PASSWORD of at least 8 characters in .env first.');
    const hash = await hashPassword(pw);
    const [[a]] = await pool.query('SELECT staff_id FROM staff WHERE LOWER(email) = ?', [email]);
    if (a) { await pool.query("UPDATE staff SET password_hash = ?, role = 'owner', is_active = 1 WHERE staff_id = ?", [hash, a.staff_id]); console.log(`Updated ${email}: password reset, role owner, active.`); }
    else { await pool.query("INSERT INTO staff (full_name, email, password_hash, role, is_active, contact_no) VALUES (?,?,?,'owner',1,'')", [process.env.OWNER_NAME || 'Owner', email, hash]); console.log(`Created owner ${email}.`); }
    const [rows] = await pool.query('SELECT staff_id, email, role, is_active FROM staff'); console.table(rows);
    process.exit(0);
  } catch (e) { console.error('Failed:', e.message); process.exit(1); }
})();

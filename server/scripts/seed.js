'use strict';
/**
 *   node scripts/seed.js           owner account (from .env) + the three starter services (only when empty)
 *   node scripts/seed.js --demo    also adds sample customers / bookings so every admin page has something to show
 */
require('dotenv').config();
const { pool } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { isoToDb } = require('../src/convert');

const ago = (h) => isoToDb(Date.now() - h * 3600000);
const ahead = (m) => isoToDb(Date.now() + m * 60000);
const day = (n) => new Date(Date.now() + 8 * 3600000 + n * 86400000).toISOString().slice(0, 10);

(async () => {
  try {
    const email = String(process.env.OWNER_EMAIL || 'owner@bearcat.com').toLowerCase(); const pw = process.env.OWNER_PASSWORD || 'ChangeThisPassword1';
    const [[o]] = await pool.query('SELECT COUNT(*) AS n FROM staff'); 
    if (!o.n) {
      await pool.query('INSERT INTO staff (full_name, email, password_hash, role, is_active, contact_no) VALUES (?,?,?,?,1,?)', [process.env.OWNER_NAME || 'Owner', email, await hashPassword(pw), 'owner', '']);
      console.log(`Owner account created: ${email}  (password from OWNER_PASSWORD in .env)`);
      if (pw === 'ChangeThisPassword1') console.warn('!! You are using the default owner password. Change it after the first login (My account).');
    } else console.log('Staff accounts already exist - owner not created.');
    const [[s]] = await pool.query('SELECT COUNT(*) AS n FROM service');
    if (!s.n) {
      await pool.query('INSERT INTO service (service_type, service_name, description, base_rate, rate_unit, deposit_percent, is_available) VALUES ?', [[
        ['Tour Package', 'El Nido Island Hopping Tour', 'Island hopping with lunch and guide.', 2500, 'per pax', 30, 1],
        ['Van Rental', 'Private Airport / City Van Transfer', 'Private van with driver.', 3500, 'per trip', 50, 1],
        ['Custom Itinerary', 'Coron & Palawan Multi-Day Package', 'Multi-day trip planned around you. Quoted per request.', 0, 'per pax', 30, 1],
      ]]);
      console.log('Starter services added (edit them in the owner portal > Services & rates).');
    }
    if (process.argv.includes('--demo')) {
      const [[b]] = await pool.query('SELECT COUNT(*) AS n FROM booking');
      if (b.n) { console.log('Bookings already exist - demo data skipped.'); process.exit(0); }
      const [[st]] = await pool.query("SELECT staff_id FROM staff ORDER BY staff_id LIMIT 1");
      const cust = []; for (const [n, e, p] of [['Maria Santos', 'maria.santos@example.com', '0917 123 4567'], ['Juan Dela Cruz', 'juan.delacruz@example.com', '0928 555 0101'], ['Ana Reyes', 'ana.reyes@example.com', '0935 222 3344']]) cust.push((await pool.query('INSERT INTO customer (full_name,email,contact_no,created_at) VALUES (?,?,?,?)', [n, e, p, ago(72)]))[0].insertId);
      let k = 0;
      const mk = async (ci, svc, pax, travel, status, o = {}) => {
        k += 1; const [[sv]] = await pool.query('SELECT * FROM service WHERE service_id = ?', [svc]);
        const sub = o.total != null ? o.total : Number(sv.base_rate) * (sv.rate_unit === 'per pax' ? pax : 1); const dep = Math.round(sub * sv.deposit_percent) / 100;
        const ref = `BTT-${day(0).replace(/-/g, '')}-D${String(100 + k).slice(-3)}`;
        const [r] = await pool.query('INSERT INTO booking (booking_ref,customer_id,handled_by,status,total_amount,deposit_amount,payment_due_by,remarks,created_at,approved_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [ref, cust[ci], o.handled || null, status, sub, dep, o.due || ahead(1440), o.remarks || 'one-way | Dep: 08:00 AM', ago(o.age || 3), o.approved || null, ago(1)]);
        await pool.query('INSERT INTO booking_item (booking_id,service_id,service_date,pax_qty,pickup_location,destination,unit_rate,subtotal) VALUES (?,?,?,?,?,?,?,?)', [r.insertId, svc, travel, pax, 'Puerto Princesa Airport', 'El Nido', sv.base_rate, sub]);
        await pool.query('INSERT INTO traveler (booking_id,full_name,birthdate,id_no) VALUES (?,?,?,?)', [r.insertId, `Traveler of ${ref}`, '1992-04-12', `ID-${1000 + k}`]);
        return { id: r.insertId, dep };
      };
      await mk(0, 1, 4, day(10), 'pending');
      await mk(1, 2, 2, day(2), 'pending', { age: 1 });
      await mk(2, 3, 5, day(14), 'pending', { total: 0, remarks: 'Custom request: 4-day Coron and Palawan trip, island hopping.' });
      await mk(0, 1, 2, day(7), 'approved', { handled: st.staff_id, approved: ago(0.3), due: ahead(40) });
      const p = await mk(1, 1, 2, day(8), 'payment_submitted', { handled: st.staff_id, approved: ago(1), due: ahead(30) });
      await pool.query('INSERT INTO payment (booking_id,amount,method,proof_file,payment_status,paid_at) VALUES (?,?,?,?,?,?)', [p.id, p.dep, 'GCash (REF778812)', 'gcash_receipt.png', 'submitted', ago(0.4)]);
      const c = await mk(2, 1, 3, day(12), 'confirmed', { handled: st.staff_id, approved: ago(30) });
      await pool.query('INSERT INTO payment (booking_id,verified_by,amount,method,proof_file,payment_status,paid_at,verified_at) VALUES (?,?,?,?,?,?,?,?)', [c.id, st.staff_id, c.dep, 'Bank Transfer (BT-5521)', 'bank.jpg', 'verified', ago(29), ago(28)]);
      await pool.query("INSERT INTO booking_change (booking_id,request_type,details,change_fee_percent,change_fee,price_difference,status,requested_at) VALUES (?,?,?,0,0,0,'pending',?)", [c.id, 'change', `Please move the trip to ${day(16)}.`, ago(6)]);
      console.log('Demo bookings added (references start with BTT-' + day(0).replace(/-/g, '') + '-D).');
    }
    process.exit(0);
  } catch (e) { console.error('Seed failed:', e.message); process.exit(1); }
})();

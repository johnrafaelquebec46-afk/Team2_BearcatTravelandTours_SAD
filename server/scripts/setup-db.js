'use strict';
/**
 * Creates every table by running the project's SQL files in order:
 *   create_table.sql  ->  joins_constraints.sql  ->  schema_additions.sql
 * It connects to DB_NAME directly, so it ignores CREATE DATABASE / USE lines (hosted databases already give you one).
 *   node scripts/setup-db.js            create tables (stops if they already exist)
 *   node scripts/setup-db.js --reset    DROP all Bearcat tables first (development only - deletes data!)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

const ROOT = path.join(__dirname, '..', '..');
const FILES = ['create_table.sql', 'joins_constraints.sql', 'schema_additions.sql'];
const TABLES = ['password_reset', 'notification_log', 'notification_template', 'system_setting', 'audit_log', 'refund', 'service_availability', 'booking_change', 'payment', 'booking_item', 'traveler', 'booking', 'service', 'staff', 'customer'];

function statements(text) {
  const noComments = text.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = []; let cur = ''; let quote = null;
  for (let i = 0; i < noComments.length; i += 1) {
    const ch = noComments[i];
    if (quote) { cur += ch; if (ch === '\\') { cur += noComments[++i]; } else if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; cur += ch; continue; }
    if (ch === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((s) => !/^(CREATE\s+DATABASE|USE)\b/i.test(s));
}

(async () => {
  try {
    const [[db]] = await pool.query('SELECT DATABASE() AS name');
    console.log(`Connected to database "${db.name}".`);
    if (process.argv.includes('--reset')) {
      await pool.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const t of TABLES) await pool.query(`DROP TABLE IF EXISTS \`${t}\``);
      await pool.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log('Dropped existing tables.');
    }
    const [exists] = await pool.query("SHOW TABLES LIKE 'booking'");
    if (exists.length) { console.error('Tables already exist. Nothing was changed. (Use --reset only on a development database.)'); process.exit(1); }
    for (const f of FILES) {
      const file = path.join(ROOT, f);
      if (!fs.existsSync(file)) throw new Error(`Cannot find ${f} next to the server folder.`);
      const list = statements(fs.readFileSync(file, 'utf8'));
      for (const sql of list) { try { await pool.query(sql); } catch (e) { console.error(`\nFailed in ${f}:\n${sql.slice(0, 200)}\n-> ${e.message}`); process.exit(1); } }
      console.log(`Ran ${f} (${list.length} statements).`);
    }
    console.log('\nDone. Next: npm run seed');
    process.exit(0);
  } catch (e) { console.error('Setup failed:', e.message); process.exit(1); }
})();

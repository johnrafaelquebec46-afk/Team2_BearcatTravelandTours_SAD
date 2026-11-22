'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'bearcat_travels',
  waitForConnections: true,
  connectionLimit: 8,
  dateStrings: true,       // DATETIME/DATE come back as text; no timezone surprises
  decimalNumbers: true,    // DECIMAL comes back as numbers
  charset: 'utf8mb4',
  ssl: String(process.env.DB_SSL).toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined,
});

/** Run fn(conn) inside one transaction. */
async function withTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) { try { await conn.rollback(); } catch (_) { /* ignore */ } throw e; } finally { conn.release(); }
}
module.exports = { pool, withTx };

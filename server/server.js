'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { pool } = require('./src/db');
const { HttpError } = require('./src/convert');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render / Railway sit behind a proxy

const origins = String(process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
app.use(helmet());
app.use(cors({
  origin(origin, cb) { if (!origin || origins.includes(origin)) return cb(null, true); return cb(null, false); },
  methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'], maxAge: 600,
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, db: 'up' }); } catch (e) { res.status(503).json({ ok: false, db: 'down' }); }
});
app.use('/api', require('./src/routes/auth').router);
app.use('/api', require('./src/routes/public').router);
app.use('/api', require('./src/routes/admin').router);
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));

const FRIENDLY = {
  ER_DUP_ENTRY: [409, 'That value already exists (for example an email that is already used).'],
  ER_NO_SUCH_TABLE: [500, 'The database is missing a table. Run "npm run setup-db" (see DEPLOYMENT.md).'],
  ER_BAD_FIELD_ERROR: [500, 'The database is missing a column. Run "npm run setup-db" (see DEPLOYMENT.md).'],
  ER_DATA_TOO_LONG: [400, 'One of the values is too long.'],
  ER_CHECK_CONSTRAINT_VIOLATED: [400, 'One of the values is outside the allowed range.'],
  ER_NO_REFERENCED_ROW_2: [400, 'That record points to something that does not exist.'],
  ER_ROW_IS_REFERENCED_2: [409, 'That record is used by other records and cannot be removed.'],
};
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || 500; let message = err.message;
  if (err instanceof HttpError) { /* keep */ } else if (err.type === 'entity.parse.failed') { status = 400; message = 'Bad request.'; }
  else if (FRIENDLY[err.code] || err.errno === 4025) { [status, message] = FRIENDLY[err.code] || [400, 'One of the values is outside the allowed range.']; console.error('[db]', err.code, err.sqlMessage || err.message); }
  else if (['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.code)) { status = 503; message = 'The server cannot reach the database right now.'; console.error('[db]', err.code, err.message); }
  else if (status >= 500) { console.error(err); message = 'Something went wrong on the server. Please try again.'; }
  res.status(status).json({ ok: false, error: message });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Bearcat API listening on port ${PORT}`);
  require('./src/expire').startSweeper(60000); // auto-cancel unpaid bookings past their deadline
  if (!origins.length) console.warn('[config] CORS_ORIGIN is empty: browsers on other sites (GitHub Pages) will be blocked.');
  pool.query('SELECT COUNT(*) AS n FROM staff').then(([[r]]) => { if (!r.n) console.warn('[setup] No staff accounts yet. Run:  npm run seed'); console.log('[db] Connected.'); })
    .catch((e) => console.error('[db] Cannot connect:', e.code || e.message));
});

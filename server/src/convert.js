'use strict';
const { TABLES } = require('./tables');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => new HttpError(400, m);

const isoToDb = (v) => { const d = new Date(v); if (Number.isNaN(d.getTime())) throw bad('A date/time value is not valid.'); return d.toISOString().slice(0, 19).replace('T', ' '); };
const dbToIso = (s) => (s ? String(s).replace(' ', 'T') + '.000Z' : null);

/** DB row -> the shape the browser tables use */
function fromDb(name, row) {
  const { cols } = TABLES[name]; const out = {};
  for (const [c, type] of Object.entries(cols)) {
    let v = row[c];
    if (v === undefined) continue;
    if (v !== null) {
      if (type === 'dt') v = dbToIso(v);
      else if (type === 'bool') v = !!Number(v);
      else if (type === 'int' || type === 'dec') v = Number(v);
      else if (type === 'date') v = String(v).slice(0, 10);
      else if (Buffer.isBuffer(v)) v = v.toString('utf8');
    }
    out[c] = v;
  }
  return out;
}

/** Browser row -> { column: value } for the columns present in the row (unknown keys are dropped). */
function toDb(name, row) {
  const { cols } = TABLES[name]; const out = {};
  for (const [c, type] of Object.entries(cols)) {
    if (!(c in row)) continue;
    let v = row[c];
    if (v === '' || v === undefined) v = null;
    if (v !== null) {
      if (type === 'int') { v = Number(v); if (!Number.isFinite(v)) throw bad(`"${c}" must be a number.`); v = Math.trunc(v); }
      else if (type === 'dec') { v = Number(v); if (!Number.isFinite(v)) throw bad(`"${c}" must be a number.`); v = Math.round(v * 100) / 100; }
      else if (type === 'bool') v = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
      else if (type === 'dt') v = isoToDb(v);
      else if (type === 'date') { if (!/^\d{4}-\d{2}-\d{2}/.test(String(v))) throw bad(`"${c}" must be a date (YYYY-MM-DD).`); v = String(v).slice(0, 10); }
      else v = String(v);
    }
    out[c] = v;
  }
  return out;
}
module.exports = { fromDb, toDb, isoToDb, dbToIso, HttpError, bad };

(() => {
    'use strict';

    //table names and small helpers to fetch data defined in app.js
    const API = window.BearcatClientAPI || null; // defined by app.js (loaded first)
    const PAGE = document.body.dataset.page || '';
    const ROLE = document.body.dataset.role || '';

    const K = Object.assign({
        CUSTOMERS: 'btt_db_customers', SERVICES: 'btt_db_services', BOOKINGS: 'btt_db_bookings',
        BOOKING_ITEMS: 'btt_db_booking_items', TRAVELERS: 'btt_db_travelers', PAYMENTS: 'btt_db_payments', CHANGES: 'btt_db_booking_changes',
    }, API ? API.DB_KEYS : {}, {
        STAFF: 'btt_db_staff', REFUNDS: 'btt_db_refunds', AUDIT: 'btt_db_audit_log', NOTICES: 'btt_db_notifications',
        TEMPLATES: 'btt_db_notification_templates', SETTINGS: 'btt_db_settings', AVAIL: 'btt_db_availability', RESETS: 'btt_db_password_resets',
    });
    const SESSION_KEY = 'bearcatAdminSession';
    const FLASH_KEY = 'bearcatAdminFlash';
    const APP_ROLE_KEY = 'bearcatDemoRole';

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const r2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
    const clean = (v, max = 500) => String(v == null ? '' : v).replace(/[<>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
    const cleanMulti = (v, max = 3000) => String(v == null ? '' : v).replace(/[<>`]/g, '').replace(/\r/g, '').trim().slice(0, max);
    const nowIso = () => new Date().toISOString();
    const peso = (n) => '₱' + num(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n) => String(n).padStart(2, '0');
    const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const addDaysStr = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return localDate(d); };
    const toLocalInput = (d) => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const queryParam = (k) => new URLSearchParams(window.location.search).get(k) || '';
    const go = (url) => { window.location.href = url; };

    //date handling formatting
    function fmtDate(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
        if (!m) return s ? String(s) : '—';
        return settings().date_format === 'DD/MM/YYYY' ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
    }

    //timestamp: local date and time
    function fmtDT(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        let h = d.getHours();
        const ap = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        const day = settings().date_format === 'DD/MM/YYYY' ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
        return `${day}, ${h}:${pad(d.getMinutes())} ${ap}`;
    }
    const daysUntil = (dateStr) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
        if (!m) return null;
        const t = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
        const n = new Date(); const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
        return Math.round((t - today) / 86400000);
    };

    //live messages
    const live = () => document.getElementById('live-message');
    function announce(text, isError = false) {
        const el = live();
        if (!el) { if (isError) window.alert(text); return; }
        el.textContent = text;
        el.style.background = isError ? '#fbe9e7' : '';
        el.style.color = isError ? '#8a2a1c' : '';
        el.setAttribute('role', isError ? 'alert' : 'status');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const flash = (text) => { try { sessionStorage.setItem(FLASH_KEY, text); } catch (_) { /* ignore */ } };
    const showFlash = () => { try { const t = sessionStorage.getItem(FLASH_KEY); if (t) { sessionStorage.removeItem(FLASH_KEY); announce(t); } } catch (_) { /* ignore */ } };
    class UserError extends Error { }
    const fail = (m) => { throw new UserError(m); };
    /** Run an action; show validation errors in the live region instead of crashing. */
    function guarded(fn) {
        return (...args) => {
        try { return fn(...args); } catch (e) {
            if (e instanceof UserError) { announce(e.message, true); return undefined; }
            console.error(e); announce('Something went wrong while saving. Please try again.', true); return undefined;
        }
        };
    }

    //stored-password security: hash and compare
    function sha256(msg) {
        const bytes = new TextEncoder().encode(msg);
        const primes = [];
        for (let n = 2; primes.length < 64; n += 1) if (primes.every((p) => n % p)) primes.push(n);
        const frac = (x) => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
        const k = primes.map((p) => frac(Math.cbrt(p)));
        let h = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
        const l = bytes.length;
        const buf = new Uint8Array(((l + 9 + 63) >> 6) << 6);
        buf.set(bytes); buf[l] = 0x80;
        const dv = new DataView(buf.buffer);
        dv.setUint32(buf.length - 4, (l * 8) >>> 0);
        dv.setUint32(buf.length - 8, Math.floor((l * 8) / 4294967296));
        const w = new Uint32Array(64);
        const rotr = (x, n) => (x >>> n) | (x << (32 - n));
        for (let i = 0; i < buf.length; i += 64) {
        for (let t = 0; t < 16; t += 1) w[t] = dv.getUint32(i + t * 4);
        for (let t = 16; t < 64; t += 1) {
            const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
            const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
            w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let t = 0; t < 64; t += 1) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + S1 + ch + k[t] + w[t]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h = [h[0] + a, h[1] + b, h[2] + c, h[3] + d, h[4] + e, h[5] + f, h[6] + g, h[7] + hh].map((x) => x >>> 0);
        }
        return h.map((x) => x.toString(16).padStart(8, '0')).join('');
    }
    const newSalt = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const hashPassword = (pw) => { const salt = newSalt(); return `sha256$${salt}$${sha256(salt + pw)}`; };
    const checkPassword = (pw, stored) => {
        const parts = String(stored || '').split('$');
        return parts.length === 3 && parts[0] === 'sha256' && sha256(parts[1] + pw) === parts[2];
    };
    //data store
    const readTable = (key) => (API ? API.BearcatStore.readTable(key) : (() => { try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } })());
    function open() {
        const cache = {}; const raw = {}; const dirty = new Set();
        const t = {
        all(key) { if (!cache[key]) { raw[key] = localStorage.getItem(key); cache[key] = readTable(key); } return cache[key]; },
        dirty(key) { dirty.add(key); },
        nextId(key, idField) { return t.all(key).reduce((m, r) => Math.max(m, num(r[idField])), 0) + 1; },
        insert(key, idField, row) { const id = t.nextId(key, idField); const full = Object.assign({ [idField]: id }, row); t.all(key).push(full); dirty.add(key); return full; },
        save() {
            const written = [];
            for (const key of dirty) {
            try { localStorage.setItem(key, JSON.stringify(cache[key])); written.push(key); } catch (e) {
                written.forEach((k) => { try { if (raw[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, raw[k]); } catch (_) { /* ignore */ } });
                fail('The browser storage is full or blocked, so nothing was saved. Free some space and try again.');
            }
            }
        },
        };
        return t;
    }
    function run(fn) { const t = open(); const out = fn(t); t.save(); return out; }
    const peek = () => open(); // read-only use

    //settings module: policy and business profile
    const SETTING_DEFAULTS = {
        business_name: 'Bearcat Travel & Tours', business_email: '', business_contact: '', business_address: '', currency: 'PHP', date_format: 'MM/DD/YYYY',
        email_enabled: '1', sms_enabled: '1',
        deposit_default: '30', payment_deadline_hours: '1', change_fee_min: '5', change_fee_max: '10',
        cancellation_refund_policy: 'Review case by case', late_payment_policy: 'Close booking', extension_hours: '1', policy_notes: '',
    };
    let settingsCache = null;
    function settings() {
        if (!settingsCache) {
        const out = Object.assign({}, SETTING_DEFAULTS);
        readTable(K.SETTINGS).forEach((r) => { if (r.setting_key in out) out[r.setting_key] = String(r.setting_value == null ? '' : r.setting_value); });
        settingsCache = out;
        }
        return settingsCache;
    }
    function saveSettings(t, values) {
        const rows = t.all(K.SETTINGS);
        Object.entries(values).forEach(([k, v]) => {
        if (!(k in SETTING_DEFAULTS)) return;
        const row = rows.find((r) => r.setting_key === k);
        if (row) { row.setting_value = String(v); row.updated_by = me() ? me().staff_id : null; row.updated_at = nowIso(); }
        else rows.push({ setting_key: k, setting_value: String(v), updated_by: me() ? me().staff_id : null, updated_at: nowIso() });
        });
        t.dirty(K.SETTINGS); settingsCache = null;
    }

    //status and booking rules
    const STATUS = {
        pending: 'Pending', approved: 'Approved / Awaiting Payment', payment_submitted: 'Payment Verification',
        confirmed: 'Confirmed / Final', expired: 'Expired', closed: 'Closed', cancelled: 'Cancelled',
    };
    const ALIAS = { 'approved / awaiting payment': 'approved', 'awaiting payment': 'approved', 'payment verification': 'payment_submitted', 'payment_verification': 'payment_submitted', 'confirmed / final': 'confirmed', final: 'confirmed', canceled: 'cancelled' };
    const normStatus = (s) => { const k = String(s == null ? '' : s).trim().toLowerCase(); return STATUS[k] ? k : (ALIAS[k] || k.replace(/\s+/g, '_')); };
    const statusLabel = (c) => STATUS[c] || String(c || '—');
    const TERMINAL = ['expired', 'closed', 'cancelled'];
    const RESERVED = ['approved', 'payment_submitted', 'confirmed']; // statuses that hold seats
    const ALLOWED = {
        pending: ['approved', 'closed', 'cancelled'], approved: ['payment_submitted', 'expired', 'closed', 'cancelled'],
        payment_submitted: ['confirmed', 'approved', 'closed', 'cancelled'], confirmed: ['cancelled'], expired: [], closed: [], cancelled: [],
    };
    const statusClass = (c) => (['approved', 'confirmed'].includes(c) ? 'status-approved' : ['expired', 'closed', 'cancelled'].includes(c) ? 'status-error' : 'status-pending');
    const pill = (c, label) => `<span class="status-pill ${statusClass(c)}">${esc(label || statusLabel(c))}</span>`;
    function setPill(el, code, label) { if (!el) return; el.textContent = label || statusLabel(code); el.classList.remove('status-pending', 'status-approved', 'status-error'); el.classList.add(statusClass(code)); }

    const PAY = { submitted: 'Awaiting verification', verified: 'Verified', not_verified: 'Not verified' };
    const normPay = (s) => { const k = String(s || '').trim().toLowerCase().replace(/\s+/g, '_'); return k === 'verified' ? 'verified' : k === 'not_verified' ? 'not_verified' : 'submitted'; };
    const payClass = (c) => (c === 'verified' ? 'status-approved' : c === 'not_verified' ? 'status-error' : 'status-pending');
    const payPill = (c) => `<span class="status-pill ${payClass(c)}">${PAY[c]}</span>`;
    /** "GCash (REF123)" -> { name: "GCash", ref: "REF123" } (how app.js stores method + reference) */
    function splitMethod(m) { const x = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(String(m || '')); return x ? { name: x[1] || '—', ref: x[2] } : { name: String(m || '—'), ref: '' }; }
    const isCustomType = (t) => /custom/i.test(String(t || ''));
    const isCancelType = (t) => /cancel/i.test(String(t || ''));
    const changeStatus = (s) => { const k = String(s || '').toLowerCase(); return k === 'approved' || k === 'rejected' ? k : 'pending'; };
    const changePill = (s) => `<span class="status-pill ${s === 'approved' ? 'status-approved' : s === 'rejected' ? 'status-error' : 'status-pending'}">${s[0].toUpperCase() + s.slice(1)}</span>`;

    //review targets (?)
    function reviewPriority(days) {
        if (days == null) return { key: 'regular', label: 'Regular', target: 'within 24 hours' };
        if (days <= 1) return { key: 'next-day', label: 'Next-day', target: 'within 1 hour' };
        if (days <= 2) return { key: 'rush', label: 'Rush', target: 'within 1 to 2 hours' };
        return { key: 'regular', label: 'Regular', target: 'within 24 hours' };
    }

    //views for table 
    function customerOf(t, b) { return t.all(K.CUSTOMERS).find((c) => num(c.customer_id) === num(b.customer_id)) || { full_name: 'Unknown customer', email: '', contact_no: '' }; }
    function serviceOf(t, id) { return t.all(K.SERVICES).find((s) => num(s.service_id) === num(id)) || null; }
    function itemsOf(t, b) {
        return t.all(K.BOOKING_ITEMS).filter((i) => num(i.booking_id) === num(b.booking_id)).map((i) => {
        const s = serviceOf(t, i.service_id) || {};
        return Object.assign({}, i, { service_name: s.service_name || 'Unknown service', service_type: s.service_type || '', deposit_percent: num(s.deposit_percent) || 30, rate_unit: s.rate_unit, base_rate: s.base_rate });
        });
    }
    const travelersOf = (t, b) => t.all(K.TRAVELERS).filter((x) => num(x.booking_id) === num(b.booking_id));
    const paymentsOf = (t, b) => t.all(K.PAYMENTS).filter((p) => num(p.booking_id) === num(b.booking_id));
    const changesOf = (t, b) => t.all(K.CHANGES).filter((c) => num(c.booking_id) === num(b.booking_id));
    const refundsOf = (t, b) => t.all(K.REFUNDS).filter((r) => num(r.booking_id) === num(b.booking_id));
    const staffName = (t, id) => { const s = t.all(K.STAFF).find((x) => num(x.staff_id) === num(id)); return s ? s.full_name : ''; };
    const findBooking = (t, ref) => { const r = String(ref || '').trim().toUpperCase(); return t.all(K.BOOKINGS).find((b) => String(b.booking_ref).toUpperCase() === r) || null; };
    const verifiedTotal = (t, b) => r2(paymentsOf(t, b).filter((p) => normPay(p.payment_status) === 'verified').reduce((a, p) => a + num(p.amount), 0));

    //one flat row per booking, for table display of every list
    function summarize(t, b) {
        const items = itemsOf(t, b);
        const c = customerOf(t, b);
        const code = normStatus(b.status);
        const dates = items.map((i) => i.service_date).filter(Boolean).sort();
        const travel = dates[0] || '';
        const pr = reviewPriority(daysUntil(travel));
        return {
        b, code, customer: c, items, ref: b.booking_ref,
        services: [...new Set(items.map((i) => i.service_name))].join(', ') || '—',
        travel_date: travel, pax: items.reduce((a, i) => a + num(i.pax_qty), 0), traveler_count: travelersOf(t, b).length,
        total: num(b.total_amount) || items.reduce((a, i) => a + num(i.subtotal), 0),
        is_custom: items.some((i) => isCustomType(i.service_type)), priority: code === 'pending' ? pr : null,
        };
    }
    const allSummaries = (t) => t.all(K.BOOKINGS).map((b) => summarize(t, b));

    /** Down payment = each item's subtotal x its service deposit %, scaled to the booking total */
    function computeDeposit(items, total) {
        const dflt = num(settings().deposit_default) || 30;
        const sub = items.reduce((a, i) => a + num(i.subtotal), 0);
        if (sub > 0) return r2(items.reduce((a, i) => a + num(i.subtotal) * (num(i.deposit_percent) || dflt) / 100, 0) * (num(total) / sub));
        return r2(num(total) * dflt / 100);
    }
    function depositLabel(items, total, deposit) {
        const p = [...new Set(items.map((i) => num(i.deposit_percent)).filter(Boolean))].sort();
        if (p.length) return p.map((x) => `${x}%`).join(' / ');
        return total > 0 ? `${Math.round((num(deposit) / total) * 100)}%` : '—';
    }

    //availability
    const availRow = (t, serviceId, date) => t.all(K.AVAIL).find((a) => num(a.service_id) === num(serviceId) && a.service_date === date) || null;
    /** Dates without a row are "not managed" and never block approval. */
    function checkAvailability(t, items) {
        return items.map((it) => {
        const svc = serviceOf(t, it.service_id);
        const av = availRow(t, it.service_id, it.service_date);
        let state = 'unmanaged'; let message = 'No capacity set for this date';
        if (svc && svc.is_available === false) { state = 'inactive'; message = 'Service is deactivated'; }
        else if (av) {
            if (av.status === 'unavailable') { state = 'unavailable'; message = 'Date marked unavailable'; }
            else if (av.status === 'fully_booked' || num(av.available_slots) <= 0) { state = 'full'; message = 'Fully booked'; }
            else if (num(av.available_slots) < num(it.pax_qty)) { state = 'short'; message = `Only ${av.available_slots} slot(s) left for ${it.pax_qty} traveler(s)`; }
            else { state = 'ok'; message = `${av.available_slots} of ${av.max_capacity} slots open`; }
        }
        return { item: it, state, message };
        });
    }
    const blockers = (list) => list.filter((a) => ['inactive', 'unavailable', 'full', 'short'].includes(a.state));
    const blockText = (list) => 'Cannot approve: ' + list.map((a) => `${a.item.service_name} on ${fmtDate(a.item.service_date)} - ${a.message}`).join('; ') + '.';
    function reserveSlots(t, b) {
        itemsOf(t, b).forEach((it) => {
        const av = availRow(t, it.service_id, it.service_date); if (!av) return;
        av.available_slots = Math.max(num(av.available_slots) - num(it.pax_qty), 0);
        if (av.status === 'available' && av.available_slots <= 0) av.status = 'fully_booked';
        t.dirty(K.AVAIL);
        });
    }
    function releaseSlots(t, b) {
        itemsOf(t, b).forEach((it) => {
        const av = availRow(t, it.service_id, it.service_date); if (!av) return;
        av.available_slots = Math.min(num(av.available_slots) + num(it.pax_qty), num(av.max_capacity));
        if (av.status === 'fully_booked' && av.available_slots > 0) av.status = 'available';
        t.dirty(K.AVAIL);
        });
    }
})();
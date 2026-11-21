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

    //BOOKING HANDLING AND AVAILABILITY CHECKS
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

    /** Move a booking along an allowed transition (NFR-07). `fields` are extra columns to set. */
    function moveBooking(t, b, to, fields = {}) {
        const from = normStatus(b.status);
        if (!(ALLOWED[from] || []).includes(to)) fail(`A booking that is "${statusLabel(from)}" cannot be changed to "${statusLabel(to)}".`);
        if (RESERVED.includes(from) && TERMINAL.includes(to)) releaseSlots(t, b);
        b.status = to; b.updated_at = nowIso();
        Object.assign(b, fields); t.dirty(K.BOOKINGS);
    }
    /** booking.remarks also holds the customer's trip details, so staff notes are appended, never overwritten. */
    function appendRemark(b, text) {
        const x = clean(text, 600); if (!x) return;
        b.remarks = [b.remarks, `Staff (${me() ? me().full_name : 'staff'}): ${x}`].filter(Boolean).join(' | ');
    }

    // audit trail
    function audit(t, action, { booking = null, reference = null, details = null } = {}) {
        t.insert(K.AUDIT, 'log_id', { staff_id: me() ? me().staff_id : null, action, booking_id: booking ? booking.booking_id : null, reference: reference || (booking ? booking.booking_ref : null), details: details ? clean(details, 600) : null, created_at: nowIso() });
    }
    const TEMPLATE_LABELS = {
        booking_approved: 'Booking approved', booking_confirmed: 'Booking confirmed', payment_not_verified: 'Payment not verified',
        change_decision: 'Change request decision', cancellation_refund: 'Cancellation / refund', booking_closed: 'Booking closed', correction_requested: 'Correction requested',
    };
    const TEMPLATE_DEFAULTS = {
        booking_approved: ['Your booking [Reference] is approved - please pay the down payment', 'Hello [Customer name],\n\nYour booking [Reference] for [Service] on [Travel date] has been approved.\n\nPlease pay the down payment of [Amount] and upload your proof of payment on or before [Deadline]. If payment is not received in time, the request expires and must be submitted again.\n\n[Remarks]\n\nThank you,\n[Business name]'],
        booking_confirmed: ['Your booking [Reference] is confirmed', 'Hello [Customer name],\n\nWe have verified your payment. Your booking [Reference] for [Service] on [Travel date] is now Confirmed / Final.\n\n[Remarks]\n\nThank you,\n[Business name]'],
        payment_not_verified: ['We could not verify your payment for [Reference]', 'Hello [Customer name],\n\nWe could not verify the payment submitted for booking [Reference].\n\nReason: [Remarks]\n\nIf you can still pay, please resubmit your payment and proof on or before [Deadline].\n\n[Business name]'],
        change_decision: ['Update on your change / cancellation request for [Reference]', 'Hello [Customer name],\n\nYour request for booking [Reference] has been [Status].\n\nAmount to pay (change fee and any price difference): [Amount]\n\nStaff remarks: [Remarks]\n\n[Business name]'],
        cancellation_refund: ['Booking [Reference] cancelled', 'Hello [Customer name],\n\nBooking [Reference] ([Service], [Travel date]) has been cancelled.\n\nDetails: [Remarks]\n\nRefund amount: [Amount]. We will contact you about the refund.\n\n[Business name]'],
        booking_closed: ['Your booking request [Reference] was closed', 'Hello [Customer name],\n\nYour booking request [Reference] for [Service] has been closed.\n\nReason: [Remarks]\n\nYou are welcome to submit a new booking request at any time.\n\n[Business name]'],
        correction_requested: ['Please correct your booking request [Reference]', 'Hello [Customer name],\n\nBefore we can approve booking [Reference], we need you to correct or complete some information.\n\nWhat to fix: [Remarks]\n\nPlease contact us or submit a new request with the corrected details.\n\n[Business name]'],
    };
    const templateOf = (t, type) => { const row = t.all(K.TEMPLATES).find((r) => r.template_type === type); const d = TEMPLATE_DEFAULTS[type] || ['Update on your booking [Reference]', 'Hello [Customer name], there is an update on booking [Reference]. [Remarks]']; return { subject: row ? row.subject : d[0], body: row ? row.body : d[1] }; };
    const fillTpl = (text, vars) => String(text || '').replace(/\[([^\]]+)\]/g, (m, k) => (k in vars ? String(vars[k] == null ? '' : vars[k]) : m));
    
    //customer notice logging: no email/SMS gateways, rows stays 'queued'
     function notify(t, b, type, extra = {}) {
        const c = customerOf(t, b); const s = settings(); const sm = summarize(t, b); const tpl = templateOf(t, type);
        const vars = {
        'Customer name': c.full_name, Reference: b.booking_ref, Service: sm.services, 'Travel date': fmtDate(sm.travel_date), Amount: extra.amount != null ? peso(extra.amount) : '',
        Deadline: fmtDT(extra.deadline || b.payment_due_by), Remarks: extra.remarks || '', Status: extra.status || '', 'Business name': s.business_name,
        };
        const subject = fillTpl(tpl.subject, vars); const message = fillTpl(tpl.body, vars).replace(/\n{3,}/g, '\n\n').trim();
        const targets = [];
        if (s.email_enabled === '1' && c.email) targets.push(['email', c.email]);
        if (s.sms_enabled === '1' && c.contact_no) targets.push(['sms', c.contact_no]);
        targets.forEach(([channel, recipient]) => t.insert(K.NOTICES, 'notification_id', { booking_id: b.booking_id, reference: b.booking_ref, recipient, channel, template_type: type, subject: channel === 'email' ? subject : null, message, status: 'queued', created_at: nowIso() }));
        return targets.length;
    }
    const noticeText = (n) => (n ? `Customer notice recorded for ${n} channel${n > 1 ? 's' : ''} (email / SMS).` : 'No customer notice was recorded (email and SMS are switched off in settings, or the customer has no contact details).');

    //STAFF ACCOUNT AND SESSION
    const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
    const roleOf = (r) => (/owner|manage/i.test(String(r || '')) ? 'owner' : 'staff');
    const ROLE_LABEL = { staff: 'Company personnel', owner: 'Management / owner' };
    function ensureStaff() {
        if (readTable(K.STAFF).length) return;
        run((t) => {
        t.insert(K.STAFF, 'staff_id', { full_name: 'AJ Segovia Ragasa', email: 'owner@bearcat.com', password_hash: hashPassword('Owner@12345'), role: 'owner', is_active: true, contact_no: '' });
        t.insert(K.STAFF, 'staff_id', { full_name: 'Sample Staff', email: 'staff@bearcat.com', password_hash: hashPassword('Staff@12345'), role: 'staff', is_active: true, contact_no: '' });
        });
    }
    function session() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; } }
    /** The signed-in staff row, re-read each time so deactivation or a role change takes effect straight away. */
    function me() {
        const s = session(); if (!s) return null;
        const row = readTable(K.STAFF).find((x) => num(x.staff_id) === num(s.staff_id));
        if (!row || !row.is_active) return null;
        return Object.assign({}, row, { role: roleOf(row.role) });
    }
    const isOwner = () => !!me() && me().role === 'owner';
    function requireOwner() { if (!isOwner()) fail('This action is for management / owner accounts only.'); }
    function signOut() { try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(APP_ROLE_KEY); } catch (_) { /* ignore */ } }

    //Page helpers
    const formHandlers = new Map(); // form element -> handler(event, form)
    const clickHandlers = []; // [selector, handler]
    const onSubmit = (form, fn) => { if (form) formHandlers.set(form, guarded(fn)); };
    const onClick = (selector, fn) => clickHandlers.push([selector, guarded(fn)]);
    /** Capture-phase listeners on `document` run before the demo handlers app.js attached to the elements, and we stop those. */
    document.addEventListener('submit', (e) => {
        const h = formHandlers.get(e.target);
        if (!h) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (typeof e.target.reportValidity === 'function' && !e.target.reportValidity()) return;
        h(e, e.target);
    }, true);
    document.addEventListener('click', (e) => {
        for (const [sel, fn] of clickHandlers) {
        const el = e.target.closest(sel);
        if (el) { e.preventDefault(); e.stopImmediatePropagation(); fn(e, el); return; }
        }
        const out = e.target.closest('a[href="A101staff_login.html"]');
        if (out && ROLE !== 'access') signOut();
    }, true);

    const field = (form, n) => form.querySelector(`#field-${n}`);
    const mainEl = () => document.querySelector('main');
    const sectionByHeading = (re) => $$('section.content-card, section.surface, form.surface').find((s) => { const h = s.querySelector('h2'); return h && re.test(h.textContent); }) || null;

    function tbodyOf(table) { return table.tBodies[0] || table.appendChild(document.createElement('tbody')); }
    function fillTable(table, rowsHtml, emptyText) {
        if (!table) return;
        const cols = table.querySelectorAll('thead th').length || 1;
        tbodyOf(table).innerHTML = rowsHtml.length ? rowsHtml.join('') : `<tr><td colspan="${cols}" class="muted">${esc(emptyText || 'No records yet.')}</td></tr>`;
    }
    const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    const btn = (href, label, cls = 'button-soft') => `<a class="button ${cls}" href="${esc(href)}">${esc(label)}</a>`;
    const refQ = (ref) => `?ref=${encodeURIComponent(ref)}`;

    //replacement of placeholder texts on the HTML files.
    function replacePlaceholders(map) {
        const walker = document.createTreeWalker(mainEl(), NodeFilter.SHOW_TEXT);
        const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((n) => { let v = n.nodeValue; Object.entries(map).forEach(([from, to]) => { if (v.includes(from)) v = v.split(from).join(to); }); if (v !== n.nodeValue) n.nodeValue = v; });
    }
    function missing(msg, backHref) {
        const m = mainEl(); const hd = m.querySelector('.page-heading');
        m.innerHTML = '';
        if (hd) m.appendChild(hd);
        m.insertAdjacentHTML('beforeend', `<div class="live-message" id="live-message" role="alert">${esc(msg)}</div><p><a class="button button-soft" href="${esc(backHref)}">Back</a></p>`);
    }

    //filter bar under section headings
    function addFilters(section, defs, onChange) {
        const bar = document.createElement('div');
        bar.className = 'actions'; bar.style.cssText = 'display:flex;gap:.75rem;flex-wrap:wrap;align-items:end;margin:.5rem 0 1rem';
        bar.setAttribute('role', 'search');
        bar.innerHTML = defs.map((d) => `<label style="display:grid;gap:.25rem;font-size:.9rem">${esc(d.label)}${d.type === 'select'
        ? `<select data-f="${d.id}">${d.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`
        : `<input data-f="${d.id}" type="search" placeholder="${esc(d.placeholder || '')}">`}</label>`).join('');
        const h = section.querySelector('h2'); (h || section.firstChild).insertAdjacentElement('afterend', bar);
        const get = () => Object.fromEntries($$('[data-f]', bar).map((el) => [el.dataset.f, el.value.trim()]));
        bar.addEventListener('input', () => onChange(get())); bar.addEventListener('change', () => onChange(get()));
        return get;
    }
    const matches = (hay, q) => !q || hay.toLowerCase().includes(q.toLowerCase());

    function downloadCsv(filename, headers, rows) {
        const cell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
        const text = '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    //shared and consistent booking summary
    const routeOf = (items) => items.map((i) => `${i.pickup_location || '—'} → ${i.destination || '—'}`).join('; ') || '—';
    function fillSummary(t, sm) {
        const b = sm.b;
        const total = sm.total; const deposit = num(b.deposit_amount) > 0 ? num(b.deposit_amount) : computeDeposit(sm.items, total);
        const dd = $$('.summary-list dd');
        const vals = [
        `${sm.customer.full_name} · ${sm.customer.email || 'no email'} · ${sm.customer.contact_no || 'no phone'}`,
        sm.services, total > 0 ? peso(total) : 'To be quoted',
        `${fmtDate(sm.travel_date)} · ${sm.pax} ${sm.pax === 1 ? 'person' : 'people'}`,
        depositLabel(sm.items, total, deposit), total > 0 ? peso(deposit) : '—', routeOf(sm.items),
        ];
        dd.forEach((el, i) => { if (i < vals.length) el.textContent = vals[i]; });
        const list = $('.summary-list');
        if (list && b.remarks && !$('.js-remarks')) list.insertAdjacentHTML('afterend', `<p class="muted js-remarks"><strong>Trip details / notes:</strong> ${esc(b.remarks)}</p>`);
        return deposit;
    }
    function fillHeader(sm) {
        const ref = $('.reference'); if (ref) ref.textContent = sm.ref;
        setPill($('.status-pill'), sm.code);
        replacePlaceholders({ '[reference id]': sm.ref });
    }
    function availabilityHint(t, sm, anchor) {
        const list = checkAvailability(t, sm.items); if (!list.length || !anchor) return;
        const bad = blockers(list).length;
        const el = document.createElement('p'); el.className = 'hint';
        el.textContent = 'Availability: ' + list.map((a) => `${a.item.service_name} ${fmtDate(a.item.service_date)} - ${a.message}`).join('; ') + (bad ? ' (approval is blocked until this is resolved).' : '.');
        anchor.insertAdjacentElement('beforebegin', el);
    }

    // Staff Account access
    function pageLogin() {
        if (me()) { go(roleOf(me().role) === 'owner' && sessionStorage.getItem(APP_ROLE_KEY) === 'owner' ? 'A104owner_dashboard.html' : 'A102staff_dashboard.html'); return; }
        showFlash();
        const form = $('#login-form');
        const LOCK = 'bearcatAdminLock';
        onSubmit(form, () => {
        let lock = {}; try { lock = JSON.parse(localStorage.getItem(LOCK) || '{}'); } catch (_) { lock = {}; }
        if (lock.until && lock.until > Date.now()) fail(`Too many failed attempts. Try again in ${Math.ceil((lock.until - Date.now()) / 60000)} minute(s).`);
        const email = clean(field(form, 1).value, 120).toLowerCase(); const pw = field(form, 2).value; const want = $('#login-role').value === 'owner' ? 'owner' : 'staff';
        const acct = readTable(K.STAFF).find((s) => String(s.email).toLowerCase() === email);
        const ok = acct && acct.is_active && checkPassword(pw, acct.password_hash);
        if (!ok) {
            lock.count = (lock.count || 0) + 1; if (lock.count >= 5) { lock.until = Date.now() + 5 * 60000; lock.count = 0; }
            try { localStorage.setItem(LOCK, JSON.stringify(lock)); } catch (_) { /* ignore */ }
            fail(acct && !acct.is_active ? 'This account is deactivated. Please contact the owner.' : 'Incorrect email or password.');
        }
        if (want === 'owner' && roleOf(acct.role) !== 'owner') fail('This account is not a management / owner account. Choose "Company personnel".');
        try { localStorage.removeItem(LOCK); } catch (_) { /* ignore */ }
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ staff_id: acct.staff_id, at: Date.now() })); sessionStorage.setItem(APP_ROLE_KEY, want); } catch (_) { fail('Your browser is blocking session storage, so you cannot stay signed in.'); }
        run((t) => audit(t, 'Signed in'));
        go(want === 'owner' ? 'A104owner_dashboard.html' : 'A102staff_dashboard.html');
        });
        if (queryParam('seed') === 'demo') {
        const done = seedDemo(queryParam('force') === '1');
        announce(done ? 'Demo data loaded: sample customers, bookings, payments, change requests and refunds. Log in as owner@bearcat.com / Owner@12345 or staff@bearcat.com / Staff@12345.' : 'Demo data was not loaded because bookings already exist. Add &force=1 to the address to add it anyway.', !done);
        }
    }

    function pageForgot() {
        const form = $('form');
        onSubmit(form, () => {
        const email = clean(field(form, 1).value, 120).toLowerCase();
        const acct = readTable(K.STAFF).find((s) => String(s.email).toLowerCase() === email && s.is_active);
        let link = '';
        if (acct) {
            const token = newSalt() + newSalt();
            run((t) => { t.all(K.RESETS).push({ email, token_hash: sha256(token), expires_at: new Date(Date.now() + 30 * 60000).toISOString(), used: false }); t.dirty(K.RESETS); });
            link = `set_new_password.html?token=${token}&email=${encodeURIComponent(email)}`;
        }
        announce('If that email belongs to an active staff account, a reset link is created. This browser-only build cannot send email, so the link appears below.');
        const old = $('#reset-link'); if (old) old.remove();
        if (link) form.insertAdjacentHTML('afterend', `<p id="reset-link" class="surface content-card">Reset link (valid for 30 minutes): <a href="${esc(link)}">Open the reset page</a></p>`);
        });
    }

    function pageSetNewPassword() {
        const form = $('form'); const token = queryParam('token'); const email = (queryParam('email') || '').toLowerCase();
        const valid = () => readTable(K.RESETS).find((r) => r.email === email && !r.used && token && r.token_hash === sha256(token) && new Date(r.expires_at).getTime() > Date.now());
        if (!valid()) { announce('This reset link is invalid or has expired. Request a new one from the "Forgot password" page.', true); }
        const login = $('a[href="staff_login.html"]'); if (login) login.href = 'A101staff_login.html';
        onSubmit(form, () => {
        const rec = valid(); if (!rec) fail('This reset link is invalid or has expired. Request a new one.');
        const a = field(form, 1).value; const b = field(form, 2).value;
        if (a.length < 8) fail('The password must be at least 8 characters.');
        if (a !== b) fail('The two passwords do not match. Please re-enter them.');
        run((t) => {
            const acct = t.all(K.STAFF).find((s) => String(s.email).toLowerCase() === email); if (!acct) fail('Account not found.');
            acct.password_hash = hashPassword(a); t.dirty(K.STAFF);
            t.all(K.RESETS).forEach((r) => { if (r.email === email) r.used = true; }); t.dirty(K.RESETS);
            t.insert(K.AUDIT, 'log_id', { staff_id: acct.staff_id, action: 'Password reset', booking_id: null, reference: null, details: null, created_at: nowIso() });
        });
        flash('Password updated. Please log in.'); go('A101staff_login.html');
        });
    }

    function pageAccount() {
        const form = $('form.demo-form'); const u = me();
        field(form, 1).value = u.full_name; field(form, 2).value = u.email; field(form, 3).value = u.contact_no || '';
        onSubmit(form, () => {
        const name = clean(field(form, 1).value, 100); const email = clean(field(form, 2).value, 120).toLowerCase(); const phone = clean(field(form, 3).value, 20);
        const cur = field(form, 4).value; const next = field(form, 5).value;
        if (name.length < 2) fail('Enter your full name.');
        if (!isEmail(email)) fail('Enter a valid email address.');
        if (phone && !/^[0-9+()\-\s]{7,20}$/.test(phone)) fail('Enter a valid contact number.');
        run((t) => {
            const acct = t.all(K.STAFF).find((s) => num(s.staff_id) === num(u.staff_id));
            if (t.all(K.STAFF).some((s) => num(s.staff_id) !== num(u.staff_id) && String(s.email).toLowerCase() === email)) fail('Another account already uses that email address.');
            const emailChanged = email !== String(acct.email).toLowerCase();
            if ((next || emailChanged) && !checkPassword(cur, acct.password_hash)) fail('Enter your current password to change your email or password.');
            if (next) { if (next.length < 8) fail('The new password must be at least 8 characters.'); acct.password_hash = hashPassword(next); }
            acct.full_name = name; acct.email = email; acct.contact_no = phone; t.dirty(K.STAFF);
            audit(t, 'Updated own account', { details: next ? 'Password changed' : null });
        });
        field(form, 4).value = ''; field(form, 5).value = '';
        announce('Your account was updated.');
        });
    }

})();
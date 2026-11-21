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

    //DASHBOARD MODULE
    const PRIORITY_ORDER = { 'next-day': 0, rush: 1, regular: 2 };
    function actionLink(sm, overdue) {
        const q = refQ(sm.ref);
        if (sm.code === 'pending') return [(sm.is_custom ? 'A405review_custom_request.html' : 'A202review_booking.html') + q, 'Review'];
        if (sm.code === 'payment_submitted') return ['A302verify_payment.html' + q, 'Verify payment'];
        if (sm.code === 'confirmed') return ['A404change_confirmed_booking.html' + q, 'Change'];
        if (sm.code === 'approved' && overdue) return ['A305expired_payments.html' + q, 'Past deadline'];
        return ['A202review_booking.html' + q, 'View'];
    }
    const isOverdue = (b) => normStatus(b.status) === 'approved' && b.payment_due_by && new Date(b.payment_due_by).getTime() < Date.now();
    const statusCell = (sm) => pill(sm.code) + (sm.priority && sm.priority.key !== 'regular' ? ` <span class="hint">${esc(sm.priority.label)}: review ${esc(sm.priority.target)}</span>` : '');

    function pageStaffDashboard() {
        const t = peek(); const u = me(); const sums = allSummaries(t);
        const pend = sums.filter((s) => s.code === 'pending');
        const subs = t.all(K.PAYMENTS).filter((p) => normPay(p.payment_status) === 'submitted');
        const chg = t.all(K.CHANGES).filter((c) => changeStatus(c.status) === 'pending');
        const vals = $$('.stats-grid .stat-value'); [pend.length, subs.length, chg.length].forEach((v, i) => { if (vals[i]) vals[i].textContent = v; });
        const hp = $$('.page-heading p').pop(); if (hp) hp.textContent = `Welcome back, ${u.full_name}.`;
        const acct = sectionByHeading(/My account/i);
        if (acct) { const s = $('strong', acct); if (s) s.textContent = u.full_name; const p = $('p', acct); if (p) p.lastChild.textContent = ` · ${ROLE_LABEL[u.role]}`; const m = $('.muted', acct); if (m) m.textContent = `Handled today: ${t.all(K.AUDIT).filter((a) => num(a.staff_id) === num(u.staff_id) && localDate(new Date(a.created_at)) === localDate()).length} action(s)`; }
        const items = [];
        pend.sort((a, b) => PRIORITY_ORDER[a.priority.key] - PRIORITY_ORDER[b.priority.key] || String(a.b.created_at).localeCompare(String(b.b.created_at))).forEach((s) => items.push({ s, label: statusCell(s), href: actionLink(s) }));
        subs.forEach((p) => { const b = t.all(K.BOOKINGS).find((x) => num(x.booking_id) === num(p.booking_id)); if (!b) return; const s = summarize(t, b); items.push({ s, label: payPill('submitted') + ' payment', href: ['A302verify_payment.html' + refQ(s.ref) + '&pay=' + p.payment_id, 'Verify payment'] }); });
        chg.forEach((c) => { const b = t.all(K.BOOKINGS).find((x) => num(x.booking_id) === num(c.booking_id)); if (!b) return; const s = summarize(t, b); items.push({ s, label: changePill('pending') + ` ${isCancelType(c.request_type) ? 'cancellation' : 'change'}`, href: ['A402review_change_request.html?id=' + c.change_id, 'Review request'] }); });
        sums.filter((s) => isOverdue(s.b)).forEach((s) => items.push({ s, label: pill('approved') + ' <span class="hint">past payment deadline</span>', href: ['A305expired_payments.html' + refQ(s.ref), 'Resolve'] }));
        fillTable($('#dashboard_table'), items.slice(0, 20).map(({ s, label, href }) => row([esc(s.ref), `${esc(s.customer.full_name)} · ${esc(s.services)}`, esc(fmtDate(s.travel_date)), label, btn(href[0], href[1])])), 'Nothing needs action right now.');
    }

    function pageOwnerDashboard() {
        const t = peek(); const sums = allSummaries(t);
        const verified = t.all(K.PAYMENTS).filter((p) => normPay(p.payment_status) === 'verified');
        const refunds = t.all(K.REFUNDS).filter((r) => ['pending', 'approved'].includes(r.status)).length;
        const vals = $$('.stats-grid .stat-value');
        [sums.length, sums.filter((s) => s.code === 'confirmed').length, `${verified.length} (${peso(verified.reduce((a, p) => a + num(p.amount), 0))})`, refunds].forEach((v, i) => { if (vals[i]) vals[i].textContent = v; });
        const recent = sums.slice().sort((a, b) => String(b.b.created_at).localeCompare(String(a.b.created_at))).slice(0, 8);
        fillTable($('section:last-of-type table') || $('table'), recent.map((s) => row([esc(s.ref), esc(s.customer.full_name), esc(s.services), esc(fmtDate(s.travel_date)), pill(s.code), btn('A205booking_details_owner.html' + refQ(s.ref), 'View')])), 'No bookings yet.');
    }

    //BOOKING LISTS
    function pageBookingsList(owner) {
        const t = peek(); const sums = allSummaries(t);
        const sec = $('section.content-card'); const table = $('table', sec);
        const cmp = (a, b) => {
        const pa = a.code === 'pending' ? PRIORITY_ORDER[a.priority.key] : 9; const pb = b.code === 'pending' ? PRIORITY_ORDER[b.priority.key] : 9;
        return pa - pb || String(b.b.created_at).localeCompare(String(a.b.created_at));
        };
        const render = (f) => {
        const list = sums.filter((s) => (!f.status || s.code === f.status) && matches(`${s.ref} ${s.customer.full_name} ${s.customer.email} ${s.services}`, f.q)).sort(cmp);
        fillTable(table, list.map((s) => {
            const [href, label] = owner ? ['A205booking_details_owner.html' + refQ(s.ref), 'View'] : actionLink(s, isOverdue(s.b));
            return owner
            ? row([esc(s.ref), esc(s.customer.full_name), esc(s.services), esc(fmtDate(s.travel_date)), esc(s.total > 0 ? peso(s.total) : 'To be quoted'), pill(s.code), btn(href, label)])
            : row([esc(s.ref), `${esc(s.customer.full_name)} · ${esc(s.services)}`, esc(fmtDate(s.travel_date)), esc(s.pax), statusCell(s), btn(href, label)]);
        }), sums.length ? 'No bookings match the filters.' : 'No booking requests yet. They appear here when customers submit a booking.');
        };
        const get = addFilters(sec, [
        { id: 'status', label: 'Status', type: 'select', options: [['', 'All statuses'], ...Object.entries(STATUS)] },
        { id: 'q', label: 'Search', type: 'text', placeholder: 'Reference, customer or service' },
        ], render);
        const pre = queryParam('status'); if (pre && STATUS[pre]) { $('[data-f="status"]', sec).value = pre; }
        render(get());
    }

    //BOOKING WORKFLOWS
    const bookingByQuery = (t) => { const r = queryParam('ref'); return r ? findBooking(t, r) : null; };

    /** Approve a pending booking (FR-12, FR-13, BR-05). opts: { total, depositPct, remarks } */
    function approveBooking(t, b, opts = {}) {
        const me_ = me();
        if (normStatus(b.status) !== 'pending') fail(`Only pending requests can be approved. This one is "${statusLabel(normStatus(b.status))}".`);
        const items = itemsOf(t, b);
        if (!items.length) fail('This booking has no service lines, so it cannot be approved.');
        const block = blockers(checkAvailability(t, items)); if (block.length) fail(blockText(block));
        if (opts.total != null) {
        const total = r2(opts.total); b.total_amount = total;
        const raw = t.all(K.BOOKING_ITEMS).filter((i) => num(i.booking_id) === num(b.booking_id));
        raw.forEach((i, idx) => { i.subtotal = idx === 0 ? total : 0; if (idx === 0) i.unit_rate = num(i.pax_qty) > 0 ? r2(total / num(i.pax_qty)) : total; });
        t.dirty(K.BOOKING_ITEMS);
        b.deposit_amount = r2(total * num(opts.depositPct || settings().deposit_default) / 100);
        } else if (!(num(b.deposit_amount) > 0)) {
        b.deposit_amount = computeDeposit(items, num(b.total_amount));
        }
        if (!(num(b.total_amount) > 0)) fail('Enter a total amount before approving.');
        const hours = Math.max(num(settings().payment_deadline_hours) || 1, 0.25);
        const due = new Date(Date.now() + hours * 3600000).toISOString();
        if (opts.remarks) appendRemark(b, opts.remarks);
        moveBooking(t, b, 'approved', { handled_by: me_.staff_id, approved_at: nowIso(), payment_due_by: due });
        reserveSlots(t, b);
        audit(t, 'Approved booking request', { booking: b, details: `Down payment ${peso(b.deposit_amount)} due by ${fmtDT(due)}` });
        return notify(t, b, 'booking_approved', { amount: b.deposit_amount, deadline: due, remarks: opts.remarks || '' });
    }
    function closeBooking(t, b, reason, extra, to = 'closed') {
        const from = normStatus(b.status);
        if (!['pending', 'approved', 'payment_submitted'].includes(from)) fail(`A booking that is "${statusLabel(from)}" can no longer be closed.`);
        appendRemark(b, `Closed - ${reason}${extra ? '. ' + extra : ''}`);
        moveBooking(t, b, to, { handled_by: me().staff_id });
        audit(t, to === 'expired' ? 'Closed expired booking' : 'Closed booking request', { booking: b, details: [reason, extra].filter(Boolean).join('. ') });
        return notify(t, b, 'booking_closed', { remarks: [reason, extra].filter(Boolean).join('. ') });
    }

    function pageReviewBooking() {
        const t = peek(); const b = bookingByQuery(t);
        if (!b) return missing('That booking could not be found. Open it from the bookings list.', 'A201bookings_list.html');
        const sm = summarize(t, b);
        if (sm.is_custom && sm.code === 'pending') { go('A405review_custom_request.html' + refQ(sm.ref)); return; }
        fillHeader(sm); fillSummary(t, sm);
        const trav = travelersOf(t, b);
        const tt = $$('table').pop();
        fillTable(tt, trav.map((x) => row([esc(x.full_name), esc(fmtDate(x.birthdate)), esc(x.id_no || '—')])), 'No traveler details were submitted.');
        const form = $('form.demo-form');
        const sel = field(form, 1);
        sel.innerHTML = '<option value="approve">Approve</option><option value="correction">Request correction (notify customer)</option><option value="close">Close request</option>';
        const closeLink = $('a[href="A203close_booking_request.html"]', form); if (closeLink) closeLink.href = 'A203close_booking_request.html' + refQ(sm.ref);
        const dl = $('.hint', form); if (dl) dl.textContent = `Payment deadline: ${settings().payment_deadline_hours} hour(s) after approval. Review target: ${sm.priority ? sm.priority.target : '—'}.`;
        availabilityHint(t, sm, $('.form-actions', form));
        if (sm.code !== 'pending') {
        $$('select, textarea, button[type="submit"]', form).forEach((el) => { el.disabled = true; });
        form.insertAdjacentHTML('afterbegin', `<p class="hint">This booking is "${esc(statusLabel(sm.code))}", so no approval decision is needed.${sm.code === 'approved' ? ' Use the link below if you need to close it.' : ''}</p>`);
        if (['approved', 'payment_submitted'].includes(sm.code)) { /* the Close link stays enabled */ } else if (closeLink) closeLink.remove();
        }
        onSubmit(form, () => {
        const decision = sel.value; const remarks = cleanMulti(field(form, 2).value, 600);
        const out = run((tx) => {
            const bk = findBooking(tx, sm.ref);
            if (decision === 'approve') return { n: approveBooking(tx, bk, { remarks }), kind: 'approve' };
            if (decision === 'close') { if (remarks.length < 3) fail('Enter the reason for closing; the customer will see it.'); return { n: closeBooking(tx, bk, remarks, ''), kind: 'close' }; }
            if (remarks.length < 3) fail('Describe what the customer needs to correct.');
            if (normStatus(bk.status) !== 'pending') fail('Only pending requests can be sent back for correction.');
            appendRemark(bk, `Correction requested - ${remarks}`); bk.handled_by = me().staff_id; bk.updated_at = nowIso(); tx.dirty(K.BOOKINGS);
            audit(tx, 'Requested correction', { booking: bk, details: remarks });
            return { n: notify(tx, bk, 'correction_requested', { remarks }), kind: 'correction' };
        });
        if (out.kind === 'approve') go('A206booking_approved_staff.html' + refQ(sm.ref));
        else { flash(out.kind === 'close' ? `Booking ${sm.ref} was closed. ${noticeText(out.n)}` : `Correction request sent for ${sm.ref}. ${noticeText(out.n)}`); go('A201bookings_list.html'); }
        });
    }

    function pageCloseBooking() {
        const t = peek(); const b = bookingByQuery(t);
        if (!b) return missing('That booking could not be found. Open it from the bookings list.', 'A201bookings_list.html');
        const sm = summarize(t, b);
        replacePlaceholders({ '[reference id]': ' ' + sm.ref });
        const back = $('a[href="A202review_booking.html"]'); if (back) back.href = (sm.is_custom && sm.code === 'pending' ? 'A405review_custom_request.html' : 'A202review_booking.html') + refQ(sm.ref);
        const form = $('form.demo-form');
        if (!['pending', 'approved', 'payment_submitted'].includes(sm.code)) { $$('input, textarea, button[type="submit"]', form).forEach((el) => { el.disabled = true; }); announce(`This booking is "${statusLabel(sm.code)}" and can no longer be closed.`, true); }
        onSubmit(form, () => {
        const reason = clean(field(form, 1).value, 200); const remarks = cleanMulti(field(form, 2).value, 600);
        if (reason.length < 3 || remarks.length < 3) fail('Enter both the closure reason and the remarks for the customer.');
        const n = run((tx) => closeBooking(tx, findBooking(tx, sm.ref), reason, remarks));
        flash(`Booking ${sm.ref} was closed. ${noticeText(n)}`); go('A201bookings_list.html');
        });
    }

    function pageApproved() {
        const t = peek(); const b = bookingByQuery(t);
        if (!b) return missing('That booking could not be found.', 'A201bookings_list.html');
        const sm = summarize(t, b);
        setPill($('.status-pill'), sm.code); replacePlaceholders({ '[reference id]': sm.ref });
        const last = t.all(K.NOTICES).filter((n) => num(n.booking_id) === num(b.booking_id) && n.template_type === 'booking_approved');
        const ps = $$('main .content-card p');
        if (ps[0]) ps[0].textContent = last.length ? `Customer notice: ${[...new Set(last.slice(-2).map((n) => n.channel.toUpperCase()))].join(' / ')} recorded (${last.slice(-1)[0].status}).` : 'Customer notice: none recorded (email and SMS are off, or the customer has no contact details).';
        if (ps[1]) ps[1].textContent = `Down payment ${peso(b.deposit_amount)} is due by ${fmtDT(b.payment_due_by)} (${settings().payment_deadline_hours}-hour deadline).`;
    }

    function pageCustomRequest() {
        const t = peek(); const b = bookingByQuery(t);
        if (!b) return missing('That request could not be found. Open it from the bookings list.', 'A201bookings_list.html');
        const sm = summarize(t, b); fillHeader(sm); fillSummary(t, sm);
        const req = $$('main .content-card p').find((p) => /Customer-provided/.test(p.textContent));
        if (req) req.textContent = [b.remarks, routeOf(sm.items), `${sm.pax} traveler(s)`].filter(Boolean).join(' | ');
        const form = $('form.demo-form'); $$('a[href="A203close_booking_request.html"]').forEach((a) => { a.href = 'A203close_booking_request.html' + refQ(sm.ref); });
        if (num(b.total_amount) > 0) field(form, 1).value = num(b.total_amount);
        const dsel = field(form, 2); const cur = String(num(sm.items[0] && sm.items[0].deposit_percent) || 30) + '%';
        const o = [...dsel.options].find((x) => x.text === cur); if (o) dsel.value = o.value;
        availabilityHint(t, sm, $('.form-actions', form));
        if (sm.code !== 'pending') { $$('input, select, textarea, button[type="submit"]', form).forEach((el) => { el.disabled = true; }); form.insertAdjacentHTML('afterbegin', `<p class="hint">This request is "${esc(statusLabel(sm.code))}" and can no longer be quoted.</p>`); }
        onSubmit(form, () => {
        const total = num(field(form, 1).value); const pct = parseInt(dsel.value || dsel.selectedOptions[0].text, 10) || 30; const remarks = cleanMulti(field(form, 3).value, 600);
        if (!(total > 0)) fail('Enter an estimated total greater than zero.');
        if (total > 10000000) fail('That total looks too large. Please check it.');
        run((tx) => approveBooking(tx, findBooking(tx, sm.ref), { total, depositPct: pct, remarks: remarks ? `Proposed itinerary: ${remarks}` : '' }));
        go('A206booking_approved_staff.html' + refQ(sm.ref));
        });
    }

    function pageOwnerBookingDetails() {
        const t = peek(); const b = bookingByQuery(t);
        if (!b) return missing('That booking could not be found. Open it from the bookings list.', 'A105all_company_bookings.html');
        const sm = summarize(t, b); fillHeader(sm); fillSummary(t, sm);
        const pays = paymentsOf(t, b); const latest = pays.slice(-1)[0];
        const ps = $$('main .content-card p');
        const payP = ps.find((p) => /Payment status/.test(p.textContent)); if (payP) payP.innerHTML = `<strong>Payment status:</strong> ${latest ? esc(PAY[normPay(latest.payment_status)]) : 'No payment submitted'}`;
        const cp = ps.find((p) => /Created/.test(p.textContent)); if (cp) cp.innerHTML = `<strong>Created:</strong> ${esc(fmtDT(b.created_at))}` + (b.handled_by ? ` · <strong>Handled by:</strong> ${esc(staffName(t, b.handled_by) || '—')}` : '');
        const cancel = $('a[href="A503company_cancellation_refund.html"]'); if (cancel) { cancel.href = 'A503company_cancellation_refund.html' + refQ(sm.ref); if (TERMINAL.includes(sm.code)) cancel.remove(); }
        const audit_ = $('a[href="A106management_audit_trail.html"]'); if (audit_) audit_.href = 'A106management_audit_trail.html' + refQ(sm.ref);
        const chg = changesOf(t, b); const refs = refundsOf(t, b);
        const mgmt = sectionByHeading(/Management actions/i);
        const tbl = (head, rows, empty) => `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="muted">${empty}</td></tr>`}</tbody></table></div>`;
        const html = `<section class="surface content-card"><h2>Payments</h2>${tbl(['Method', 'Amount', 'Status', 'Paid at', 'Verified by'], pays.map((p) => { const m = splitMethod(p.method); return row([esc(m.name + (m.ref ? ' · ' + m.ref : '')), esc(peso(p.amount)), payPill(normPay(p.payment_status)), esc(fmtDT(p.paid_at)), esc(staffName(t, p.verified_by) || '—')]); }), 'No payments yet.')}
        <h2>Change and cancellation requests</h2>${tbl(['Type', 'Requested', 'Status', 'Decided by', 'Fee'], chg.map((c) => row([esc(isCancelType(c.request_type) ? 'Cancellation' : 'Change'), esc(fmtDT(c.requested_at)), changePill(changeStatus(c.status)), esc(staffName(t, c.decided_by) || '—'), esc(num(c.change_fee) ? peso(c.change_fee) : '—')])), 'No requests.')}
        <h2>Refunds</h2>${tbl(['Amount', 'Status', 'Reason'], refs.map((r) => row([esc(peso(r.amount)), esc(r.status), esc(r.reason || '—')])), 'No refunds.')}</section>`;
        if (mgmt) mgmt.insertAdjacentHTML('afterend', html);
    }

    //PAYMENTS VERIFICATION
    function pagePaymentsList() {
        const t = peek(); const sec = $('section.content-card'); const table = $('table', sec);
        const pays = t.all(K.PAYMENTS).map((p) => { const b = t.all(K.BOOKINGS).find((x) => num(x.booking_id) === num(p.booking_id)); return b ? { p, b, c: customerOf(t, b) } : null; }).filter(Boolean)
        .sort((x, y) => (normPay(x.p.payment_status) === 'submitted' ? 0 : 1) - (normPay(y.p.payment_status) === 'submitted' ? 0 : 1) || String(y.p.paid_at).localeCompare(String(x.p.paid_at)));
        const render = (f) => {
        const list = pays.filter(({ p, b, c }) => (!f.status || normPay(p.payment_status) === f.status) && matches(`${b.booking_ref} ${c.full_name} ${p.method}`, f.q));
        fillTable(table, list.map(({ p, b, c }) => { const st = normPay(p.payment_status); const m = splitMethod(p.method);
            return row([esc(b.booking_ref), esc(c.full_name), esc(peso(p.amount)), esc(m.name), payPill(st), btn(`A302verify_payment.html${refQ(b.booking_ref)}&pay=${p.payment_id}`, st === 'submitted' ? 'Verify' : 'View')]); }), pays.length ? 'No payments match the filters.' : 'No payments have been submitted yet.');
        };
        const get = addFilters(sec, [{ id: 'status', label: 'Status', type: 'select', options: [['', 'All'], ['submitted', PAY.submitted], ['verified', PAY.verified], ['not_verified', PAY.not_verified]] }, { id: 'q', label: 'Search', type: 'text', placeholder: 'Reference, customer or method' }], render);
        render(get());
    }

    function paymentContext() {
        const t = peek(); const b = bookingByQuery(t);
        if (!b) return { err: 'That payment could not be found. Open it from the payments list.' };
        const pid = num(queryParam('pay'));
        const mine = paymentsOf(t, b);
        const p = (pid && mine.find((x) => num(x.payment_id) === pid)) || [...mine].reverse().find((x) => normPay(x.payment_status) === 'submitted') || mine.slice(-1)[0];
        if (!p) return { err: 'No payment has been submitted for this booking yet.' };
        return { t, b, p, sm: summarize(t, b) };
    }

    function pageVerifyPayment() {
        const ctx = paymentContext(); if (ctx.err) return missing(ctx.err, 'A301payments_list.html');
        const { t, b, p, sm } = ctx; const st = normPay(p.payment_status); const m = splitMethod(p.method);
        const ref = $('.reference'); if (ref) ref.textContent = sm.ref; setPill($('.status-pill'), sm.code, `${statusLabel(sm.code)} · payment ${PAY[st].toLowerCase()}`);
        const due = num(b.deposit_amount) > 0 ? num(b.deposit_amount) : computeDeposit(sm.items, sm.total);
        const late = b.payment_due_by && p.paid_at && new Date(p.paid_at).getTime() > new Date(b.payment_due_by).getTime();
        const cells = $$('tbody tr td:nth-child(2)');
        const vals = [peso(due), peso(p.amount), m.name, m.ref || '—', `${fmtDT(p.paid_at)} / deadline ${fmtDT(b.payment_due_by)}${late ? ' (paid after the deadline)' : ''}`, p.proof_file ? `Uploaded file: ${p.proof_file} (the customer site stores only the file name, so the image cannot be previewed here)` : 'No proof file recorded'];
        cells.forEach((c, i) => { if (vals[i] != null) c.textContent = vals[i]; });
        const form = $('form.demo-form'); const nv = $('a[href="A303payment_not_verified_staff.html"]', form);
        if (nv) nv.href = `A303payment_not_verified_staff.html${refQ(sm.ref)}&pay=${p.payment_id}`;
        if (st !== 'submitted' || sm.code !== 'payment_submitted') {
        $$('input, button[type="submit"]', form).forEach((el) => { el.disabled = true; }); if (nv) nv.remove();
        form.insertAdjacentHTML('afterbegin', `<p class="hint">This payment is ${esc(PAY[st].toLowerCase())} and the booking is "${esc(statusLabel(sm.code))}", so there is nothing left to verify.</p>`);
        }
        onSubmit(form, () => {
        const n = run((tx) => {
            const bk = findBooking(tx, sm.ref); const pay = tx.all(K.PAYMENTS).find((x) => num(x.payment_id) === num(p.payment_id));
            if (normPay(pay.payment_status) !== 'submitted') fail('This payment was already handled.');
            if (normStatus(bk.status) !== 'payment_submitted') fail(`The booking is "${statusLabel(normStatus(bk.status))}", so it cannot be confirmed.`);
            const need = num(bk.deposit_amount) > 0 ? num(bk.deposit_amount) : computeDeposit(itemsOf(tx, bk), num(bk.total_amount));
            if (verifiedTotal(tx, bk) + num(pay.amount) + 0.009 < need) fail(`The amount paid (${peso(pay.amount)}) is less than the down payment (${peso(need)}). Use "Not verified" so the customer can resubmit.`);
            pay.payment_status = 'verified'; pay.verified_by = me().staff_id; pay.verified_at = nowIso(); tx.dirty(K.PAYMENTS);
            moveBooking(tx, bk, 'confirmed', { handled_by: me().staff_id });
            audit(tx, 'Verified payment and confirmed booking', { booking: bk, details: `${peso(pay.amount)} via ${pay.method}` });
            return notify(tx, bk, 'booking_confirmed', { remarks: '' });
        });
        flash(`Payment verified. Booking ${sm.ref} is now Confirmed. ${noticeText(n)}`); go('A301payments_list.html');
        });
    }

    function pagePaymentNotVerified() {
        const ctx = paymentContext(); if (ctx.err) return missing(ctx.err, 'A301payments_list.html');
        const { b, p, sm } = ctx; const m = splitMethod(p.method);
        const due = num(b.deposit_amount) > 0 ? num(b.deposit_amount) : computeDeposit(sm.items, sm.total);
        replacePlaceholders({ '[reference id]': ' ' + sm.ref });
        const form = $('form.demo-form');
        [[1, peso(due)], [2, peso(p.amount)], [3, m.ref || m.name]].forEach(([n, v]) => { const el = field(form, n); el.value = v; el.readOnly = true; });
        field(form, 4).innerHTML = ['Wrong amount', 'Unreadable proof', 'Reference not found', 'Paid after the deadline', 'Other'].map((x) => `<option>${esc(x)}</option>`).join('');
        const back = $('a[href="A302verify_payment.html"]', form); if (back) back.href = `A302verify_payment.html${refQ(sm.ref)}&pay=${p.payment_id}`;
        if (normPay(p.payment_status) !== 'submitted' || sm.code !== 'payment_submitted') { $$('select, textarea, button[type="submit"]', form).forEach((el) => { el.disabled = true; }); form.insertAdjacentHTML('afterbegin', '<p class="hint">This payment was already handled, so it cannot be marked again.</p>'); }
        onSubmit(form, () => {
        const reason = field(form, 4).value; const outcome = field(form, 5).selectedIndex === 1 ? 'close' : 'resubmit'; const remarks = cleanMulti(field(form, 6).value, 600);
        if (reason === 'Other' && remarks.length < 3) fail('Describe the reason in the remarks.');
        const text = [reason, remarks].filter(Boolean).join('. ');
        const n = run((tx) => {
            const bk = findBooking(tx, sm.ref); const pay = tx.all(K.PAYMENTS).find((x) => num(x.payment_id) === num(p.payment_id));
            if (normPay(pay.payment_status) !== 'submitted' || normStatus(bk.status) !== 'payment_submitted') fail('This payment was already handled.');
            pay.payment_status = 'not_verified'; pay.verified_by = me().staff_id; pay.verified_at = nowIso(); tx.dirty(K.PAYMENTS);
            if (outcome === 'close') {
            appendRemark(bk, `Payment not verified - ${text}`); moveBooking(tx, bk, 'closed', { handled_by: me().staff_id });
            audit(tx, 'Marked payment not verified and closed booking', { booking: bk, details: text });
            return notify(tx, bk, 'booking_closed', { remarks: `Payment could not be verified: ${text}` });
            }
            const due2 = new Date(Date.now() + (num(settings().payment_deadline_hours) || 1) * 3600000).toISOString();
            moveBooking(tx, bk, 'approved', { handled_by: me().staff_id, payment_due_by: due2 });
            audit(tx, 'Marked payment not verified (resubmit)', { booking: bk, details: text });
            return notify(tx, bk, 'payment_not_verified', { remarks: text, deadline: due2 });
        });
        flash(`Payment marked not verified for ${sm.ref}. ${noticeText(n)}`); go('A301payments_list.html');
        });
    }

    function pageExpiredPayments() {
        const t = peek(); const sums = allSummaries(t).filter((s) => isOverdue(s.b)).sort((a, b) => String(a.b.payment_due_by).localeCompare(String(b.b.payment_due_by)));
        const table = $('table'); const sel = sums.find((s) => s.ref === queryParam('ref')) || null;
        fillTable(table, sums.map((s) => row([esc(s.ref), `${esc(s.customer.full_name)} · ${esc(s.services)}`, esc(fmtDT(s.b.payment_due_by)), esc(peso(s.b.deposit_amount)), pill('approved') + ' <span class="hint">past deadline</span>', btn('A305expired_payments.html' + refQ(s.ref), 'Select')])), 'No approved bookings are past their payment deadline.');
        const panel = sectionByHeading(/Selected booking/i); const form = $('form.demo-form');
        const ps = $$('p', panel);
        const setP = (i, label, v) => { if (ps[i]) ps[i].innerHTML = `<strong>${label}</strong> ${esc(v)}`; };
        setP(0, 'Reference:', sel ? sel.ref : 'Select a booking from the table'); setP(1, 'Approved at:', sel ? fmtDT(sel.b.approved_at) : '—'); setP(2, 'Deadline:', sel ? fmtDT(sel.b.payment_due_by) : '—');
        const dt = field(form, 2); dt.value = toLocalInput(new Date(Date.now() + (num(settings().extension_hours) || 1) * 3600000));
        if (!sel) { $$('select, input, textarea, button[type="submit"]', form).forEach((el) => { el.disabled = true; }); return; }
        onSubmit(form, () => {
        const extend = field(form, 1).selectedIndex === 1; const remarks = cleanMulti(field(form, 3).value, 600);
        const n = run((tx) => {
            const bk = findBooking(tx, sel.ref);
            if (!isOverdue(bk)) fail('This booking is no longer past its deadline.');
            if (extend) {
            const when = new Date(field(form, 2).value); if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) fail('Choose a new deadline that is in the future.');
            bk.payment_due_by = when.toISOString(); bk.updated_at = nowIso(); bk.handled_by = me().staff_id; tx.dirty(K.BOOKINGS);
            if (remarks) appendRemark(bk, `Deadline extended - ${remarks}`);
            audit(tx, 'Extended payment deadline', { booking: bk, details: `New deadline ${fmtDT(bk.payment_due_by)}` });
            return notify(tx, bk, 'booking_approved', { amount: bk.deposit_amount, deadline: bk.payment_due_by, remarks: remarks || 'Your payment deadline was extended.' });
            }
            return closeBooking(tx, bk, 'The down payment was not received before the deadline', remarks, 'expired');
        });
        flash(`${extend ? 'Deadline extended' : 'Booking closed as expired'} for ${sel.ref}. ${noticeText(n)}`); go('A305expired_payments.html');
        });
    }

    //CHANGE AND CANCELLATION REQUESTS
    const bookingOfChange = (t, c) => t.all(K.BOOKINGS).find((b) => num(b.booking_id) === num(c.booking_id));
    const guessDate = (text) => (String(text || '').match(/\b(\d{4}-\d{2}-\d{2})\b/) || [])[1] || '';
    const feeRange = () => { const s = settings(); const lo = Math.max(Math.round(num(s.change_fee_min)) || 5, 0); const hi = Math.max(Math.round(num(s.change_fee_max)) || 10, lo); return [lo, hi]; };

    /**
     * Decide a request. decision: 'approve' | 'reject'. Cancellation approval cancels the booking; change approval updates
     * totals (and the date if given). Fee = pct% of the current total; amount due = fee + any price increase.
     */
    function decideChange(t, changeId, { decision, pct, diff, remarks, newDate }) {
        const c = t.all(K.CHANGES).find((x) => num(x.change_id) === num(changeId)); if (!c) fail('That request could not be found.');
        if (changeStatus(c.status) !== 'pending') fail('This request has already been decided.');
        const b = bookingOfChange(t, c); if (!b) fail('The booking for this request no longer exists.');
        const cancel = isCancelType(c.request_type); const base = c.details;
        const withRemarks = [base, remarks ? `Staff remarks: ${remarks}` : ''].filter(Boolean).join(' || ');
        const sid = me().staff_id;
        if (decision === 'reject') {
        if (String(remarks || '').length < 3) fail('Enter the reason for rejecting; the customer will see it.');
        Object.assign(c, { status: 'rejected', decided_by: sid, decided_at: nowIso(), details: withRemarks }); t.dirty(K.CHANGES);
        audit(t, cancel ? 'Rejected cancellation request' : 'Rejected change request', { booking: b, details: remarks });
        return { n: notify(t, b, 'change_decision', { status: 'not approved', amount: 0, remarks }), status: 'rejected', due: 0 };
        }
        const from = normStatus(b.status);
        if (TERMINAL.includes(from)) fail(`The booking is already "${statusLabel(from)}", so this request cannot be approved.`);
        if (cancel) {
        appendRemark(b, `Cancellation approved${remarks ? ' - ' + remarks : ''}`);
        moveBooking(t, b, 'cancelled', { handled_by: sid });
        Object.assign(c, { status: 'approved', decided_by: sid, decided_at: nowIso(), change_fee_percent: 0, change_fee: 0, price_difference: 0, details: withRemarks }); t.dirty(K.CHANGES);
        audit(t, 'Approved cancellation request', { booking: b, details: remarks || (from === 'confirmed' ? 'Confirmed down payment is non-refundable under standard policy' : '') });
        return { n: notify(t, b, 'change_decision', { status: 'approved (booking cancelled)', amount: 0, remarks }), status: 'approved', due: 0 };
        }
        const [lo, hi] = feeRange();
        if (!Number.isFinite(pct) || pct < lo || pct > hi) fail(`The change fee must be between ${lo}% and ${hi}%.`);
        if (!Number.isFinite(diff)) fail('Enter a valid price difference.');
        const oldTotal = num(b.total_amount); const fee = r2(oldTotal * pct / 100); const newTotal = r2(oldTotal + diff);
        if (newTotal < 0) fail('The price difference would make the total negative.');
        const rawItems = t.all(K.BOOKING_ITEMS).filter((i) => num(i.booking_id) === num(b.booking_id));
        const holding = RESERVED.includes(from);
        if (newDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || daysUntil(newDate) == null || daysUntil(newDate) < 1) fail('The new travel date must be from tomorrow onward.');
        if (holding) releaseSlots(t, b);
        rawItems.forEach((i) => { i.service_date = newDate; }); t.dirty(K.BOOKING_ITEMS);
        const block = blockers(checkAvailability(t, itemsOf(t, b))); if (block.length) fail(blockText(block).replace('Cannot approve', 'Cannot apply'));
        if (holding) reserveSlots(t, b);
        }
        if (diff !== 0 && rawItems[0]) { rawItems[0].subtotal = r2(Math.max(num(rawItems[0].subtotal) + diff, 0)); t.dirty(K.BOOKING_ITEMS); }
        b.total_amount = newTotal;
        if (from !== 'confirmed') b.deposit_amount = computeDeposit(itemsOf(t, b), newTotal); // after confirmation the down payment is already paid
        appendRemark(b, `Change approved${remarks ? ' - ' + remarks : ''}`); b.handled_by = sid; b.updated_at = nowIso(); t.dirty(K.BOOKINGS);
        Object.assign(c, { status: 'approved', decided_by: sid, decided_at: nowIso(), change_fee_percent: pct, change_fee: fee, price_difference: r2(diff), details: withRemarks }); t.dirty(K.CHANGES);
        const due = r2(fee + Math.max(diff, 0));
        audit(t, 'Approved change request', { booking: b, details: `Fee ${pct}% = ${peso(fee)}, price difference ${peso(diff)}, new total ${peso(newTotal)}${newDate ? ', new date ' + fmtDate(newDate) : ''}` });
        return { n: notify(t, b, 'change_decision', { status: 'approved', amount: due, remarks }), status: 'approved', due };
    }

    function pageChangeList() {
        const t = peek(); const sec = $('section.content-card'); const table = $('table', sec);
        const list = t.all(K.CHANGES).map((c) => { const b = bookingOfChange(t, c); return b ? { c, b, cu: customerOf(t, b), st: changeStatus(c.status) } : null; }).filter(Boolean)
        .sort((a, b) => (a.st === 'pending' ? 0 : 1) - (b.st === 'pending' ? 0 : 1) || (a.st === 'pending' ? String(a.c.requested_at).localeCompare(String(b.c.requested_at)) : String(b.c.requested_at).localeCompare(String(a.c.requested_at))));
        const render = (f) => fillTable(table, list.filter((x) => (!f.status || x.st === f.status) && matches(`${x.b.booking_ref} ${x.cu.full_name}`, f.q)).map((x) =>
        row([esc(x.b.booking_ref), esc(x.cu.full_name), esc(isCancelType(x.c.request_type) ? 'Cancellation' : 'Change'), esc(fmtDT(x.c.requested_at)), changePill(x.st), btn('A402review_change_request.html?id=' + x.c.change_id, x.st === 'pending' ? 'Review' : 'View')])), list.length ? 'No requests match the filters.' : 'No change or cancellation requests yet.');
        const get = addFilters(sec, [{ id: 'status', label: 'Status', type: 'select', options: [['', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']] }, { id: 'q', label: 'Search', type: 'text', placeholder: 'Reference or customer' }], render);
        render(get());
    }

    function pageReviewChange() {
        const t = peek(); const c = t.all(K.CHANGES).find((x) => num(x.change_id) === num(queryParam('id')));
        const b = c && bookingOfChange(t, c);
        if (!b) return missing('That request could not be found. Open it from the change requests list.', 'A401change_requests_list.html');
        const sm = summarize(t, b); const cancel = isCancelType(c.request_type); const st = changeStatus(c.status);
        const ref = $('.reference'); if (ref) ref.textContent = sm.ref; setPill($('.status-pill'), sm.code, `Booking: ${statusLabel(sm.code)}`);
        const ps = $$('main .content-card p');
        const setStrong = (re, v) => { const p = ps.find((x) => re.test(x.textContent)); if (p) p.innerHTML = `<strong>${p.querySelector('strong').textContent}</strong> ${esc(v)}`; };
        setStrong(/Request type/, cancel ? 'Cancellation' : 'Change request'); setStrong(/Requested at/, fmtDT(c.requested_at)); setStrong(/Customer request/, c.details || '—');
        const guess = guessDate(c.details);
        const body = $$('tbody tr'); const cur = [fmtDate(sm.travel_date), sm.services, routeOf(sm.items)]; const req = [guess ? fmtDate(guess) : cancel ? 'Cancel booking' : 'See customer request', 'See customer request', 'See customer request'];
        body.forEach((tr, i) => { const td = tr.querySelectorAll('td'); if (td[1]) td[1].textContent = cur[i]; if (td[2]) td[2].textContent = req[i]; });
        const form = $('form.demo-form'); const dec = field(form, 1); const rate = field(form, 2); const feeEl = field(form, 3); const diffEl = field(form, 4); const totEl = field(form, 5);
        const [lo, hi] = feeRange();
        rate.innerHTML = Array.from({ length: hi - lo + 1 }, (_, i) => `<option value="${lo + i}">${lo + i}%</option>`).join('');
        dec.innerHTML = '<option value="approve">Approve</option><option value="reject">Reject</option>';
        [feeEl, totEl].forEach((el) => { el.readOnly = true; }); diffEl.value = c.price_difference != null && num(c.price_difference) ? num(c.price_difference) : 0;
        const oldTotal = num(b.total_amount);
        const dateRow = document.createElement('div'); dateRow.style.display = 'contents';
        dateRow.innerHTML = `<label for="field-newdate">New travel date (optional)</label><input id="field-newdate" type="date" value="${esc(guess && daysUntil(guess) >= 1 ? guess : '')}" min="${addDaysStr(1)}">`;
        if (!cancel) field(form, 6).previousElementSibling.insertAdjacentElement('beforebegin', dateRow);
        const recalc = () => { feeEl.value = r2(oldTotal * num(rate.value) / 100); totEl.value = r2(oldTotal + num(diffEl.value)); };
        recalc(); rate.addEventListener('change', recalc); diffEl.addEventListener('input', recalc);
        const fixed = () => { const off = cancel || dec.value === 'reject'; [rate, diffEl].forEach((el) => { el.disabled = off; }); const nd = $('#field-newdate'); if (nd) nd.disabled = off; };
        dec.addEventListener('change', fixed); fixed();
        if (cancel) form.insertAdjacentHTML('afterbegin', `<p class="hint">Cancellation request. Standard policy: a confirmed down payment is non-refundable. For a refund, use Company cancellation &amp; refund instead.</p>`);
        if (st !== 'pending') { $$('input, select, textarea, button[type="submit"]', form).forEach((el) => { el.disabled = true; }); form.insertAdjacentHTML('afterbegin', `<p class="hint">This request was already ${esc(st)}.</p>`); const rj = $('a[href="A403change_decision_saved.html"]', form); if (rj) rj.remove(); }
        else if (TERMINAL.includes(sm.code)) form.insertAdjacentHTML('afterbegin', `<p class="hint">The booking is "${esc(statusLabel(sm.code))}", so it can only be rejected.</p>`);
        const reject = $('a[href="A403change_decision_saved.html"]', form);
        if (reject) onClick('a[href="A403change_decision_saved.html"]', () => { dec.value = 'reject'; fixed(); form.requestSubmit(); });
        onSubmit(form, () => {
        const nd = $('#field-newdate');
        const out = run((tx) => decideChange(tx, c.change_id, { decision: dec.value, pct: num(rate.value), diff: num(diffEl.value), remarks: cleanMulti(field(form, 6).value, 600), newDate: nd && !nd.disabled ? nd.value : '' }));
        flash(`Request ${out.status}. ${noticeText(out.n)}`); go('A403change_decision_saved.html?id=' + c.change_id);
        });
    }

    function pageChangeSaved() {
        const t = peek(); const c = t.all(K.CHANGES).find((x) => num(x.change_id) === num(queryParam('id'))); const b = c && bookingOfChange(t, c);
        if (!b) return missing('That decision could not be found.', 'A401change_requests_list.html');
        const st = changeStatus(c.status); setPill($('.status-pill'), st === 'approved' ? 'approved' : 'closed', st[0].toUpperCase() + st.slice(1));
        replacePlaceholders({ '[reference id]': b.booking_ref });
        const v = $('a[href="A201bookings_list.html"]'); if (v) { v.href = 'A202review_booking.html' + refQ(b.booking_ref); }
        showFlash();
    }

    function pageChangeConfirmed() {
        const t = peek(); const ref = queryParam('ref'); const b = ref && findBooking(t, ref);
        if (!b) return missing('Open this page from a confirmed booking in the bookings list.', 'A201bookings_list.html');
        const sm = summarize(t, b);
        const pend = changesOf(t, b).filter((c) => changeStatus(c.status) === 'pending' && !isCancelType(c.request_type)).slice(-1)[0] || null;
        replacePlaceholders({ '[reference id]': sm.ref }); setPill($('.status-pill'), sm.code);
        const guess = pend ? guessDate(pend.details) : '';
        $$('tbody tr').forEach((tr, i) => { const td = tr.querySelectorAll('td'); if (td[1]) td[1].textContent = [fmtDate(sm.travel_date), sm.services, routeOf(sm.items)][i]; if (td[2]) td[2].textContent = [guess ? fmtDate(guess) : 'See request', 'See request', 'See request'][i]; });
        const form = $('form.demo-form'); const [lo, hi] = feeRange(); const oldTotal = sm.total; const paid = verifiedTotal(t, b);
        const days = daysUntil(sm.travel_date);
        const f = (n) => field(form, n); f(1).value = days == null ? '—' : `${days} day(s)`; f(2).value = peso(paid);
        [f(1), f(2), f(3), f(5)].forEach((el) => { el.readOnly = true; }); f(4).type = 'number'; f(4).value = 0; f(4).step = '0.01';
        f(3).insertAdjacentHTML('beforebegin', `<label for="field-rate">Change fee rate</label><select id="field-rate">${Array.from({ length: hi - lo + 1 }, (_, i) => `<option value="${lo + i}">${lo + i}%</option>`).join('')}</select>`);
        const rate = $('#field-rate');
        const recalc = () => { const fee = r2(oldTotal * num(rate.value) / 100); f(3).value = peso(fee); f(5).value = peso(fee + Math.max(num(f(4).value), 0)); };
        recalc(); rate.addEventListener('change', recalc); f(4).addEventListener('input', recalc);
        if (!pend) form.insertAdjacentHTML('afterbegin', '<p class="hint">There is no pending change request from the customer for this booking. Applying will record a staff-initiated change; describe it in the remarks.</p>');
        if (sm.code !== 'confirmed') { $$('input, select, textarea, button[type="submit"]', form).forEach((el) => { el.disabled = true; }); form.insertAdjacentHTML('afterbegin', `<p class="hint">Only confirmed bookings are changed here. This one is "${esc(statusLabel(sm.code))}".</p>`); }
        onSubmit(form, () => {
        const remarks = cleanMulti(f(6).value, 600);
        if (!pend && remarks.length < 5) fail('Describe the change in the remarks (at least 5 characters).');
        const out = run((tx) => {
            let id = pend && pend.change_id;
            if (!id) { const row_ = tx.insert(K.CHANGES, 'change_id', { booking_id: b.booking_id, decided_by: null, request_type: 'change', details: `Recorded by staff: ${remarks}`, change_fee_percent: 0, change_fee: 0, price_difference: 0, status: 'pending', requested_at: nowIso(), decided_at: null }); id = row_.change_id; }
            return decideChange(tx, id, { decision: 'approve', pct: num(rate.value), diff: num(f(4).value), remarks, newDate: guess && daysUntil(guess) >= 1 ? guess : '' });
        });
        flash(`Change applied to ${sm.ref}. Amount due from the customer: ${peso(out.due)}. ${noticeText(out.n)}`); go('A401change_requests_list.html');
        });
    }
})();
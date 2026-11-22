-- =====================================================================
-- schema_additions.sql   (run AFTER create_table.sql + joins_constraints.sql;  `npm run setup-db` in /server does all three)
--
-- The physical schema (8 tables) covers bookings, payments, changes,
-- services and staff. The admin pages also need data the schema has no
-- place for. Everything below is ADDITIVE: no existing column is removed
-- or renamed, and no existing table is dropped.
--
--   PART A  new tables    -> needed by page(s)
--   PART B  new columns   -> small additions to two existing tables
--   PART C  default rows  -> settings + notification templates
--
-- Run this file ONCE. (Part B uses ALTER TABLE, which MySQL will refuse
-- to repeat; the CREATE TABLE / INSERT parts are safe to re-run.)
-- =====================================================================
USE bearcat_travels;

-- ---------------------------------------------------------------------
-- PART A: new tables
-- ---------------------------------------------------------------------

-- A107 Date availability & capacity  (SRS FR-03, FR-29)
-- One row per service per travel date. If a date has no row, the date is
-- treated as "not managed" and approval is not blocked.
CREATE TABLE IF NOT EXISTS service_availability (
    availability_id INT AUTO_INCREMENT PRIMARY KEY,
    service_id      INT NOT NULL,
    service_date    DATE NOT NULL,
    max_capacity    INT NOT NULL,
    available_slots INT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'available',   -- available | unavailable | fully_booked
    notes           TEXT,
    UNIQUE KEY uq_service_date (service_id, service_date),
    CONSTRAINT fk_avail_service FOREIGN KEY (service_id) REFERENCES service(service_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_avail_capacity CHECK (max_capacity >= 0),
    CONSTRAINT chk_avail_slots    CHECK (available_slots >= 0)
) DEFAULT CHARSET = utf8mb4;

-- A501-A504 Refunds  (SRS Appendix G: refund when the company cancels after payment)
CREATE TABLE IF NOT EXISTS refund (
    refund_id    INT AUTO_INCREMENT PRIMARY KEY,
    booking_id   INT NOT NULL,
    amount       DECIMAL(10,2) NOT NULL,
    method       VARCHAR(50),
    reason       TEXT,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending',        -- pending | approved | paid | rejected
    reference_no VARCHAR(100),
    owner_remarks TEXT,
    requested_by INT NULL,
    decided_by   INT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at   DATETIME NULL,
    paid_at      DATETIME NULL,
    CONSTRAINT fk_refund_booking FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_refund_requested FOREIGN KEY (requested_by) REFERENCES staff(staff_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_refund_decided FOREIGN KEY (decided_by) REFERENCES staff(staff_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT chk_refund_amount CHECK (amount > 0)
) DEFAULT CHARSET = utf8mb4;

-- A106 Audit trail, A108 My recent activity  (SRS NFR-05 Auditability)
-- Append-only. The existing handled_by / verified_by / decided_by columns
-- keep recording the "who"; this table keeps the full history of actions.
CREATE TABLE IF NOT EXISTS audit_log (
    log_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    staff_id   INT NULL,
    action     VARCHAR(80) NOT NULL,
    booking_id INT NULL,
    reference  VARCHAR(100),
    details    TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_audit_staff (staff_id, created_at),
    KEY idx_audit_booking (booking_id),
    CONSTRAINT fk_audit_staff FOREIGN KEY (staff_id) REFERENCES staff(staff_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_audit_booking FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
        ON UPDATE CASCADE ON DELETE SET NULL
) DEFAULT CHARSET = utf8mb4;

-- A902 Outgoing notifications  (SRS FR-13, FR-20, FR-27)
CREATE TABLE IF NOT EXISTS notification_log (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id    INT NULL,
    reference     VARCHAR(100),
    recipient     VARCHAR(150),
    channel       VARCHAR(10) NOT NULL,                        -- email | sms
    template_type VARCHAR(50),
    subject       VARCHAR(200),
    message       TEXT,
    status        VARCHAR(20) NOT NULL DEFAULT 'queued',       -- queued | sent | failed
    error         TEXT,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at       DATETIME NULL,
    KEY idx_notif_booking (booking_id),
    CONSTRAINT fk_notif_booking FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
        ON UPDATE CASCADE ON DELETE SET NULL
) DEFAULT CHARSET = utf8mb4;

-- A904 Notification templates
CREATE TABLE IF NOT EXISTS notification_template (
    template_type VARCHAR(50) PRIMARY KEY,
    subject       VARCHAR(200) NOT NULL,
    body          TEXT NOT NULL,
    updated_by    INT NULL,
    updated_at    DATETIME NULL,
    CONSTRAINT fk_template_staff FOREIGN KEY (updated_by) REFERENCES staff(staff_id)
        ON UPDATE CASCADE ON DELETE SET NULL
) DEFAULT CHARSET = utf8mb4;

-- A903 Business settings, A304 Deposit & change policies  (SRS FR-31, NFR-09)
-- Key/value so management can change rules without changing the program.
CREATE TABLE IF NOT EXISTS system_setting (
    setting_key   VARCHAR(60) PRIMARY KEY,
    setting_value TEXT,
    updated_by    INT NULL,
    updated_at    DATETIME NULL,
    CONSTRAINT fk_setting_staff FOREIGN KEY (updated_by) REFERENCES staff(staff_id)
        ON UPDATE CASCADE ON DELETE SET NULL
) DEFAULT CHARSET = utf8mb4;

-- Staff password reset links (A901 / set_new_password.html)
CREATE TABLE IF NOT EXISTS password_reset (
    reset_id   INT AUTO_INCREMENT PRIMARY KEY,
    email      VARCHAR(100) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used       TINYINT(1) NOT NULL DEFAULT 0,
    KEY idx_reset_email (email)
) DEFAULT CHARSET = utf8mb4;

-- ---------------------------------------------------------------------
-- PART B: small additions to existing tables
-- ---------------------------------------------------------------------

-- A103 My account has a "Contact number" field; staff has no such column.
ALTER TABLE staff ADD COLUMN contact_no VARCHAR(20) NULL;

-- The customer pages send only the proof FILE NAME (not the picture itself), so store it as text.
ALTER TABLE payment MODIFY proof_file VARCHAR(255);

-- ---------------------------------------------------------------------
-- PART C: default rows
-- ---------------------------------------------------------------------
INSERT IGNORE INTO system_setting (setting_key, setting_value) VALUES
    ('business_name',              'Bearcat Travel & Tours'),
    ('business_email',             ''),
    ('business_contact',           ''),
    ('business_address',           'Palawan, Philippines'),
    ('currency',                   'PHP'),
    ('date_format',                'MM/DD/YYYY'),
    ('email_enabled',              '1'),
    ('sms_enabled',                '1'),
    ('deposit_default',            '30'),
    ('payment_deadline_hours',     '1'),
    ('change_fee_min',             '5'),
    ('change_fee_max',             '10'),
    ('cancellation_refund_policy', 'Review case by case'),
    ('late_payment_policy',        'Close booking'),
    ('extension_hours',            '1'),
    ('policy_notes',               '');

INSERT IGNORE INTO notification_template (template_type, subject, body) VALUES
 ('booking_approved',
  'Your booking [Reference] is approved - please pay the down payment',
  'Hello [Customer name],\n\nYour booking [Reference] for [Service] on [Travel date] has been approved.\n\nPlease pay the down payment of [Amount] and upload your proof of payment on or before [Deadline]. If payment is not received in time, the request expires and must be submitted again.\n\n[Remarks]\n\nThank you,\n[Business name]'),
 ('booking_confirmed',
  'Your booking [Reference] is confirmed',
  'Hello [Customer name],\n\nWe have verified your payment. Your booking [Reference] for [Service] on [Travel date] is now Confirmed / Final.\n\n[Remarks]\n\nThank you,\n[Business name]'),
 ('payment_not_verified',
  'We could not verify your payment for [Reference]',
  'Hello [Customer name],\n\nWe could not verify the payment submitted for booking [Reference].\n\nReason: [Remarks]\n\nIf you can still pay, please resubmit your payment and proof on or before [Deadline].\n\n[Business name]'),
 ('change_decision',
  'Update on your change / cancellation request for [Reference]',
  'Hello [Customer name],\n\nYour request for booking [Reference] has been [Status].\n\nAmount to pay (change fee and any price difference): [Amount]\n\nStaff remarks: [Remarks]\n\n[Business name]'),
 ('cancellation_refund',
  'Booking [Reference] cancelled',
  'Hello [Customer name],\n\nBooking [Reference] ([Service], [Travel date]) has been cancelled.\n\nDetails: [Remarks]\n\nRefund amount: [Amount]. We will contact you about the refund.\n\n[Business name]'),
 ('booking_closed',
  'Your booking request [Reference] was closed',
  'Hello [Customer name],\n\nYour booking request [Reference] for [Service] has been closed.\n\nReason: [Remarks]\n\nYou are welcome to submit a new booking request at any time.\n\n[Business name]'),
 ('correction_requested',
  'Please correct your booking request [Reference]',
  'Hello [Customer name],\n\nBefore we can approve booking [Reference], we need you to correct or complete some information.\n\nWhat to fix: [Remarks]\n\nPlease contact us or submit a new request with the corrected details.\n\n[Business name]');

'use strict';
/**
 * Maps the browser's `btt_db_<name>` tables to MySQL tables.
 * Column types: int | dec | str | text | bool | dt (DATETIME) | date (DATE)
 */
const t = (sql, pk, cols) => ({ sql, pk, cols });
const TABLES = {
  customers: t('customer', 'customer_id', { customer_id: 'int', full_name: 'str', email: 'str', contact_no: 'str', created_at: 'dt' }),
  staff: t('staff', 'staff_id', { staff_id: 'int', full_name: 'str', email: 'str', password_hash: 'str', role: 'str', is_active: 'bool', contact_no: 'str' }),
  services: t('service', 'service_id', { service_id: 'int', service_type: 'str', service_name: 'str', description: 'text', base_rate: 'dec', rate_unit: 'str', deposit_percent: 'int', is_available: 'bool' }),
  bookings: t('booking', 'booking_id', { booking_id: 'int', booking_ref: 'str', customer_id: 'int', handled_by: 'int', status: 'str', total_amount: 'dec', deposit_amount: 'dec', payment_due_by: 'dt', remarks: 'text', created_at: 'dt', approved_at: 'dt', updated_at: 'dt' }),
  booking_items: t('booking_item', 'item_id', { item_id: 'int', booking_id: 'int', service_id: 'int', service_date: 'date', pax_qty: 'int', pickup_location: 'str', destination: 'str', unit_rate: 'dec', subtotal: 'dec' }),
  travelers: t('traveler', 'traveler_id', { traveler_id: 'int', booking_id: 'int', full_name: 'str', birthdate: 'date', id_no: 'str' }),
  payments: t('payment', 'payment_id', { payment_id: 'int', booking_id: 'int', verified_by: 'int', amount: 'dec', method: 'str', proof_file: 'str', payment_status: 'str', paid_at: 'dt', verified_at: 'dt' }),
  booking_changes: t('booking_change', 'change_id', { change_id: 'int', booking_id: 'int', decided_by: 'int', request_type: 'str', details: 'text', change_fee_percent: 'dec', change_fee: 'dec', price_difference: 'dec', status: 'str', requested_at: 'dt', decided_at: 'dt' }),
  refunds: t('refund', 'refund_id', { refund_id: 'int', booking_id: 'int', amount: 'dec', method: 'str', reason: 'text', status: 'str', reference_no: 'str', owner_remarks: 'text', requested_by: 'int', decided_by: 'int', created_at: 'dt', decided_at: 'dt', paid_at: 'dt' }),
  audit_log: t('audit_log', 'log_id', { log_id: 'int', staff_id: 'int', action: 'str', booking_id: 'int', reference: 'str', details: 'text', created_at: 'dt' }),
  notifications: t('notification_log', 'notification_id', { notification_id: 'int', booking_id: 'int', reference: 'str', recipient: 'str', channel: 'str', template_type: 'str', subject: 'str', message: 'text', status: 'str', created_at: 'dt' }),
  notification_templates: t('notification_template', 'template_type', { template_type: 'str', subject: 'str', body: 'text', updated_by: 'int', updated_at: 'dt' }),
  settings: t('system_setting', 'setting_key', { setting_key: 'str', setting_value: 'text', updated_by: 'int', updated_at: 'dt' }),
  availability: t('service_availability', 'availability_id', { availability_id: 'int', service_id: 'int', service_date: 'date', max_capacity: 'int', available_slots: 'int', status: 'str', notes: 'text' }),
};
// parents before children (also the order writes are applied in a batch)
const ORDER = ['staff', 'services', 'customers', 'payments', 'bookings', 'booking_items', 'travelers', 'booking_changes', 'refunds', 'availability', 'audit_log', 'notifications', 'notification_templates', 'settings'];
module.exports = { TABLES, ORDER };

'use strict';
// Booking status transitions (SRS NFR-07) - same table the admin portal uses.
const ALLOWED = {
  pending: ['approved', 'closed', 'cancelled'],
  approved: ['payment_submitted', 'expired', 'closed', 'cancelled'],
  payment_submitted: ['confirmed', 'approved', 'closed', 'cancelled'],
  confirmed: ['cancelled'],
  expired: [], closed: [], cancelled: [],
};
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '_');
module.exports = { ALLOWED, norm };

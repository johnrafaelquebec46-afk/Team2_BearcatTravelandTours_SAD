# Bearcat Travel & Tours — Customer Frontend

Static customer-facing website demo built with HTML, one shared stylesheet, and one shared JavaScript file. No staff or owner screens, backend, API, database, or server-side routing are included.

## Terms used

- **User/customer** means the person who uses the website or system.
- **Page** and **section** are interchangeable terms for a screen in this website.

## Customer wireframe screen mapping

Each HTML file below corresponds to the customer screen with the same page number in the supplied 67-screen Bearcat wireframe PDF. Staff and owner screens 31–67 are excluded from this customer-only deliverable.

| PDF screen | HTML file | Screen |
|---:|---|---|
| 1 | index.html | Home |
| 2 | services.html | Travel services |
| 3 | service_details.html | Service details |
| 4 | availability.html | Check travel availability |
| 5 | booking_details.html | Trip and contact details |
| 6 | booking_details_error.html | Trip and contact details — error state |
| 7 | saved_draft.html | Saved draft |
| 8 | traveler_details.html | Traveler information — 2 travelers |
| 9 | traveler_details_three.html | Traveler information — 3 travelers |
| 10 | booking_review.html | Review your booking |
| 11 | booking_success.html | Booking request received |
| 12 | booking_pending.html | Booking pending |
| 13 | track_booking.html | Track your booking |
| 14 | track_not_found.html | Track booking — not found |
| 15 | request_approved.html | Request approved |
| 16 | submit_payment.html | Submit payment |
| 17 | payment_submitted.html | Payment submitted confirmation |
| 18 | payment_proof_received.html | Payment proof received |
| 19 | payment_not_verified.html | Payment not verified / resubmit |
| 20 | payment_deadline_passed.html | Payment deadline passed |
| 21 | booking_closed.html | Request closed |
| 22 | booking_confirmed.html | Booking confirmed |
| 23 | status_timeline.html | Booking status timeline |
| 24 | change_request.html | Request a booking change |
| 25 | change_request_received.html | Change request received |
| 26 | change_approved.html | Change approved |
| 27 | change_not_approved.html | Change request not approved |
| 28 | cancellation_request.html | Request a cancellation |
| 29 | cancellation_result.html | Cancellation result |
| 30 | contact_us.html | Contact us |

Shared files: styles.css and app.js. README.md documents use cases and frontend demo limits.

## Use-case coverage

- UC-01 Submit Booking Request: services through booking pending.
- UC-02 Track Booking Status: tracking page and status scenarios.
- UC-04 Submit Payment: approval instructions through payment submission and proof status.
- UC-06 Request Change / Cancel Booking: request through decision states.
- UC-03, UC-05, UC-07, UC-08, UC-09, and UC-10 belong to personnel/owner workflows and are intentionally omitted from this customer-only build.

## Demo limits and source-rule gaps

The wireframe and use-case materials do not provide rates, so the catalog and estimate use placeholders. The deposit is shown as 30% or 50% as set by the business; the exact choice and amount come from staff approval. The one-hour deadline starts at approval. The materials do not settle the fee calculation base, whether a not-verified payment gets another attempt or a changed deadline, how a request on a confirmed booking is handled, or refund handling after company cancellation. This UI flags those gaps and does not calculate or decide those outcomes.

Trip details let the customer select one-way or round-trip travel, choose the required date(s), and request a flight time for each leg. The PDF does not list airline schedule slots, so requested times use browser time controls. Past travel dates are disabled in the date calendar and rejected by the booking date fields.

Forms use browser validation for demonstration. The demo stores only a generated sample booking reference and sample status in sessionStorage; it does not store names, contact information, traveler ID numbers, or payment details. Payment proof and contact messages are not uploaded or sent. Do not enter real sensitive information.


Motion from the supplied Candyfloss and SweetHavens source PDFs was adapted for customer workflows: page and section entrances, the sliding navigation pill, card/button interactions, focus/error feedback, booking success, status progression, and live-message arrival. Owner charts, shopping wishlist/cart, truck, and other unrelated animations were left out because those components are not part of the Bearcat customer wireframe. All movement respects reduced-motion preferences.

# Bearcat Travel & Tours Booking System

A centralized, web-based booking management system developed for **Exploring Bearcat Travel and Tours Services** (Palawan, managed by **AJ Segovia Ragasa**) by **Team 2** (BSIS, Technological University of the Philippines – Manila) for **Systems Analysis and Design (SAD)**.

The system replaces manual, messaging-based booking workflows (via Viber, Facebook, and direct communication) with a structured cloud-hosted web platform covering customer booking intake, staff review and approval, deposit payment verification, change/cancellation handling, refund processing, and management reporting.

---

## System Architecture & Tech Stack

* **Frontend:** HTML5, CSS3, Vanilla JavaScript (`GitHub Pages`)
* **Backend API & Sync Layer:** Node.js / REST API (`Render`) with synchronous page compatibility (`api_sync.js`) and client-side state/validation (`app.js`, `admin_sript.js`, `config.js`)
* **Database:** Relational MySQL Database (`Railway`) covering core entities (`customer`, `service`, `booking`, `booking_item`, `payment`, `booking_change`, `staff`, `notification_log`)
* **Design Pattern:** Modular monolith with role-based access control (RBAC), automated 1-hour unpaid booking expiration, and audit logging

---

## User Roles & Access Levels

1. **Client / Customer (`Basic Access` — No Account Required):** Submits booking requests, tracks booking progress via unique booking reference + email, uploads deposit payment proof, and requests booking changes or cancellations.
2. **Company Personnel (`Limited Access` — Role-Based Login):** Reviews and approves/closes pending bookings, verifies submitted payment proofs, confirms bookings, and decides on change/cancellation requests.
3. **Management / Owner (`Full Access` — Role-Based Login):** Configures services, rates, availability, and deposit rules; manages staff accounts; oversees refunds, audit trails, and system settings; and exports booking and payment reports.

---

## Use Cases & System Modules (`UC-01` – `UC-10`)

### Customer Portal
* **UC-01 — Submit Booking Request (`services.html`, `availability.html`, `booking_details.html`, `booking_review.html`):** Browse tour packages, educational tours, van rentals, airport/hotel transfers, and airline/ship ticket bookings; check date availability; input trip and traveler details (including minor companion/guardian info); and generate a unique **Booking Reference** (e.g., `BTT-20261121-XXXX`) starting in **Pending** status.
* **UC-02 — Track Booking Status (`booking_tracking.html`):** Track real-time booking status (`Pending`, `Approved`, `Payment Verification`, `Confirmed`, `Expired`, `Cancelled`, `Closed`) using the booking reference and customer email.
* **UC-04 — Submit Payment (`payment_submit.html`):** Submit required down payment (**30% or 50% deposit**) and upload payment proof (`JPG`, `PNG`, `WEBP`, or `PDF` up to 5 MB) within the **1-hour payment deadline** after approval.
* **UC-06 — Request Change / Cancel (`change_request.html`, `cancellation_request.html`):** Submit date, schedule, or package modification requests or booking cancellations.

### Staff & Management Portal (`A101staff_login.html`)
* **UC-10 — Log In (`A101staff_login.html`):** Role-based authentication required before accessing Personnel (`UC-03`, `UC-05`, `UC-07`) or Management (`UC-08`, `UC-09`) workflows.
* **UC-03 — Review & Approve Booking:** Inspect pending requests, verify date capacity, and **Approve** (setting deposit amount and 1-hour payment deadline), **Request Correction**, or **Close** bookings.
* **UC-05 — Verify Payment & Confirm Booking:** Review submitted payment proof and reference details, then mark as **Verified** (confirming the booking) or **Not Verified**.
* **UC-07 — Decide on Change / Cancel Request:** Approve or reject modification/cancellation requests, applying applicable **5%–10% change fees** and price differences or releasing reserved slots.
* **Refund Management (`A501review_release_refunds.html` – `A504refunds_register.html`):** Review pending refunds, record payout references, and maintain the refunds register.
* **UC-08 — Manage Services, Rates & Deposit (`A601manage_services_rates.html`):** Configure service types, base rates, rate units, deposit percentages (30% or 50%), and date capacity/availability.
* **Staff Account Management (`A701manage_staff_accounts.html`):** Create accounts, assign roles (`Company Personnel` or `Management / Owner`), reset passwords, and manage active staff credentials.
* **UC-09 — Generate Reports (`A801export_report_preview.html`):** Generate date-ranged booking and payment reports with CSV/PDF export.
* **Audit Trail & System Settings (`A901forgot_password.html` – `A904notification_templates.html`):** Configure business policies, notification templates, outgoing email/SMS logs, and system audit trails.

---

## Scope & Limitations

* **In Scope:** Seven service categories (tour packages, educational tours, van rentals, airport transfers, hotel accommodation transfers, airline tickets, passenger ship tickets) for Palawan-based operations across mobile and desktop web browsers.
* **Out of Scope:** Direct integration with third-party airline/passenger ship ticketing APIs, integration with existing Employee Attendance and Payroll systems, live SMS/email gateway dispatch (notices are currently logged as `Queued`), and multi-branch operations.

---

## Repository Structure

```text
Team2_BearcatTravelandTours_SAD/
├── index.html                        # Landing page & portal entry
├── services.html                     # Travel services & rates catalog
├── availability.html                 # Date availability & capacity view
├── booking_details.html              # UC-01: Trip & traveler details form
├── booking_review.html               # UC-01: Booking summary & reference generation
├── booking_tracking.html             # UC-02: Reference + email status tracker
├── payment_submit.html               # UC-04: Deposit payment proof upload
├── change_request.html               # UC-06: Customer booking modification form
├── cancellation_request.html         # UC-06: Customer booking cancellation form
├── A101staff_login.html              # UC-10: Role-based Staff & Owner login
├── A501–A504*.html                   # Refund review, release & register pages
├── A601manage_services_rates.html    # UC-08: Services, rates & deposit configuration
├── A701manage_staff_accounts.html    # Staff & Owner account management
├── A801export_report_preview.html    # UC-09: Booking & payment reporting/export
├── A901–A904*.html                   # Password reset, notifications & system settings
├── app.js                            # Customer booking flow, validation & state logic
├── admin_sript.js                    # Staff/Owner portal handlers & role guards
├── api_sync.js                       # Frontend-to-backend API synchronization
└── config.js                         # Environment & API endpoint configuration
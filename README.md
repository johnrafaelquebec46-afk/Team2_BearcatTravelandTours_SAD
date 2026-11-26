<h1 align="center">Bearcat Travel and Tours Booking System</h1>

<p align="center">
  <strong>
    A centralized, web-based travel booking management system for Exploring Bearcat Travel and Tours Services (Palawan) covering customer booking requests, staff approval, deposit payment verification, and owner administration.
  </strong>
</p>

<p align="center">
  <a href="https://johnrafaelquebec46-afk.github.io/Team2_BearcatTravelandTours_SAD/">
    <strong>Live Website</strong>
  </a>
</p>

---

<a id="table-of-contents"></a>

# 📚 Table of Contents

- [About the Project](#about-the-project)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Demo Accounts](#demo-accounts)
- [User Roles & Permissions](#user-roles--permissions)
- [Usage Guide](#usage-guide)
- [API & Data Layer Overview](#api--data-layer-overview)
- [Security](#security)
- [Authors](#authors)
- [License](#license)

---

<a id="about-the-project"></a>

# 📖 About the Project

The **Bearcat Travel and Tours Booking System** is a web-based booking management platform developed for **Exploring Bearcat Travel and Tours Services** (managed by **AJ Segovia Ragasa**, Palawan) as part of our **Systems Analysis and Design (SAD)** project at the **Technological University of the Philippines – Manila**.

The system replaces manual, messaging-based booking workflows (via Viber, Facebook, and direct communication) with a structured digital platform where customers can browse services, submit booking requests, track booking status, upload payment proof, and request changes or cancellations, while personnel and management process bookings and monitor operations.

The platform implements **Role-Based Access Control (RBAC)** with dedicated workflows and permissions for:

- `MANAGEMENT / OWNER`
- `COMPANY PERSONNEL`
- `CLIENT / CUSTOMER`

---

<a id="key-features"></a>

# ✨ Key Features

- Centralized Travel Services & Rates Catalog (Tour Packages, Educational Tours, Van Rentals, Airport/Hotel Transfers, Airline & Passenger Ship Tickets)
- Interactive Date Availability & Capacity Checker
- Reference-Based Customer Booking Request & Status Tracking (`BTT-XXXXXX`)
- Automated 30% / 50% Deposit Calculation & 1-Hour Payment Submission Window
- Payment Proof Upload & Staff Payment Verification Workflow
- Change & Cancellation Request Handling with Automated 5%–10% Fee Calculation
- Refund Review, Release & Refunds Register Management
- Role-Based Access Control (`Management / Owner`, `Company Personnel`, `Client / Customer`)
- Management Reports, Audit Trail & Notification Templates
- Responsive Design (Compatible with both desktop and mobile browsers)

---

<a id="tech-stack"></a>

# 🛠️ Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Backend / Sync Layer | Node.js REST API (`Render`), Synchronous Compatibility Layer (`api_sync.js`) |
| Database / Storage | Relational MySQL (`Railway`) + Client-Side `localStorage` & `sessionStorage` Persistence |
| Authentication | Role-Based Session Authentication (`Management / Owner` & `Company Personnel`) |
| Deployment | GitHub Pages (Frontend), Render (Backend), Railway (Database) |
| Tools | Git, GitHub, Visual Studio Code, Live Server |

---

<a id="project-structure"></a>

# 🗂️ Project Structure

```bash
Team2_BearcatTravelandTours_SAD/
├── index.html                           # Landing page & portal entry
├── services.html                        # Travel services & rates catalog
├── availability.html                    # Date availability & capacity view
├── booking_details.html                 # UC-01: Customer booking request form
├── booking_review.html                  # UC-01: Pre-submission summary & reference generation
├── booking_tracking.html                # UC-02: Reference-based booking status tracker
├── payment_submit.html                  # UC-04: Deposit payment proof upload (30% / 50%)
├── change_request.html                  # UC-06: Customer booking modification form
├── cancellation_request.html            # UC-06: Customer booking cancellation form
├── A101staff_login.html                 # UC-10: Role-based Staff & Owner login
├── A501review_release_refunds.html      # Refund review & release workflow
├── A502refund_recorded.html             # Recorded refund confirmation
├── A503company_cancellation_refund.html # Company-initiated cancellation refund
├── A504refunds_register.html            # Refunds register log
├── A601manage_services_rates.html       # UC-08: Owner services, rates & deposit setup
├── A701manage_staff_accounts.html       # Staff & Owner account management
├── A801export_report_preview.html       # UC-09: Booking & payment reporting/export
├── A901forgot_password.html             # Staff password recovery
├── A902outgoing_notifications.html      # Outgoing email/SMS notification logs
├── A903business_system_settings.html    # Business policies & system rules
├── A904notification_templates.html      # Automated notification templates
├── app.js                               # Customer flow, validation & localStorage schema
├── admin_sript.js                       # Staff/Owner portal handlers & role guards
├── api_sync.js                          # Frontend-to-backend API synchronization
└── config.js                            # Environment & API endpoint configuration
```

> The project follows a modular architecture separating customer-facing booking pages, role-protected staff/owner administrative portals, and a structured data/validation layer.

---

<a id="getting-started"></a>

# 🚀 Getting Started

## Prerequisites

Before running the project locally, make sure the following are installed:

- Visual Studio Code (with **Live Server** extension) or any static HTTP server
- Node.js `18+` (optional, if running the local backend server)
- Git
- Modern Web Browser (Chrome, Edge, Firefox)

---

## Installation

### 1. Clone the Repository

```bash
git clone [https://github.com/johnrafaelquebec46-afk/Team2_BearcatTravelandTours_SAD.git](https://github.com/johnrafaelquebec46-afk/Team2_BearcatTravelandTours_SAD.git)

cd Team2_BearcatTravelandTours_SAD
```

---

### 2. Configure API & Environment (Optional for Full-Stack Mode)

If connecting to the backend API, update `config.js` with your API base URL and create a `.env` file inside `server/` based on `server/.env.example`:

```env
PORT=3000
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_NAME=
JWT_SECRET=
```

> Do not commit real `.env` credentials or secrets to GitHub.

---

### 3. Start the Application Locally

1. Open the `Team2_BearcatTravelandTours_SAD` folder in **Visual Studio Code**.
2. Right-click `index.html` and select **Open with Live Server**.
3. Open in your browser:

```bash
[http://127.0.0.1:5500/index.html](http://127.0.0.1:5500/index.html)
```

---

<a id="demo-accounts"></a>

# 🔑 Demo Accounts

The following accounts and access methods can be used for testing and demonstration purposes:

| Role | Access Method / Email | Password |
| --- | --- | --- |
| CLIENT / CUSTOMER | No login required (use generated `BTT-XXXXXX` Booking Reference) | N/A |
| MANAGEMENT / OWNER | `owner@bearcattravel.ph` | `owner123` |
| COMPANY PERSONNEL | `staff@bearcattravel.ph` | `staff123` |

*(Note: Demo credentials can also be viewed or created directly under **Manage Staff Accounts** in the Owner Portal.)*

---

<a id="user-roles--permissions"></a>

# 👥 User Roles & Permissions

| Feature / Use Case | MANAGEMENT / OWNER | COMPANY PERSONNEL | CLIENT / CUSTOMER |
| --- | :---: | :---: | :---: |
| Submit Booking Request (`UC-01`) | ❌ | ❌ | ✅ |
| Track Booking Status (`UC-02`) | ✅ | ✅ | ✅ |
| Review & Approve Booking (`UC-03`) | ✅ | ✅ | ❌ |
| Submit Deposit Payment (`UC-04`) | ❌ | ❌ | ✅ |
| Verify Payment & Confirm (`UC-05`) | ✅ | ✅ | ❌ |
| Request Change / Cancel (`UC-06`) | ❌ | ❌ | ✅ |
| Decide Change / Cancel (`UC-07`) | ✅ | ✅ | ❌ |
| Manage Services, Rates & Deposit (`UC-08`) | ✅ | ❌ | ❌ |
| Generate Reports (`UC-09`) | ✅ | ❌ | ❌ |
| Role-Based Log In (`UC-10`) | ✅ | ✅ | ❌ |
| Manage Staff Accounts | ✅ | ❌ | ❌ |
| System Settings & Audit Trail | ✅ | ❌ | ❌ |

## Administrative Distinctions

- `MANAGEMENT / OWNER` (`Full Access`) has complete control over services, rates, deposit percentages (30% or 50%), staff accounts, reports, audit logs, and system settings.
- `COMPANY PERSONNEL` (`Limited Access`) handles day-to-day operational workflows including booking approvals, payment verification, change/cancellation decisions, and refund processing.
- `CLIENT / CUSTOMER` (`Basic Access`) accesses self-service booking, status tracking, payment proof submission, and modification/cancellation requests without needing to register an account.

---

<a id="usage-guide"></a>

# 🧭 Usage Guide

## Client / Customer Workflow

1. Browse available offerings on **Services** or check open dates on **Availability**.
2. Fill out the **Booking Request** form and review details on **Booking Review** to receive a unique **Booking Reference** (`Pending` status).
3. Monitor request updates via **Track Booking** using the booking reference.
4. Once `Approved`, submit the 30% or 50% down payment and upload proof on **Submit Payment** within the 1-hour deadline.
5. Submit schedule modifications or cancellations anytime via **Change Request** or **Cancellation Request**.

## Personnel / Owner Workflow

1. Log in through the **Staff Login** portal (`A101staff_login.html`).
2. Review incoming booking requests and approve or close pending bookings (`UC-03`).
3. Verify uploaded customer payment proofs to confirm bookings (`UC-05`).
4. Evaluate customer change/cancellation requests and apply applicable 5%–10% fees (`UC-07`).
5. *(Owner Only)* Configure services and rates (`UC-08`), manage staff accounts, and export booking/payment reports (`UC-09`).

---

<a id="api--data-layer-overview"></a>

# 🔌 API & Data Layer Overview

The system models a relational schema persisted via backend REST endpoints (`api_sync.js`) and client-side `localStorage` (`bearcat_travel_db_v1`) + `sessionStorage`:

| Entity / Module | Description |
| --- | --- |
| `customer` | Client contact details and traveler profiles |
| `service` | Travel packages, rates, deposit rules (30% / 50%), and date capacity |
| `booking` & `booking_item` | Booking references, statuses, schedules, and passenger counts |
| `payment` | Deposit amounts, payment references, proof uploads, and verification status |
| `booking_change` | Modification/cancellation requests, fee calculations, and staff decisions |
| `staff` & `notification_log` | Role-based staff credentials, audit trails, and queued notifications |

---

<a id="security"></a>

# 🛡️ Security

## Security Best Practices

- Never expose `.env` files or database credentials publicly.
- Enforce role-based route guards separating customer pages from Personnel and Owner portals.
- Sanitize and validate all customer and staff form inputs prior to storage.
- Restrict system settings, staff account creation, and report exports to the `MANAGEMENT / OWNER` role.

## Important Notice

> Demo credentials and simulated client-side storage records are intended for academic demonstration purposes and should be replaced with production credentials and HTTPS endpoints prior to live deployment.

---

<a id="authors"></a>

# 👨‍💻 Authors

| Name | Role |
| --- | --- |
| Quebec, John Rafael C. | Scrum Master, Management Modules (`UC-08`, `UC-09`), Audit Trail & Settings |
| Regidor, Arabella Grace | Booking Request (`UC-01`), Booking Approval (`UC-03`), Staff Accounts & Data Layer |
| Tucay, Mary Grace | Booking Change Request (`UC-06`), Change Request Review (`UC-07`) & Booking Approval |
| Sadia | Booking Payment (`UC-04`), Payment Verification (`UC-05`) & Booking Request Result |
| Villanueva | Testing Methodology, Quality Assurance & User Manual |

---

<a id="license"></a>

# 📄 License

This project is currently proprietary and intended for academic and organizational use for **Exploring Bearcat Travel and Tours Services** unless otherwise stated by the project owners.
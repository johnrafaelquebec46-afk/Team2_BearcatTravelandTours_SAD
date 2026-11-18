(() => {
  "use strict";
  const REF_KEY = "bearcatCustomerDemoReference";
  const STATUS_KEY = "bearcatCustomerDemoStatus";
  const PAX_KEY = "bearcatCustomerDemoPax";
  const TRAVELER_COUNT_KEY = "bearcatCustomerDemoTravelerCount";
  const TRIP_DATE_KEY = "bearcatCustomerDemoTripDate";
  const TRIP_TYPE_KEY = "bearcatCustomerDemoTripType";
  const RETURN_DATE_KEY = "bearcatCustomerDemoReturnDate";
  const DEPARTURE_SCHEDULE_KEY = "bearcatCustomerDemoDepartureSchedule";
  const RETURN_SCHEDULE_KEY = "bearcatCustomerDemoReturnSchedule";
  const MINOR_TRAVELER_KEY = "bearcatCustomerDemoMinorTraveler";
  const readRef = () => { try { return sessionStorage.getItem(REF_KEY) || "BTT-DEMO01"; } catch (_) { return "BTT-DEMO01"; } };
  const saveStatus = (value) => { try { sessionStorage.setItem(STATUS_KEY, String(value).toLowerCase()); } catch (_) {} };
  const announce = (text) => { const live = document.getElementById("live-message"); if (live) live.textContent = text; };
  const go = (target) => { window.location.href = target; };
  //ARA
  const DB_KEYS = {
    CUSTOMERS: "btt_db_customers",
    SERVICES: "btt_db_services",
    BOOKINGS: "btt_db_bookings",
    BOOKING_ITEMS: "btt_db_booking_items",
    TRAVELERS: "btt_db_travelers",
    PAYMENTS: "btt_db_payments",
    CHANGES: "btt_db_booking_changes"
  };

  const BearcatIntegrity = {
    sanitize(value, maxLen = 255) {
      return String(value ?? "")
        .replace(/[<>"'`]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLen);
    },
    isValidEmail(email) {
      const clean = this.sanitize(email, 100);
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
    },
    isValidPHContact(phone) {
      const clean = String(phone ?? "").replace(/[\s\-()]/g, "");
      return /^(09|\+639)\d{9}$/.test(clean) && clean.length <= 20;
    },
    isValidIdNumber(idNo) {
      const clean = this.sanitize(idNo, 50);
      return /^[A-Za-z0-9\-]{4,50}$/.test(clean);
    },
    isValidCurrency(amount, allowZero = true) {
      const num = Number(amount);
      if (!Number.isFinite(num)) return false;
      return allowZero ? num >= 0 : num > 0;
    },
    validateProofFile(file) {
      if (!file) return { ok: false, message: "Upload a valid payment proof file." };
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowedTypes.includes(file.type)) {
        return { ok: false, message: "Invalid file format. Only JPG, PNG, WEBP, or PDF are allowed." };
      }
      if (file.size > 5 * 1024 * 1024) {
        return { ok: false, message: "Payment proof exceeds the 5MB maximum file size." };
      }
      return { ok: true };
    },
    generateBookingRef() {
      const datePart = localToday().replace(/-/g, "");
      const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
      return `BTT-${datePart}-${randPart}`;
    }
  };

  const BearcatStore = {
    readTable(key) {
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    },
    writeTable(key, rows) {
      try {
        localStorage.setItem(key, JSON.stringify(rows));
        return true;
      } catch (_) {
        return false;
      }
    },
    seedServices() {
      const existing = this.readTable(DB_KEYS.SERVICES);
      if (existing.length > 0) return existing;
      const defaults = [
        { service_id: 1, service_type: "Tour Package", service_name: "El Nido Island Hopping Tour", base_rate: 2500.00, rate_unit: "per pax", deposit_percent: 30, is_available: true },
        { service_id: 2, service_type: "Van Rental", service_name: "Private Airport / City Van Transfer", base_rate: 3500.00, rate_unit: "per trip", deposit_percent: 50, is_available: true },
        { service_id: 3, service_type: "Custom Itinerary", service_name: "Coron & Palawan Multi-Day Package", base_rate: 6800.00, rate_unit: "per pax", deposit_percent: 30, is_available: true }
      ];
      this.writeTable(DB_KEYS.SERVICES, defaults);
      return defaults;
    },
    findBookingByRef(ref) {
      const target = BearcatIntegrity.sanitize(ref, 50).toUpperCase();
      return this.readTable(DB_KEYS.BOOKINGS).find((b) => String(b.booking_ref).toUpperCase() === target) || null;
    }
  };

  BearcatStore.seedServices();
  window.BearcatClientAPI = { DB_KEYS, BearcatIntegrity, BearcatStore };
  //ARA
  const DRAFT_KEY = "btt_booking_draft_payload";

  const BearcatBookingFlow = {
    readDraft() {
      try {
        return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null") || {};
      } catch (_) {
        return {};
      }
    },
    writeDraft(patch) {
      const current = this.readDraft();
      const updated = { ...current, ...patch, updated_at: new Date().toISOString() };
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    },
    resolveService(serviceLabelOrId) {
      const services = BearcatStore.readTable(DB_KEYS.SERVICES);
      const query = BearcatIntegrity.sanitize(serviceLabelOrId, 100).toLowerCase();
      return (
        services.find(
          (s) =>
            String(s.service_id) === query ||
            s.service_name.toLowerCase().includes(query) ||
            s.service_type.toLowerCase().includes(query)
        ) || services[0]
      );
    },
    commitBookingToDatabase() {
      const draft = this.readDraft();
      const customerData = draft.customer || {};
      const itemData = draft.item || {};
      const travelersData = Array.isArray(draft.travelers) ? draft.travelers : [];

      if (!customerData.full_name || !customerData.email || !itemData.service_date || travelersData.length === 0) {
        return { ok: false, message: "Incomplete booking data. Please review your booking and traveler details." };
      }

      const now = new Date().toISOString();
      const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // 1. Upsert CUSTOMER (enforce unique email constraint)
      const customers = BearcatStore.readTable(DB_KEYS.CUSTOMERS);
      let customer = customers.find((c) => c.email.toLowerCase() === customerData.email.toLowerCase());
      if (customer) {
        customer.full_name = customerData.full_name;
        customer.contact_no = customerData.contact_no;
      } else {
        const nextCustId = customers.reduce((max, c) => Math.max(max, Number(c.customer_id) || 0), 0) + 1;
        customer = {
          customer_id: nextCustId,
          full_name: customerData.full_name,
          email: customerData.email,
          contact_no: customerData.contact_no,
          created_at: now
        };
        customers.push(customer);
      }
      BearcatStore.writeTable(DB_KEYS.CUSTOMERS, customers);

      // 2. Create BOOKING record (aligned with booking table)
      const bookings = BearcatStore.readTable(DB_KEYS.BOOKINGS);
      const nextBookingId = bookings.reduce((max, b) => Math.max(max, Number(b.booking_id) || 0), 0) + 1;
      let bookingRef = BearcatIntegrity.generateBookingRef();
      while (bookings.some((b) => b.booking_ref === bookingRef)) {
        bookingRef = BearcatIntegrity.generateBookingRef();
      }

      const service = this.resolveService(itemData.service_label);
      const paxQty = Math.max(1, Number(itemData.pax_qty) || travelersData.length);
      const unitRate = Number(service.base_rate) || 0;
      const multiplier = itemData.trip_type === "round-trip" ? 2 : 1;
      const subtotal = Number((unitRate * (service.rate_unit === "per pax" ? paxQty : 1) * multiplier).toFixed(2));
      const depositAmount = Number(((subtotal * (Number(service.deposit_percent) || 30)) / 100).toFixed(2));

      const bookingRecord = {
        booking_id: nextBookingId,
        booking_ref: bookingRef,
        customer_id: customer.customer_id,
        handled_by: null,
        status: "pending",
        total_amount: subtotal,
        deposit_amount: depositAmount,
        payment_due_by: dueDate,
        remarks: `${itemData.trip_type || "one-way"} | Dep: ${itemData.departure_schedule || "TBA"}${itemData.return_date ? ` | Ret: ${itemData.return_date} ${itemData.return_schedule || ""}` : ""}`,
        created_at: now,
        approved_at: null,
        updated_at: now
      };
      bookings.push(bookingRecord);
      BearcatStore.writeTable(DB_KEYS.BOOKINGS, bookings);

      // 3. Create BOOKING_ITEM record
      const items = BearcatStore.readTable(DB_KEYS.BOOKING_ITEMS);
      const nextItemId = items.reduce((max, it) => Math.max(max, Number(it.item_id) || 0), 0) + 1;
      items.push({
        item_id: nextItemId,
        booking_id: nextBookingId,
        service_id: service.service_id,
        service_date: itemData.service_date,
        pax_qty: paxQty,
        pickup_location: itemData.pickup_location,
        destination: itemData.destination,
        unit_rate: unitRate,
        subtotal: subtotal
      });
      BearcatStore.writeTable(DB_KEYS.BOOKING_ITEMS, items);

      // 4. Create TRAVELER records
      const travelers = BearcatStore.readTable(DB_KEYS.TRAVELERS);
      let nextTravelerId = travelers.reduce((max, t) => Math.max(max, Number(t.traveler_id) || 0), 0) + 1;
      travelersData.forEach((t) => {
        travelers.push({
          traveler_id: nextTravelerId++,
          booking_id: nextBookingId,
          full_name: t.full_name,
          birthdate: t.birthdate,
          id_no: t.id_no
        });
      });
      BearcatStore.writeTable(DB_KEYS.TRAVELERS, travelers);

      try {
        sessionStorage.setItem(REF_KEY, bookingRef);
        sessionStorage.removeItem(DRAFT_KEY);
      } catch (_) {}

      return { ok: true, booking: bookingRecord };
    }
  };

  // Capture-phase validation & draft capture for Booking Details & Traveler Details
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      // A. Booking Details Form Integrity & Draft Capture
      if (form.id === "booking-details-form" || form.dataset.pageForm === "booking-details") {
        const nameInput = document.getElementById("customer-name");
        const emailInput = document.getElementById("customer-email");
        const phoneInput = document.getElementById("customer-phone");
        const serviceInput = document.getElementById("trip-service");
        const pickupInput = document.getElementById("pickup");
        const destInput = document.getElementById("destination");
        const paxInput = document.getElementById("pax");
        const depDateInput = document.getElementById("trip-date");
        const retDateInput = document.getElementById("return-date");
        const depSchedInput = document.getElementById("departure-schedule");
        const retSchedInput = document.getElementById("return-schedule");
        const tripType = form.querySelector('input[name="tripType"]:checked')?.value || "one-way";

        const fullName = BearcatIntegrity.sanitize(nameInput?.value, 100);
        const email = BearcatIntegrity.sanitize(emailInput?.value, 100);
        const contactNo = BearcatIntegrity.sanitize(phoneInput?.value, 20);
        const pickup = BearcatIntegrity.sanitize(pickupInput?.value, 255);
        const destination = BearcatIntegrity.sanitize(destInput?.value, 255);
        const paxQty = Math.floor(Number(paxInput?.value || 0));

        if (fullName.length < 2) {
          event.preventDefault();
          event.stopImmediatePropagation();
          announce("Enter a valid customer full name (at least 2 characters).");
          nameInput?.focus();
          return;
        }
        if (!BearcatIntegrity.isValidEmail(email)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          announce("Enter a valid email address (e.g., name@email.com).");
          emailInput?.focus();
          return;
        }
        if (!BearcatIntegrity.isValidPHContact(contactNo)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          announce("Enter a valid Philippine mobile number (e.g., 09171234567 or +639171234567).");
          phoneInput?.focus();
          return;
        }
        if (!Number.isInteger(paxQty) || paxQty <= 0) {
          event.preventDefault();
          event.stopImmediatePropagation();
          announce("Number of travelers (pax) must be at least 1.");
          paxInput?.focus();
          return;
        }
        if (!pickup || !destination) {
          event.preventDefault();
          event.stopImmediatePropagation();
          announce("Both pickup location and destination are required.");
          (!pickup ? pickupInput : destInput)?.focus();
          return;
        }

        const serviceLabel = serviceInput?.options?.[serviceInput.selectedIndex]?.text || serviceInput?.value || "Tour Package";
        BearcatBookingFlow.writeDraft({
          customer: { full_name: fullName, age: document.getElementById("customer-age")?.value || "", email, contact_no: contactNo },
          item: {
            service_label: BearcatIntegrity.sanitize(serviceLabel, 100),
            trip_type: tripType,
            service_date: depDateInput?.value || "",
            departure_schedule: depSchedInput?.value || "",
            return_date: tripType === "round-trip" ? retDateInput?.value || "" : "",
            return_schedule: tripType === "round-trip" ? retSchedInput?.value || "" : "",
            pax_qty: paxQty,
            pickup_location: pickup,
            destination: destination
          }
        });
      }

      // B. Traveler Entry Form Integrity & Draft Capture
      if (form.classList.contains("traveler-entry-form")) {
        const cards = [...form.querySelectorAll("[data-traveler-card]")];
        const draft = BearcatBookingFlow.readDraft();
        const expectedPax = Number(draft.item?.pax_qty || sessionStorage.getItem(PAX_KEY) || cards.length);

        if (cards.length !== expectedPax) {
          event.preventDefault();
          event.stopImmediatePropagation();
          announce(`Traveler count mismatch: expected ${expectedPax} traveler(s) based on your booking details.`);
          return;
        }

        const travelerRows = [];
        for (const card of cards) {
          const tName = BearcatIntegrity.sanitize(card.querySelector('input[name$="[name]"]')?.value, 100);
          const tBirth = card.querySelector('input[name$="[birthdate]"]')?.value || "";
          const tIdType = BearcatIntegrity.sanitize(card.querySelector('select[name$="[idType]"]')?.value, 30);
          const tIdNum = BearcatIntegrity.sanitize(card.querySelector('input[name$="[idNumber]"]')?.value, 35);

          if (tName.length < 2 || !tBirth || tBirth > localToday() || !BearcatIntegrity.isValidIdNumber(tIdNum)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            announce("Ensure every traveler has a valid full name, past/current birthdate, and valid ID number.");
            return;
          }

          travelerRows.push({
            full_name: tName,
            birthdate: tBirth,
            id_no: tIdType ? `${tIdType.toUpperCase()}:${tIdNum}` : tIdNum
          });
        }

        BearcatBookingFlow.writeDraft({ travelers: travelerRows });
      }
    },
    true
  );

  // Capture-phase final commit on Booking Review page
  document.addEventListener(
    "click",
    (event) => {
      const submitBtn = event.target.closest("[data-submit-booking]");
      if (!submitBtn) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const result = BearcatBookingFlow.commitBookingToDatabase();
      if (!result.ok) {
        announce(result.message);
        window.alert(result.message);
        return;
      }

      saveStatus("pending");
      go("booking_success.html");
    },
    true
  );

  window.BearcatClientAPI.BearcatBookingFlow = BearcatBookingFlow;

  // Auto-restore saved draft values when navigating back to Booking Details
  if (document.getElementById("booking-details-form") || document.querySelector('[data-page-form="booking-details"]')) {
    const savedDraft = BearcatBookingFlow.readDraft();
    if (savedDraft.customer) {
      const nameEl = document.getElementById("customer-name");
      const ageEl = document.getElementById("customer-age");
      const emailEl = document.getElementById("customer-email");
      const phoneEl = document.getElementById("customer-phone");
      if (nameEl && savedDraft.customer.full_name) nameEl.value = savedDraft.customer.full_name;
      if (ageEl && savedDraft.customer.age) ageEl.value = savedDraft.customer.age;
      if (emailEl && savedDraft.customer.email) emailEl.value = savedDraft.customer.email;
      if (phoneEl && savedDraft.customer.contact_no) phoneEl.value = savedDraft.customer.contact_no;
    }
    if (savedDraft.item) {
      const pickupEl = document.getElementById("pickup");
      const destEl = document.getElementById("destination");
      const paxEl = document.getElementById("pax");
      const serviceEl = document.getElementById("trip-service");
      if (pickupEl && savedDraft.item.pickup_location) pickupEl.value = savedDraft.item.pickup_location;
      if (destEl && savedDraft.item.destination) destEl.value = savedDraft.item.destination;
      if (paxEl && savedDraft.item.pax_qty) paxEl.value = savedDraft.item.pax_qty;
      if (serviceEl && savedDraft.item.service_label) {
        const matchOpt = [...serviceEl.options].find((o) => o.text === savedDraft.item.service_label || o.value === savedDraft.item.service_label);
        if (matchOpt) serviceEl.value = matchOpt.value;
      }
    }
  }
  // Auto-save & auto-restore Traveler Details cards (even when clicking Back)
  const travelerEntryForm = document.querySelector(".traveler-entry-form");
  if (travelerEntryForm) {
    const syncTravelerDraft = () => {
      const cards = [...travelerEntryForm.querySelectorAll("[data-traveler-card]")];
      const rawTravelers = cards.map((card) => {
        const tName = BearcatIntegrity.sanitize(card.querySelector('input[name$="[name]"]')?.value, 100);
        const tBirth = card.querySelector('input[name$="[birthdate]"]')?.value || "";
        const tIdType = BearcatIntegrity.sanitize(card.querySelector('select[name$="[idType]"]')?.value, 30);
        const tIdNum = BearcatIntegrity.sanitize(card.querySelector('input[name$="[idNumber]"]')?.value, 35);
        return {
          full_name: tName,
          birthdate: tBirth,
          id_type: tIdType,
          id_number: tIdNum,
          id_no: tIdType ? `${tIdType.toUpperCase()}:${tIdNum}` : tIdNum
        };
      });
      BearcatBookingFlow.writeDraft({ travelers: rawTravelers });
    };

const restoreTravelerDraft = () => {
      const savedDraft = BearcatBookingFlow.readDraft();
      if (!Array.isArray(savedDraft.travelers) || savedDraft.travelers.length === 0) return;

      const cards = [...travelerEntryForm.querySelectorAll("[data-traveler-card]")];
      savedDraft.travelers.forEach((t, idx) => {
        const card = cards[idx];
        if (!card) return;
        const nameInput = card.querySelector('input[name$="[name]"]');
        const birthInput = card.querySelector('input[name$="[birthdate]"]');
        const idTypeSelect = card.querySelector('select[name$="[idType]"]');
        const idNumInput = card.querySelector('input[name$="[idNumber]"]');

        if (nameInput && t.full_name) nameInput.value = t.full_name;
        if (birthInput && t.birthdate) birthInput.value = t.birthdate;

        // Parse fallback from id_no (e.g. "PASSPORT:123456") if id_type/id_number weren't split
        let savedType = t.id_type || "";
        let savedNum = t.id_number || "";
        if (!savedType && typeof t.id_no === "string" && t.id_no.includes(":")) {
          const [rawType, ...rest] = t.id_no.split(":");
          savedType = rawType;
          savedNum = rest.join(":");
        } else if (!savedNum && t.id_no) {
          savedNum = t.id_no;
        }

        if (idTypeSelect && savedType) {
          const matchOpt = [...idTypeSelect.options].find(
            (o) => o.value.toLowerCase() === savedType.toLowerCase() || o.text.toLowerCase() === savedType.toLowerCase()
          );
          if (matchOpt) {
            idTypeSelect.value = matchOpt.value;
            idTypeSelect.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
        if (idNumInput && savedNum) {
          idNumInput.disabled = false;
          idNumInput.value = savedNum;
        }
      });
    };

    setTimeout(restoreTravelerDraft, 80);
    travelerEntryForm.addEventListener("input", syncTravelerDraft);
    travelerEntryForm.addEventListener("change", syncTravelerDraft);
  }

  // Auto-save & auto-restore Accompanying Guardian modal details
  const guardianModal = document.getElementById("guardian-confirmation");
  if (guardianModal) {
    const syncGuardianDraft = () => {
      const adultSelect = document.getElementById("guardian-adult-traveler");
      const relInputs = [...guardianModal.querySelectorAll('input[type="text"], textarea')];
      const fileInputs = [...guardianModal.querySelectorAll('input[type="file"]')];

      BearcatBookingFlow.writeDraft({
        guardian: {
          adultValue: adultSelect?.value || "",
          adultText: adultSelect?.options?.[adultSelect.selectedIndex]?.text || "",
          relationships: relInputs.map((inp) => BearcatIntegrity.sanitize(inp.value, 150)),
          proofNames: fileInputs.map((inp) => inp.files?.[0]?.name || "")
        }
      });
    };

    const restoreGuardianDraft = () => {
      const saved = BearcatBookingFlow.readDraft().guardian;
      if (!saved) return;

      const adultSelect = document.getElementById("guardian-adult-traveler");
      if (adultSelect && (saved.adultValue || saved.adultText)) {
        const match = [...adultSelect.options].find(
          (o) => (saved.adultValue && o.value === saved.adultValue) || (saved.adultText && o.text === saved.adultText)
        );
        if (match) {
          adultSelect.value = match.value;
          adultSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }

      const relInputs = [...guardianModal.querySelectorAll('input[type="text"], textarea')];
      if (Array.isArray(saved.relationships)) {
        relInputs.forEach((inp, i) => {
          if (saved.relationships[i]) inp.value = saved.relationships[i];
        });
      }

      const fileInputs = [...guardianModal.querySelectorAll('input[type="file"]')];
      if (Array.isArray(saved.proofNames)) {
        fileInputs.forEach((inp, i) => {
          const prevName = saved.proofNames[i];
          if (!prevName) return;
          let note = inp.parentElement?.querySelector(".btt-saved-proof-note");
          if (!note) {
            note = document.createElement("small");
            note.className = "btt-saved-proof-note";
            note.style.display = "block";
            note.style.marginTop = "4px";
            note.style.color = "#4b3869";
            inp.insertAdjacentElement("afterend", note);
          }
          note.textContent = `Previously selected file: ${prevName} (re-select file to confirm upload)`;
        });
      }
    };

    guardianModal.addEventListener("input", syncGuardianDraft);
    guardianModal.addEventListener("change", syncGuardianDraft);
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-next], [data-confirm-guardian], button[type='submit']")) {
        setTimeout(restoreGuardianDraft, 60);
      }
    });
  }

  // ARA
  const BearcatPostBooking = {
    verifyBookingOwnership(ref, email = null) {
      const booking = BearcatStore.findBookingByRef(ref);
      if (!booking) {
        return { ok: false, message: "Booking reference not found. Check your BTT reference code." };
      }
      if (email !== null) {
        const cleanEmail = BearcatIntegrity.sanitize(email, 100).toLowerCase();
        const customers = BearcatStore.readTable(DB_KEYS.CUSTOMERS);
        const owner = customers.find((c) => Number(c.customer_id) === Number(booking.customer_id));
        if (!owner || owner.email.toLowerCase() !== cleanEmail) {
          return { ok: false, message: "Email address does not match the customer record for this booking." };
        }
      }
      return { ok: true, booking };
    },
    recordPayment({ bookingRef, method, amount, paymentRef, file }) {
      const lookup = this.verifyBookingOwnership(bookingRef);
      if (!lookup.ok) return lookup;

      const cleanMethod = BearcatIntegrity.sanitize(method, 50);
      const cleanPayRef = BearcatIntegrity.sanitize(paymentRef, 80);
      const numericAmount = Number(amount);

      if (!cleanMethod || !cleanPayRef || cleanPayRef.length < 4) {
        return { ok: false, message: "Select a payment method and enter a valid payment reference number." };
      }
      if (!BearcatIntegrity.isValidCurrency(numericAmount, false)) {
        return { ok: false, message: "Payment amount must be greater than PHP 0.00." };
      }

      const fileCheck = BearcatIntegrity.validateProofFile(file);
      if (!fileCheck.ok) return fileCheck;

      const payments = BearcatStore.readTable(DB_KEYS.PAYMENTS);
      const nextPaymentId = payments.reduce((max, p) => Math.max(max, Number(p.payment_id) || 0), 0) + 1;
      const now = new Date().toISOString();

      payments.push({
        payment_id: nextPaymentId,
        booking_id: lookup.booking.booking_id,
        verified_by: null,
        amount: Number(numericAmount.toFixed(2)),
        method: `${cleanMethod} (${cleanPayRef})`,
        proof_file: file.name,
        payment_status: "submitted",
        paid_at: now,
        verified_at: null
      });
      BearcatStore.writeTable(DB_KEYS.PAYMENTS, payments);

      const bookings = BearcatStore.readTable(DB_KEYS.BOOKINGS);
      const targetBooking = bookings.find((b) => Number(b.booking_id) === Number(lookup.booking.booking_id));
      if (targetBooking) {
        targetBooking.status = "payment_submitted";
        targetBooking.updated_at = now;
        BearcatStore.writeTable(DB_KEYS.BOOKINGS, bookings);
      }

      try {
        sessionStorage.setItem(REF_KEY, lookup.booking.booking_ref);
      } catch (_) {}
      saveStatus("payment_submitted");

      return { ok: true };
    },
    submitChangeOrCancel({ bookingRef, requestType, details }) {
      const lookup = this.verifyBookingOwnership(bookingRef);
      if (!lookup.ok) return lookup;

      const cleanType = BearcatIntegrity.sanitize(requestType, 50);
      const cleanDetails = BearcatIntegrity.sanitize(details, 1000);
      if (!cleanDetails || cleanDetails.length < 5) {
        return { ok: false, message: "Provide complete details or reason (at least 5 characters) before submitting." };
      }

      const changes = BearcatStore.readTable(DB_KEYS.CHANGES);
      const nextChangeId = changes.reduce((max, ch) => Math.max(max, Number(ch.change_id) || 0), 0) + 1;
      const now = new Date().toISOString();

      changes.push({
        change_id: nextChangeId,
        booking_id: lookup.booking.booking_id,
        decided_by: null,
        request_type: cleanType,
        details: cleanDetails,
        change_fee_percent: 0.0,
        change_fee: 0.0,
        price_difference: 0.0,
        status: "pending",
        requested_at: now,
        decided_at: null
      });
      BearcatStore.writeTable(DB_KEYS.CHANGES, changes);

      try {
        sessionStorage.setItem(REF_KEY, lookup.booking.booking_ref);
      } catch (_) {}

      return { ok: true };
    }
  };



  // Pre-fill active booking reference on post-booking forms if available
  const activeSavedRef = (() => {
    try {
      return sessionStorage.getItem(REF_KEY) || "";
    } catch (_) {
      return "";
    }
  })();
  if (activeSavedRef && activeSavedRef !== "BTT-DEMO01") {
    ["booking-ref", "change-ref", "cancel-ref"].forEach((id) => {
      const field = document.getElementById(id);
      if (field && !field.value) field.value = activeSavedRef;
    });
  }

  // Capture-phase handlers for Tracking, Payment, Change Request & Cancellation
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      // 1. Track Booking Form (real DB lookup with demo fallback)
      if (form.matches("form[data-track-form]")) {
        const refInput = document.getElementById("booking-ref");
        const emailInput = document.getElementById("track-email");
        const refVal = BearcatIntegrity.sanitize(refInput?.value, 50).toUpperCase();
        const emailVal = BearcatIntegrity.sanitize(emailInput?.value, 100);

        if (!BearcatIntegrity.isValidEmail(emailVal)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          announce("Enter a valid email address to verify your booking.");
          emailInput?.focus();
          return;
        }

        const realBooking = BearcatStore.findBookingByRef(refVal);
        if (realBooking) {
          event.preventDefault();
          event.stopImmediatePropagation();

          const verified = BearcatPostBooking.verifyBookingOwnership(refVal, emailVal);
          if (!verified.ok) {
            announce(verified.message);
            window.alert(verified.message);
            return;
          }

          const statusKey = String(realBooking.status || "pending").toLowerCase();
          const routes = {
            pending: "booking_pending.html",
            approved: "request_approved.html",
            payment_submitted: "payment_submitted.html",
            confirmed: "booking_confirmed.html",
            expired: "payment_deadline_passed.html",
            closed: "booking_closed.html",
            cancelled: "cancellation_result.html"
          };

          try {
            sessionStorage.setItem(REF_KEY, realBooking.booking_ref);
          } catch (_) {}
          saveStatus(statusKey);
          go(routes[statusKey] || "booking_pending.html");
          return;
        }
      }

      // 2. Submit Payment Form
      if (document.getElementById("pay-method") && document.getElementById("pay-proof")) {
        event.preventDefault();
        event.stopImmediatePropagation();

        const refInput = document.getElementById("payment-booking-ref") || document.getElementById("booking-ref");
        const targetRef = refInput?.value || readRef();
        const method = document.getElementById("pay-method")?.value;
        const amount = document.getElementById("pay-amount")?.value;
        const payRef = document.getElementById("pay-ref")?.value;
        const proofFile = document.getElementById("pay-proof")?.files?.[0];

        const result = BearcatPostBooking.recordPayment({
          bookingRef: targetRef,
          method,
          amount,
          paymentRef: payRef,
          file: proofFile
        });

        if (!result.ok) {
          announce(result.message);
          window.alert(result.message);
          return;
        }

        go(form.dataset.next || "payment_submitted.html");
        return;
      }

      // 3. Change Request Form
      if (form.id === "change-form") {
        event.preventDefault();
        event.stopImmediatePropagation();

        const refVal = document.getElementById("change-ref")?.value;
        const reqType = document.getElementById("request-type")?.value || "change";
        const changeText = document.getElementById("change-text")?.value || "";
        const preferred = document.getElementById("preferred")?.value || "";

        if (reqType === "cancel") {
          go("cancellation_request.html");
          return;
        }

        const combinedDetails = preferred
          ? `${changeText} | Preferred update: ${preferred}`
          : changeText;

        const result = BearcatPostBooking.submitChangeOrCancel({
          bookingRef: refVal,
          requestType: reqType,
          details: combinedDetails
        });

        if (!result.ok) {
          announce(result.message);
          window.alert(result.message);
          return;
        }

        go("change_request_received.html");
        return;
      }

      // 4. Cancellation Request Form
      if (document.getElementById("cancel-ref") && document.getElementById("cancel-reason")) {
        event.preventDefault();
        event.stopImmediatePropagation();

        const refVal = document.getElementById("cancel-ref")?.value;
        const reasonVal = document.getElementById("cancel-reason")?.value;

        const result = BearcatPostBooking.submitChangeOrCancel({
          bookingRef: refVal,
          requestType: "cancellation",
          details: reasonVal
        });

        if (!result.ok) {
          announce(result.message);
          window.alert(result.message);
          return;
        }

        go(form.dataset.next || "change_request_received.html");
      }
    },
    true
  );

  window.BearcatClientAPI.BearcatPostBooking = BearcatPostBooking;

  document.querySelectorAll(".booking-reference, #booking-reference").forEach((node) => { node.textContent = readRef(); });

  const page = document.body.dataset.page;
  const activeNav = new Map([
    ["index", "Home"], ["services", "Services"], ["service-details", "Services"],
    ["availability", "Booking request"], ["booking-details", "Booking request"],
    ["booking-details-error", "Booking request"], ["saved-draft", "Booking request"],
    ["traveler-details", "Booking request"], ["traveler-details-three", "Booking request"],
    ["booking-review", "Booking request"], ["track-booking", "Track booking"],
    ["track-not-found", "Track booking"], ["booking-pending", "Track booking"],
    ["status-timeline", "Track booking"], ["request-approved", "Track booking"],
    ["submit-payment", "Track booking"], ["payment-submitted", "Track booking"],
    ["payment-proof-received", "Track booking"], ["payment-not-verified", "Track booking"],
    ["payment-deadline-passed", "Track booking"], ["booking-closed", "Track booking"],
    ["booking-confirmed", "Track booking"], ["change-request", "Track booking"],
    ["change-request-received", "Track booking"], ["change-approved", "Track booking"],
    ["change-not-approved", "Track booking"], ["cancellation-request", "Track booking"],
    ["cancellation-result", "Track booking"], ["contact-us", "Track booking"]
  ]);
  document.querySelectorAll("#primary-nav a").forEach((link) => {
    link.removeAttribute("aria-current");
    if (link.textContent.trim() === activeNav.get(page)) link.setAttribute("aria-current", "page");
  });
  const badge = document.querySelector(".portal-badge");
  const badgeText = {
    availability: "STEP 1 OF 3", "booking-details": "STEP 1 OF 3", "booking-details-error": "STEP 1 OF 3",
    "saved-draft": "DRAFT SAVED", "traveler-details": "STEP 2 OF 3", "traveler-details-three": "STEP 2 OF 3",
    "booking-review": "STEP 3 OF 3", "booking-success": "PENDING", "booking-pending": "PENDING",
    "request-approved": "APPROVED", "submit-payment": "1-HOUR DEADLINE", "payment-submitted": "1-HOUR DEADLINE",
    "payment-proof-received": "SUBMITTED", "payment-not-verified": "NOT VERIFIED",
    "payment-deadline-passed": "EXPIRED", "booking-closed": "CLOSED", "booking-confirmed": "CONFIRMED"
  };
  if (badge && !document.body.dataset.role) badge.textContent = badgeText[page] || "CUSTOMER PORTAL";

  const localToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };
  const tripDateField = document.getElementById("trip-date") || document.getElementById("error-date");
  const returnDateField = document.querySelector('[data-return-leg] [data-travel-date]');
  const tripTypeRadios = [...document.querySelectorAll('input[name="tripType"]')];
  const departureScheduleField = document.querySelector('[name="departureSchedule"]');
  const returnScheduleField = document.querySelector('[name="returnSchedule"]');
  const returnLeg = document.querySelector("[data-return-leg]");
  const updateTripType = () => {
    const isRoundTrip = tripTypeRadios.find((radio) => radio.checked)?.value === "round-trip";
    if (returnLeg) returnLeg.hidden = !isRoundTrip;
    if (returnDateField) returnDateField.required = isRoundTrip;
    if (returnScheduleField) returnScheduleField.required = isRoundTrip;
  };
  document.querySelectorAll("[data-travel-date]").forEach((field) => { field.min = localToday(); });
  if (tripDateField) {
    try {
      const savedDeparture = sessionStorage.getItem(TRIP_DATE_KEY) || "";
      tripDateField.value = savedDeparture >= localToday() ? savedDeparture : "";
      if (savedDeparture && savedDeparture < localToday()) sessionStorage.removeItem(TRIP_DATE_KEY);
    } catch (_) {}
  }
  if (returnDateField) {
    try {
      const savedReturn = sessionStorage.getItem(RETURN_DATE_KEY) || "";
      returnDateField.value = savedReturn >= localToday() ? savedReturn : "";
      if (savedReturn && savedReturn < localToday()) sessionStorage.removeItem(RETURN_DATE_KEY);
    } catch (_) {}
  }
  if (tripTypeRadios.length) {
    try {
      const savedType = sessionStorage.getItem(TRIP_TYPE_KEY);
      const radio = tripTypeRadios.find((item) => item.value === savedType);
      if (radio) radio.checked = true;
    } catch (_) {}
    tripTypeRadios.forEach((radio) => radio.addEventListener("change", updateTripType));
    updateTripType();
  }
  try {
    if (departureScheduleField) departureScheduleField.value = sessionStorage.getItem(DEPARTURE_SCHEDULE_KEY) || "";
    if (returnScheduleField) returnScheduleField.value = sessionStorage.getItem(RETURN_SCHEDULE_KEY) || "";
  } catch (_) {}
  if (tripDateField && returnDateField) {
    returnDateField.min = tripDateField.value || localToday();
    tripDateField.addEventListener("change", () => {
      returnDateField.min = tripDateField.value || localToday();
      if (returnDateField.value && returnDateField.value < returnDateField.min) returnDateField.value = "";
    });
  }
  const minorTravelerRadios = [...document.querySelectorAll('input[name="minorTraveler"]')];
  const minorTravelerHint = document.getElementById("minor-traveler-hint");
  const updateMinorTravelerHint = () => {
    const selected = minorTravelerRadios.find((radio) => radio.checked)?.value;
    if (minorTravelerHint) minorTravelerHint.hidden = selected !== "yes";
  };
  if (minorTravelerRadios.length) {
    try {
      const savedChoice = sessionStorage.getItem(MINOR_TRAVELER_KEY);
      const savedRadio = minorTravelerRadios.find((radio) => radio.value === savedChoice);
      if (savedRadio) savedRadio.checked = true;
    } catch (_) {}
    minorTravelerRadios.forEach((radio) => radio.addEventListener("change", updateMinorTravelerHint));
    updateMinorTravelerHint();
  }
  const reviewTripType = document.getElementById("review-trip-type");
  if (reviewTripType) {
    const formatTripDate = (value) => value ? new Intl.DateTimeFormat("en", {month:"short", day:"numeric", year:"numeric"}).format(new Date(`${value}T12:00:00`)) : "—";
    let savedType = "", savedDeparture = "", savedReturn = "", savedDepartureTime = "", savedReturnTime = "";
    try {
      savedType = sessionStorage.getItem(TRIP_TYPE_KEY) || "";
      savedDeparture = sessionStorage.getItem(TRIP_DATE_KEY) || "";
      savedReturn = sessionStorage.getItem(RETURN_DATE_KEY) || "";
      savedDepartureTime = sessionStorage.getItem(DEPARTURE_SCHEDULE_KEY) || "";
      savedReturnTime = sessionStorage.getItem(RETURN_SCHEDULE_KEY) || "";
    } catch (_) {}
    reviewTripType.textContent = savedType === "one-way" ? "One way" : savedType === "round-trip" ? "Round trip" : "—";
    const departureDate = document.getElementById("review-departure-date");
    const departureTime = document.getElementById("review-departure-schedule");
    const returnRow = document.getElementById("review-return-row");
    const returnDate = document.getElementById("review-return-date");
    const returnTime = document.getElementById("review-return-schedule");
    if (departureDate) departureDate.textContent = formatTripDate(savedDeparture);
    if (departureTime) departureTime.textContent = savedDepartureTime || "—";
    if (returnRow) returnRow.hidden = savedType !== "round-trip";
    if (returnDate) returnDate.textContent = formatTripDate(savedReturn);
    if (returnTime) returnTime.textContent = savedReturnTime || "—";
  }

  const savedTravelerCount = (() => {
    try { return sessionStorage.getItem(TRAVELER_COUNT_KEY) || sessionStorage.getItem(PAX_KEY) || ""; }
    catch (_) { return ""; }
  })();
  if (savedTravelerCount) {
    document.querySelectorAll("[data-traveler-count]").forEach((node) => { node.textContent = savedTravelerCount; });
    const summaryList = document.querySelector("[data-traveler-summary-list]");
    if (summaryList) {
      const count = Math.max(1, Number(savedTravelerCount));
      summaryList.replaceChildren(...Array.from({length: count}, (_, i) => {
        const item = document.createElement("p");
        item.textContent = `Traveler ${i + 1} · Name · birthdate · ID`;
        return item;
      }));
    }
  }

  const menu = document.querySelector(".menu-toggle");
  const nav = document.getElementById("primary-nav");
  if (menu && nav) menu.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-go]");
    if (target) go(target.dataset.go);
    const submitBooking = event.target.closest("[data-submit-booking]");
    if (submitBooking) {
      const newRef = "BTT-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      try { sessionStorage.setItem(REF_KEY, newRef); } catch (_) {}
      saveStatus("pending");
      go("booking_success.html");
    }
  });

  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("invalid", () => form.classList.add("is-invalid"), true);
    form.addEventListener("submit", () => { if (!form.checkValidity()) form.classList.add("is-invalid"); }, true);
    form.addEventListener("input", () => { if (form.checkValidity()) form.classList.remove("is-invalid"); });
    form.addEventListener("change", () => { if (form.checkValidity()) form.classList.remove("is-invalid"); });
  });

  let validateDuplicateTravelerIds = () => true;
  let validateTravelerEligibility = () => true;
  document.querySelectorAll("form[data-next]").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const ageField = form.querySelector("[name=age]");
    if (ageField && Number(ageField.value) < 18) {
      window.alert("You must be 18 years old or older to continue the booking.");
      ageField.focus();
      return;
    }
    if (form.classList.contains("traveler-entry-form") && !validateDuplicateTravelerIds(true)) {
      form.querySelector('[data-id-number][aria-invalid="true"]')?.focus();
      return;
    }
    if (form.classList.contains("traveler-entry-form") && !validateTravelerEligibility()) return;
    if (form.id === "availability-form") {
      const selectedDate = document.getElementById("calendar-selected-date");
      if (!selectedDate || !selectedDate.value || selectedDate.value < localToday()) {
        announce("Choose a current or future available travel date before continuing.");
        return;
      }
      try { sessionStorage.setItem(TRIP_DATE_KEY, selectedDate.value); } catch (_) {}
    }
    if (form.id === "booking-details-form" || form.dataset.pageForm === "booking-details") {
      const tripType = form.querySelector('input[name="tripType"]:checked')?.value;
      const departureDate = form.querySelector('[name="departureDate"]')?.value || "";
      const returnDate = form.querySelector('[name="returnDate"]')?.value || "";
      if (!tripType) { announce("Choose one-way or round-trip travel."); return; }
      if (departureDate < localToday() || (tripType === "round-trip" && returnDate < departureDate)) {
        announce(tripType === "round-trip" ? "Choose a return date on or after the departure date." : "Choose a current or future travel date.");
        return;
      }
      try {
        sessionStorage.setItem(TRIP_TYPE_KEY, tripType);
        sessionStorage.setItem(TRIP_DATE_KEY, departureDate);
        sessionStorage.setItem(DEPARTURE_SCHEDULE_KEY, form.querySelector('[name="departureSchedule"]')?.value || "");
        if (tripType === "round-trip") {
          sessionStorage.setItem(RETURN_DATE_KEY, returnDate);
          sessionStorage.setItem(RETURN_SCHEDULE_KEY, form.querySelector('[name="returnSchedule"]')?.value || "");
        } else {
          sessionStorage.removeItem(RETURN_DATE_KEY);
          sessionStorage.removeItem(RETURN_SCHEDULE_KEY);
        }
      } catch (_) {}
    }
    const paxField = form.querySelector("#pax, #error-pax");
    const minorChoice = form.querySelector('input[name="minorTraveler"]:checked');
    if (minorChoice) {
      try { sessionStorage.setItem(MINOR_TRAVELER_KEY, minorChoice.value); } catch (_) {}
    }
    if (paxField) {
      try {
        sessionStorage.setItem(PAX_KEY, String(Math.max(1, Math.floor(Number(paxField.value)))));
        sessionStorage.removeItem(TRAVELER_COUNT_KEY);
      } catch (_) {}
    }
    if (form.classList.contains("traveler-entry-form")) {
      const count = form.querySelectorAll("[data-traveler-card]").length;
      try { sessionStorage.setItem(TRAVELER_COUNT_KEY, String(count)); } catch (_) {}
    }
    go(form.dataset.next);
  }));

  const travelerForm = document.querySelector(".traveler-entry-form");
  if (travelerForm) {
    const list = travelerForm.querySelector("[data-traveler-grid]");
    const addButton = travelerForm.querySelector("[data-add-traveler]");
    const overlay = document.getElementById("traveler-confirmation");
    const dialog = overlay?.querySelector("[role=dialog]");
    const rejectionOverlay = document.getElementById("traveler-rejection-notification");
    const rejectionDialog = rejectionOverlay?.querySelector("[role=alertdialog]");
    const guardianOverlay = document.getElementById("guardian-confirmation");
    const guardianDialog = guardianOverlay?.querySelector("[role=dialog]");
    const guardianAdultSelect = document.getElementById("guardian-adult-traveler");
    const guardianMinorFields = document.getElementById("guardian-minor-fields");
    const savedPax = (() => { try { return Number(sessionStorage.getItem(PAX_KEY)); } catch (_) { return 0; } })();
    const paxLimit = Number.isInteger(savedPax) && savedPax > 0 ? savedPax : Number(travelerForm.dataset.initialCount || 1);
    const savedCount = (() => { try { return Number(sessionStorage.getItem(TRAVELER_COUNT_KEY)); } catch (_) { return 0; } })();

    const cardMarkup = (index) => `<fieldset class="traveler-card" data-traveler-card="${index}">
      <legend>Traveler ${index}</legend>
      <label for="traveler-${index}-name">Full name as shown on ID</label>
      <input id="traveler-${index}-name" name="traveler[${index}][name]" autocomplete="name" placeholder="Traveler full name" required>
      <div class="inline-fields">
        <div><label for="traveler-${index}-birth">Birthdate</label><input id="traveler-${index}-birth" name="traveler[${index}][birthdate]" type="date" required></div>
        <div><label for="traveler-${index}-id-type">Accepted ID type</label><select id="traveler-${index}-id-type" name="traveler[${index}][idType]" data-id-type required><option value="">Select an ID</option><option value="national-id" data-max-digits="16">PhilSys National ID / PCN — up to 16 digits</option><option value="umid" data-max-digits="12">UMID / CRN — up to 12 digits</option></select></div>
      </div>
      <label for="traveler-${index}-id-number">ID number</label>
      <input id="traveler-${index}-id-number" name="traveler[${index}][idNumber]" data-id-number type="text" inputmode="numeric" autocomplete="off" maxlength="16" pattern="[0-9]*" aria-describedby="traveler-${index}-id-help" placeholder="Select ID type first" required disabled>
      <p id="traveler-${index}-id-help" class="hint id-help">Select an ID type to see the maximum digit count.</p>
    </fieldset>`;

    let duplicateErrorWasShown = false;
    validateDuplicateTravelerIds = (announceError = false) => {
      list.querySelectorAll("[data-id-number]").forEach((input) => {
        input.removeAttribute("aria-invalid");
        input.setAttribute("aria-describedby", input.getAttribute("aria-describedby").split(" ")[0]);
        input.closest(".traveler-card").querySelector("[data-duplicate-error]")?.remove();
      });
      const byNumber = new Map();
      list.querySelectorAll("[data-id-number]").forEach((input) => {
        if (input.disabled || !input.value.trim()) return;
        const number = input.value.replace(/\s+/g, "").toLowerCase();
        if (!byNumber.has(number)) byNumber.set(number, []);
        byNumber.get(number).push(input);
      });

      let hasDuplicates = false;
      byNumber.forEach((inputs) => {
        if (inputs.length < 2) return;
        hasDuplicates = true;
        inputs.forEach((input) => {
          const card = input.closest(".traveler-card");
          const ownNumber = card.dataset.travelerCard;
          const matches = inputs.filter((other) => other !== input).map((other) => `Traveler ${other.closest(".traveler-card").dataset.travelerCard}`);
          const error = document.createElement("p");
          const errorId = `traveler-${ownNumber}-duplicate-error`;
          error.id = errorId;
          error.className = "error-text duplicate-id-error";
          error.dataset.duplicateError = "true";
          error.textContent = `This ID number matches ${matches.join(" and ")}. Each traveler must have a different ID number.`;
          card.querySelector(".id-help").before(error);
          input.setAttribute("aria-invalid", "true");
          input.setAttribute("aria-describedby", `${input.getAttribute("aria-describedby")} ${errorId}`);
        });
      });

      if (hasDuplicates && announceError) announce("Duplicate traveler ID numbers were found. Correct the highlighted entries before continuing.");
      if (!hasDuplicates && duplicateErrorWasShown) announce("Duplicate ID number error cleared.");
      duplicateErrorWasShown = hasDuplicates;
      return !hasDuplicates;
    };

    const configureIdField = (card) => {
      const select = card.querySelector("[data-id-type]");
      const input = card.querySelector("[data-id-number]");
      const hint = card.querySelector(".id-help");
      const applyType = () => {
        const option = select.selectedOptions[0];
        const digits = Number(option?.dataset.maxDigits || 0);
        input.disabled = !digits;
        input.maxLength = digits || 16;
        input.value = input.value.replace(/\D/g, "").slice(0, digits || 16);
        input.placeholder = digits ? `Enter up to ${digits} digits` : "Select ID type first";
        hint.textContent = digits ? `Maximum ${digits} digits for this ID type.` : "Select an ID type to see the maximum digit count.";
      };
      select.addEventListener("change", applyType);
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(0, input.maxLength);
        if (duplicateErrorWasShown) validateDuplicateTravelerIds(false);
      });
      input.addEventListener("blur", () => validateDuplicateTravelerIds(true));
      select.addEventListener("change", () => { if (duplicateErrorWasShown) validateDuplicateTravelerIds(false); });
      applyType();
    };

    const renderTravelers = (count) => {
      list.innerHTML = Array.from({length: count}, (_, i) => cardMarkup(i + 1)).join("");
      list.querySelectorAll("[data-traveler-card]").forEach(configureIdField);
      try { sessionStorage.setItem(TRAVELER_COUNT_KEY, String(count)); } catch (_) {}
    };

    const initialCount = Number.isInteger(savedCount) && savedCount >= 1 ? savedCount : paxLimit;
    renderTravelers(Math.max(1, initialCount));

    let returnFocus = null;
    let rejectionReturnFocus = null;
    let guardianReturnFocus = null;
    let guardianConfirmed = false;
    let guardianSignature = "";
    const ageFromBirthdate = (value) => {
      if (!value) return null;
      const [year, month, day] = value.split("-").map(Number);
      const today = new Date();
      let age = today.getFullYear() - year;
      if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
      return age;
    };
    const travelerAgeGroups = () => {
      const travelers = [...list.querySelectorAll("[data-traveler-card]")].map((card) => ({
        card,
        index: card.dataset.travelerCard,
        name: card.querySelector('[name$="[name]"]').value.trim(),
        birthdate: card.querySelector('[name$="[birthdate]"]').value,
        age: ageFromBirthdate(card.querySelector('[name$="[birthdate]"]').value)
      }));
      return {minors: travelers.filter((traveler) => traveler.age !== null && traveler.age < 18), adults: travelers.filter((traveler) => traveler.age !== null && traveler.age >= 18)};
    };
    const guardianControls = () => guardianOverlay ? [...guardianOverlay.querySelectorAll("[data-guardian-control]")] : [];
    const addGuardianField = (minor) => {
      const card = document.createElement("fieldset");
      card.className = "guardian-minor-card";
      const legend = document.createElement("legend");
      legend.textContent = `Traveler ${minor.index}`;
      card.append(legend);

      const relationId = `guardian-relationship-${minor.index}`;
      const relationLabel = document.createElement("label");
      relationLabel.htmlFor = relationId;
      relationLabel.textContent = `Relationship to Traveler ${minor.index}`;
      const relation = document.createElement("input");
      relation.id = relationId;
      relation.name = `guardian[${minor.index}][relationship]`;
      relation.type = "text";
      relation.required = true;
      relation.disabled = true;
      relation.setAttribute("form", "traveler-entry-form");
      relation.dataset.guardianControl = "true";
      relation.setAttribute("aria-describedby", `guardian-relationship-help-${minor.index}`);
      const relationHint = document.createElement("p");
      relationHint.id = `guardian-relationship-help-${minor.index}`;
      relationHint.className = "hint";
      relationHint.textContent = minor.name ? `Enter how the selected adult is related to ${minor.name}.` : "Enter the adult’s relationship to this traveler.";

      const proofId = `guardian-proof-${minor.index}`;
      const proofLabel = document.createElement("label");
      proofLabel.htmlFor = proofId;
      proofLabel.textContent = `Supporting proof for Traveler ${minor.index}`;
      const proof = document.createElement("input");
      proof.id = proofId;
      proof.name = `guardian[${minor.index}][proof]`;
      proof.type = "file";
      proof.required = true;
      proof.disabled = true;
      proof.setAttribute("form", "traveler-entry-form");
      proof.dataset.guardianControl = "true";
      proof.setAttribute("aria-describedby", `guardian-proof-help-${minor.index}`);
      const proofHint = document.createElement("p");
      proofHint.id = `guardian-proof-help-${minor.index}`;
      proofHint.className = "hint";
      proofHint.textContent = "Choose a file that supports the stated relationship. Staff must verify it.";

      card.append(relationLabel, relation, relationHint, proofLabel, proof, proofHint);
      guardianMinorFields.append(card);
    };
    const prepareGuardianDialog = (minors, adults) => {
      const signature = JSON.stringify({
        minors: minors.map(({index,name,birthdate}) => ({index,name,birthdate})),
        adults: adults.map(({index,name,birthdate}) => ({index,name,birthdate}))
      });
      if (signature !== guardianSignature) {
        guardianAdultSelect.replaceChildren(new Option("Select an adult traveler", ""));
        adults.forEach((adult) => {
          const option = new Option(`Traveler ${adult.index}${adult.name ? ` · ${adult.name}` : ""}`, adult.index);
          guardianAdultSelect.add(option);
        });
        guardianMinorFields.replaceChildren();
        minors.forEach(addGuardianField);
        guardianSignature = signature;
        guardianConfirmed = false;
      }
      guardianControls().forEach((control) => { control.disabled = false; });
    };
    const showModal = (modal, modalDialog, focusReturn) => {
      if (!modal || !modalDialog) return false;
      focusReturn?.blur?.();
      modal.hidden = false;
      document.body.classList.add("confirmation-active");
      modalDialog.focus();
      return true;
    };
    const closeRejection = () => {
      if (!rejectionOverlay) return;
      rejectionOverlay.hidden = true;
      document.body.classList.remove("confirmation-active");
      rejectionReturnFocus?.focus();
    };
    const closeGuardian = () => {
      if (!guardianOverlay) return;
      guardianOverlay.hidden = true;
      guardianControls().forEach((control) => { control.disabled = true; });
      document.body.classList.remove("confirmation-active");
      guardianReturnFocus?.focus();
    };
    validateTravelerEligibility = () => {
      const {minors, adults} = travelerAgeGroups();
      if (minors.length === 0) {
        travelerForm.removeAttribute("data-request-state");
        guardianConfirmed = false;
        return true;
      }
      if (adults.length === 0) {
        travelerForm.dataset.requestState = "rejected";
        announce("Request rejected: an under-18 traveler must be accompanied by an adult traveler aged 18 or older.");
        rejectionReturnFocus = travelerForm.querySelector('[type="submit"]');
        showModal(rejectionOverlay, rejectionDialog, rejectionReturnFocus);
        return false;
      }
      travelerForm.removeAttribute("data-request-state");
      if (guardianConfirmed) return true;
      prepareGuardianDialog(minors, adults);
      announce("Guardian details and supporting proof are required for the under-18 traveler.");
      guardianReturnFocus = travelerForm.querySelector('[type="submit"]');
      showModal(guardianOverlay, guardianDialog, guardianReturnFocus);
      return false;
    };

    const closeConfirm = () => {
      if (!overlay) return;
      overlay.hidden = true;
      document.body.classList.remove("confirmation-active");
      returnFocus?.focus();
    };
    const addTraveler = () => {
      const nextIndex = list.querySelectorAll("[data-traveler-card]").length + 1;
      list.insertAdjacentHTML("beforeend", cardMarkup(nextIndex));
      configureIdField(list.querySelector(`[data-traveler-card="${nextIndex}"]`));
      guardianConfirmed = false;
      try { sessionStorage.setItem(TRAVELER_COUNT_KEY, String(nextIndex)); } catch (_) {}
    };
    const openConfirm = () => {
      if (!overlay || !dialog) { announce("The traveler confirmation screen could not be opened."); return; }
      returnFocus = addButton;
      overlay.hidden = false;
      document.body.classList.add("confirmation-active");
      dialog.focus();
    };

    addButton?.addEventListener("click", () => {
      const currentCount = list.querySelectorAll("[data-traveler-card]").length;
      if (currentCount >= paxLimit) openConfirm(); else addTraveler();
    });
    overlay?.querySelector("[data-cancel-add]")?.addEventListener("click", closeConfirm);
    overlay?.querySelector("[data-confirm-add]")?.addEventListener("click", () => { addTraveler(); closeConfirm(); addButton?.focus(); });
    overlay?.addEventListener("click", (event) => { if (event.target === overlay) closeConfirm(); });
    dialog?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeConfirm(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll("button:not([disabled])")];
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
      if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    });

    travelerForm.addEventListener("change", (event) => {
      if (event.target.matches('[name$="[birthdate]"], [name$="[name]"]')) guardianConfirmed = false;
    });
    rejectionOverlay?.querySelector("[data-close-rejection]")?.addEventListener("click", closeRejection);
    rejectionOverlay?.addEventListener("click", (event) => { if (event.target === rejectionOverlay) closeRejection(); });
    guardianOverlay?.querySelector("[data-cancel-guardian]")?.addEventListener("click", closeGuardian);
    guardianOverlay?.addEventListener("click", (event) => { if (event.target === guardianOverlay) closeGuardian(); });
    guardianOverlay?.querySelector("[data-confirm-guardian]")?.addEventListener("click", () => {
      const controls = guardianControls();
      const invalid = controls.find((control) => !control.checkValidity());
      if (invalid) { invalid.reportValidity(); return; }
      guardianConfirmed = true;
      controls.forEach((control) => { control.disabled = true; });
      closeGuardian();
      travelerForm.requestSubmit();
    });

    const trapFocus = (modalDialog, closeModal) => modalDialog?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeModal(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...modalDialog.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled])")];
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    });
    trapFocus(rejectionDialog, closeRejection);
    trapFocus(guardianDialog, closeGuardian);
  }

  const calendar = document.querySelector(".calendar-days");
  const monthInput = document.getElementById("calendar-month");
  const selectedDateInput = document.getElementById("calendar-selected-date");
  const selectedDateDisplay = document.getElementById("selected-date-display");
  const formatCalendarDate = (iso) => {
    if (!iso) return "Choose a date";
    const date = new Date(`${iso}T12:00:00`);
    return new Intl.DateTimeFormat("en", {month:"short", day:"numeric", year:"numeric"}).format(date);
  };
  const renderCalendar = (monthValue, initialSelected = "") => {
    if (!calendar || !monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) return;
    const [year, month] = monthValue.split("-").map(Number);
    const today = localToday();
    const firstOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    const fullDays = new Set([5, 12, 13, 20, 27]);
    calendar.replaceChildren();
    for (let i = 0; i < firstOffset; i++) {
      const blank = document.createElement("span");
      blank.className = "calendar-empty";
      blank.setAttribute("aria-hidden", "true");
      calendar.append(blank);
    }
    for (let number = 1; number <= daysInMonth; number++) {
      const date = `${year}-${String(month).padStart(2,"0")}-${String(number).padStart(2,"0")}`;
      const isPast = date < today;
      const isFull = fullDays.has(number);
      const isSelected = date === initialSelected && !isFull && !isPast;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `calendar-day ${isPast ? "past" : isFull ? "full" : "open"}${isSelected ? " is-selected" : ""}`;
      button.dataset.calendarDay = String(number);
      button.dataset.calendarDate = date;
      button.dataset.availability = isPast ? "past" : isFull ? "full" : "open";
      button.setAttribute("aria-pressed", String(isSelected));
      button.setAttribute("aria-label", `Day ${number}, ${isPast ? "PAST, unavailable" : isFull ? "FULL" : isSelected ? "SELECTED" : "OPEN"}`);
      button.disabled = isFull || isPast;
      if (button.disabled) button.setAttribute("aria-disabled", "true");
      button.innerHTML = `<span>${number}</span><small>${isPast ? "PAST" : isFull ? "FULL" : isSelected ? "SELECTED" : "OPEN"}</small>`;
      calendar.append(button);
    }
    const validSelected = initialSelected >= today && !fullDays.has(Number(initialSelected.slice(-2)));
    if (selectedDateInput) selectedDateInput.value = validSelected ? initialSelected : "";
    if (selectedDateDisplay) selectedDateDisplay.textContent = formatCalendarDate(validSelected ? initialSelected : "");
  };

  if (monthInput && calendar) {
    const currentMonth = localToday().slice(0, 7);
    monthInput.min = currentMonth;
    let savedDate = selectedDateInput?.value || "";
    try { savedDate = sessionStorage.getItem(TRIP_DATE_KEY) || savedDate; } catch (_) {}
    if (/^\d{4}-\d{2}-\d{2}$/.test(savedDate) && savedDate >= localToday()) monthInput.value = savedDate.slice(0, 7);
    if (monthInput.value < currentMonth) monthInput.value = currentMonth;
    renderCalendar(monthInput.value, savedDate >= localToday() ? savedDate : "");
    monthInput.addEventListener("change", () => {
      if (monthInput.value < localToday().slice(0, 7)) monthInput.value = localToday().slice(0, 7);
      try { sessionStorage.removeItem(TRIP_DATE_KEY); } catch (_) {}
      renderCalendar(monthInput.value);
    });
  }

  if (calendar) calendar.addEventListener("click", (event) => {
    const day = event.target.closest("[data-calendar-day]");
    if (!day || day.disabled || day.dataset.availability === "full") return;
    calendar.querySelectorAll("[data-calendar-day]").forEach((button) => {
      button.classList.remove("is-selected");
      button.setAttribute("aria-pressed", "false");
      if (!button.disabled) {
        const label = button.querySelector("small");
        if (label) label.textContent = "OPEN";
        button.setAttribute("aria-label", `Day ${button.dataset.calendarDay}, OPEN`);
      }
    });
    day.classList.add("is-selected");
    day.setAttribute("aria-pressed", "true");
    const status = day.querySelector("small");
    if (status) status.textContent = "SELECTED";
    day.setAttribute("aria-label", `Day ${day.dataset.calendarDay}, SELECTED`);
    if (selectedDateInput) selectedDateInput.value = day.dataset.calendarDate;
    if (selectedDateDisplay) selectedDateDisplay.textContent = formatCalendarDate(day.dataset.calendarDate);
  });

  if (page === "status-timeline") {
    let status = "pending";
    try { status = (sessionStorage.getItem(STATUS_KEY) || status).toLowerCase(); } catch (_) {}
    const aliases = {"payment-deadline-passed":"expired", "booking-closed":"closed", "cancellation-result":"cancelled"};
    status = aliases[status] || status;
    const panels = [...document.querySelectorAll("[data-status-panel]")];
    if (!panels.some((panel) => panel.dataset.statusPanel === status)) status = "pending";
    panels.forEach((panel) => { panel.hidden = panel.dataset.statusPanel !== status; });
    const current = panels.find((panel) => panel.dataset.statusPanel === status);
    const summary = document.getElementById("status-summary");
    if (summary && current) summary.textContent = `Current status: ${current.querySelector("h2")?.textContent || status}.`;
  }

  const track = document.querySelector("form[data-track-form]");
  if (track) track.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!track.reportValidity()) return;
    const choice = track.elements.status.value;
    const routes = {pending:"booking_pending.html",approved:"request_approved.html",confirmed:"booking_confirmed.html",expired:"payment_deadline_passed.html",closed:"booking_closed.html",cancelled:"cancellation_result.html","not-found":"track_not_found.html"};
    saveStatus(choice);
    go(routes[choice] || "track_not_found.html");
  });

  const requestType = document.getElementById("request-type");
  if (requestType && requestType.form) requestType.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!requestType.form.reportValidity()) return;
    go(requestType.value === "cancel" ? "cancellation_request.html" : "change_request_received.html");
  });

  const messageForm = document.querySelector("form[data-message-form]");
  if (messageForm) messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!messageForm.reportValidity()) return;
    messageForm.reset();
    announce("Demo message prepared. No message was sent or stored.");
  });
})();


(() => {
  const announce = (text) => { const live = document.getElementById("live-message"); if (live) live.textContent = text; };
  const go = (target) => { window.location.href = target; };
  "use strict";
  // Staff and owner demo interactions (kept in the shared application script).
  document.querySelectorAll(".demo-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const message = document.getElementById("live-message");
      const passwords = form.querySelectorAll('input[type="password"]');
      if (form.dataset.next && passwords.length === 2 && passwords[0].value !== passwords[1].value) {
        if (message) message.textContent = "The two passwords do not match. Please re-enter them.";
        passwords[1].focus();
        return;
      }
      if (message) message.textContent = "Demo action saved. No real account, payment, email or booking data was changed.";
      if (form.dataset.next) setTimeout(() => go(form.dataset.next), 600);
    });
  });
  document.querySelectorAll("[data-toggle-password]").forEach((toggle) => {
    toggle.addEventListener("change", () => {
      const password = toggle.closest("form")?.querySelector('input[type="password"], input[data-password]');
      if (password) password.type = toggle.checked ? "text" : "password";
    });
  });
  document.querySelectorAll("[data-export]").forEach((button) => {
    button.addEventListener("click", () => {
      const message = document.getElementById("live-message");
      if (message) message.textContent = `Demo ${button.dataset.export.toUpperCase()} export preview selected. Connect a backend to generate a real report.`;
    });
  });
  // ---- Role handling (demo only: stored in sessionStorage, not real security) ----
  const ROLE_KEY = "bearcatDemoRole";
  const NOTICE_KEY = "bearcatDemoNotice";
  const currentRole = (() => { try { return sessionStorage.getItem(ROLE_KEY) || ""; } catch (_) { return ""; } })();
  const pageRole = document.body.dataset.role;
  const currentFile = window.location.pathname.split("/").pop() || "index.html";
  const loginForm = document.querySelector("[data-login-form]");
  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!loginForm.reportValidity()) return;
      const role = loginForm.querySelector("#login-role").value === "owner" ? "owner" : "staff";
      try { sessionStorage.setItem(ROLE_KEY, role); } catch (_) {}
      go(role === "owner" ? "owner_dashboard.html" : "staff_dashboard.html");
    });
  }
  if (pageRole === "owner" && currentRole === "staff") {
    try { sessionStorage.setItem(NOTICE_KEY, "That page is for management / owner accounts only."); } catch (_) {}
    go("staff_dashboard.html");
  }
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY);
    if (notice) { sessionStorage.removeItem(NOTICE_KEY); announce(notice); }
  } catch (_) {}
  if (pageRole === "staff" && currentRole === "owner") {
    const ownerLinks = [["owner_dashboard.html", "Dashboard"], ["all_company_bookings.html", "Bookings"], ["payments_list.html", "Payments"], ["change_requests_list.html", "Change requests"], ["review_release_refunds.html", "Refunds"], ["manage_services_rates.html", "Services & rates"], ["booking_payment_reports.html", "Reports"], ["manage_staff_accounts.html", "Staff"], ["business_system_settings.html", "Settings"]];
    const nav = document.getElementById("primary-nav");
    if (nav) {
      nav.setAttribute("aria-label", "Owner navigation");
      nav.innerHTML = ownerLinks.map(([href, label]) => `<a href="${href}">${label.replace("&", "&amp;")}</a>`).join("");
    }
    const ownerBadge = document.querySelector(".portal-badge");
    if (ownerBadge) { ownerBadge.textContent = "OWNER"; ownerBadge.setAttribute("href", "owner_dashboard.html"); }
    document.querySelectorAll('a[href="staff_dashboard.html"]').forEach((link) => link.setAttribute("href", "owner_dashboard.html"));
  }
  if (pageRole === "staff" || pageRole === "owner") {
    document.querySelectorAll("#primary-nav a").forEach((link) => {
      if (link.getAttribute("href") === currentFile) link.setAttribute("aria-current", "page");
    });
  }

  // ---- "Edit" buttons fill the form beside the table ----
  document.querySelectorAll("[data-edit-row]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const form = document.querySelector(link.getAttribute("href"));
      if (!form) return;
      event.preventDefault();
      const cells = [...link.closest("tr").children].map((td) => td.textContent.trim());
      const names = (form.dataset.fields || "").split(",");
      const values = form.id === "staff-form"
        ? { name: cells[0], email: cells[1], role: cells[2], active: cells[3] }
        : { type: cells[1], name: cells[0], rate: cells[2], unit: cells[3], deposit: cells[4], active: cells[5] };
      const controls = [...form.querySelectorAll("input, select, textarea")];
      controls.forEach((control, i) => {
        const key = names[i];
        if (!(key in values)) return;
        const value = values[key];
        if (control.type === "checkbox") control.checked = /^yes/i.test(value);
        else if (control.tagName === "SELECT") {
          const wanted = value.toLowerCase();
          const option = [...control.options].find((o) => o.text.toLowerCase() === wanted) || [...control.options].find((o) => wanted.startsWith(o.text.toLowerCase()));
          if (option) control.selectedIndex = option.index;
        } else if (control.type === "number") control.value = value.replace(/[^0-9.]/g, "");
        else control.value = value;
      });
      const password = form.querySelector('input[type="password"]');
      if (password) { password.required = false; password.placeholder = "Leave blank to keep current password"; }
      controls[0].focus();
      announce(`Editing ${values.name}. Change the fields and save.`);
    });
  });
})();

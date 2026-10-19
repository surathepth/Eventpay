/**
 * ============================================================================
 * EVENTPAY CUSTOMER ONLINE BOOKING CONTROLLER (js/booking.js)
 * โครงการ: EventPay (Concert Payment & Secure Entry Platform)
 * พิกัด: D:\BillingApp\Antigravity\EventPay\js\booking.js
 * หน้าที่: ควบคุมตรรกะหน้าจองบัตรออนไลน์ของลูกค้า (Customer Self-Service)
 *        รวมขั้นตอนเดียว: เลือกบัตร ➔ สแกนพร้อมเพย์ ➔ ตรวจสลิป ➔ ออกตั๋ว e-Ticket QR
 * ============================================================================
 */

(function () {
  'use strict';

  let bookingQuantities = {};
  let audioAlert = null;
  let qrcodeInstance = null;

  document.addEventListener('DOMContentLoaded', () => {
    try {
      if (typeof EventPayAudioAlert !== 'undefined') {
        audioAlert = new EventPayAudioAlert();
      }
    } catch (e) {
      console.warn('[Booking] Audio alert warning:', e);
    }
    initBookingPage();
  });

  function initBookingPage() {
    loadEventDetails();
    renderTiers();
    updateBookingSummary();
    setupInputListeners();

    // ปลดล็อก Web Audio เมื่อผู้ใช้แตะหน้าจอครั้งแรก
    document.addEventListener('click', function unlockOnce() {
      if (audioAlert) audioAlert.unlockAudio();
      document.removeEventListener('click', unlockOnce);
    }, { once: true });
  }

  function loadEventDetails() {
    if (typeof EventPayDB === 'undefined') return;
    const events = EventPayDB.getAll('events');
    if (events && events.length > 0) {
      const evt = events[0];
      const nameEl = document.getElementById('bookingEventName');
      const venueEl = document.getElementById('bookingVenue');
      if (nameEl) nameEl.textContent = evt.name;
      if (venueEl) venueEl.textContent = `${evt.venue} | ${new Date(evt.start_date).toLocaleDateString('th-TH')}`;
    }
  }

  function renderTiers() {
    if (typeof EventPayDB === 'undefined') return;
    const tiers = EventPayDB.getAll('ticket_tiers');
    const container = document.getElementById('bookingTierGrid');
    if (!container) return;
    container.innerHTML = '';

    tiers.forEach((tier, index) => {
      // ตั้งค่าเริ่มต้น: โซนแรกมีจำนวน 1 ใบ
      if (!(tier.tier_id in bookingQuantities)) {
        bookingQuantities[tier.tier_id] = (index === 0 ? 1 : 0);
      }

      const isSelected = bookingQuantities[tier.tier_id] > 0;
      const card = document.createElement('div');
      card.className = `ep-tier-item ${isSelected ? 'selected' : ''}`;
      card.id = `tier_card_${tier.tier_id}`;

      card.innerHTML = `
        <div class="ep-tier-name">${tier.name}</div>
        <div class="ep-tier-price">฿${tier.price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
        <div class="ep-tier-desc">${tier.description || 'สิทธิ์เข้าชมคอนเสิร์ตพร้อมริสต์แบนด์'}</div>
        <div style="font-size: 0.72rem; color: var(--accent-cyan); margin-top: 4px;">
          ความจุ: ${tier.capacity.toLocaleString()} ที่นั่ง
        </div>
        <div class="ep-qty-control">
          <button type="button" class="ep-qty-btn" onclick="changeTierQuantity('${tier.tier_id}', -1, event)">-</button>
          <span class="ep-qty-display" id="qty_val_${tier.tier_id}">${bookingQuantities[tier.tier_id]}</span>
          <button type="button" class="ep-qty-btn" onclick="changeTierQuantity('${tier.tier_id}', 1, event)">+</button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.ep-qty-btn')) return;
        if (bookingQuantities[tier.tier_id] === 0) {
          bookingQuantities[tier.tier_id] = 1;
        }
        updateTierUI();
        updateBookingSummary();
      });

      container.appendChild(card);
    });
  }

  window.changeTierQuantity = function (tierId, delta, event) {
    if (event) event.stopPropagation();
    const current = bookingQuantities[tierId] || 0;
    const updated = Math.max(0, current + delta);
    bookingQuantities[tierId] = updated;

    updateTierUI();
    updateBookingSummary();
  };

  function updateTierUI() {
    Object.keys(bookingQuantities).forEach(tierId => {
      const qty = bookingQuantities[tierId];
      const card = document.getElementById(`tier_card_${tierId}`);
      const val = document.getElementById(`qty_val_${tierId}`);
      if (val) val.textContent = qty;
      if (card) {
        if (qty > 0) card.classList.add('selected');
        else card.classList.remove('selected');
      }
    });
  }

  function getBookingTotalAmount() {
    if (typeof EventPayDB === 'undefined') return 0;
    const tiers = EventPayDB.getAll('ticket_tiers');
    let total = 0;
    tiers.forEach(tier => {
      const qty = bookingQuantities[tier.tier_id] || 0;
      total += (tier.price * qty);
    });
    return total;
  }

  function getBookingTotalTickets() {
    let count = 0;
    Object.values(bookingQuantities).forEach(qty => { count += qty; });
    return count;
  }

  function updateBookingSummary() {
    const total = getBookingTotalAmount();
    const count = getBookingTotalTickets();

    const countEl = document.getElementById('bookingTotalCount');
    const totalEl = document.getElementById('bookingTotalAmount');
    const qrTotalEl = document.getElementById('bookingPromptPayTotal');

    if (countEl) countEl.textContent = `${count} ใบ`;
    if (totalEl) totalEl.textContent = `฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (qrTotalEl) qrTotalEl.textContent = `฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

    renderAttendeeInputs(count);
    renderPromptPayQr(total);
    validateFormReadiness();
  }

  function renderAttendeeInputs(totalCount) {
    const container = document.getElementById('bookingAttendeeContainer');
    if (!container) return;
    container.innerHTML = '';

    if (totalCount > 1) {
      const header = document.createElement('div');
      header.style.fontSize = '0.82rem';
      header.style.color = 'var(--accent-gold)';
      header.style.fontWeight = '700';
      header.style.marginBottom = '8px';
      header.textContent = `🎟️ ระบุชื่อผู้ถือบัตรเพิ่มเติม (สำหรับบัตร ${totalCount} ใบ):`;
      container.appendChild(header);

      let attendeeIdx = 1;
      const tiers = EventPayDB.getAll('ticket_tiers');
      tiers.forEach(tier => {
        const qty = bookingQuantities[tier.tier_id] || 0;
        for (let i = 0; i < qty; i++) {
          if (attendeeIdx > 1) {
            const row = document.createElement('div');
            row.style.marginBottom = '8px';
            row.innerHTML = `
              <label class="ep-form-label" style="font-size: 0.78rem;">
                ผู้เข้าชมคนที่ ${attendeeIdx} (${tier.name})
              </label>
              <input type="text" class="ep-input booking-attendee-input"
                     data-tier="${tier.tier_id}"
                     placeholder="ชื่อ-นามสกุล ผู้ถือบัตรใบที่ ${attendeeIdx}">
            `;
            container.appendChild(row);
          }
          attendeeIdx++;
        }
      });
    }
  }

  function renderPromptPayQr(amount) {
    const holder = document.getElementById('bookingPromptPayQr');
    if (!holder) return;
    holder.innerHTML = '';

    if (typeof QRCode !== 'undefined' && amount > 0) {
      // สร้าง Payload พร้อมเพย์แบบออฟไลน์
      const payload = `TH.GOV.PROMPTPAY|0812345678|AMOUNT:${amount.toFixed(2)}|EVENTPAY-CONCERT-2026`;
      new QRCode(holder, {
        text: payload,
        width: 170,
        height: 170,
        colorDark: '#002d62',
        colorLight: '#ffffff'
      });
    } else if (amount === 0) {
      holder.innerHTML = '<span style="font-size:0.75rem; color:#999;">เลือกบัตรเพื่อดู QR พร้อมเพย์</span>';
    }
  }

  function setupInputListeners() {
    ['bookingCustName', 'bookingCustPhone', 'bookingBankRefInput'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', validateFormReadiness);
      }
    });
  }

  window.simulateFastSlip = function () {
    const refInput = document.getElementById('bookingBankRefInput');
    const statusText = document.getElementById('bookingSlipStatus');
    const uniqueRef = 'KBANK-ONL-' + Date.now().toString().slice(-8);

    if (refInput) refInput.value = uniqueRef;
    if (statusText) statusText.textContent = `✅ แนบสลิปทดสอบเรียบร้อย (Ref: ${uniqueRef})`;
    validateFormReadiness();
  };

  function validateFormReadiness() {
    const btn = document.getElementById('btnSubmitBooking');
    const name = document.getElementById('bookingCustName')?.value.trim();
    const phone = document.getElementById('bookingCustPhone')?.value.trim();
    const bankRef = document.getElementById('bookingBankRefInput')?.value.trim();
    const total = getBookingTotalAmount();
    const count = getBookingTotalTickets();

    const isReady = (count > 0 && total > 0 && Boolean(name) && Boolean(phone) && Boolean(bankRef));
    if (btn) btn.disabled = !isReady;
  }

  window.submitBookingOrder = function () {
    const total = getBookingTotalAmount();
    const count = getBookingTotalTickets();
    if (count === 0 || total <= 0) return;

    const custName = document.getElementById('bookingCustName')?.value.trim();
    const custPhone = document.getElementById('bookingCustPhone')?.value.trim();
    const bankRef = document.getElementById('bookingBankRefInput')?.value.trim();

    if (!custName || !custPhone || !bankRef) {
      alert('กรุณากรอกชื่อ เบอร์โทร และเลขอ้างอิงสลิปให้ครบถ้วน');
      return;
    }

    // รวบรวมรายชื่อผู้เข้าชม
    const attendeeInputs = document.querySelectorAll('.booking-attendee-input');
    const attendeeNamesByTier = {};

    attendeeInputs.forEach(input => {
      const tierId = input.getAttribute('data-tier');
      const val = input.value.trim() || custName;
      if (!attendeeNamesByTier[tierId]) attendeeNamesByTier[tierId] = [];
      attendeeNamesByTier[tierId].push(val);
    });

    const items = [];
    const tiers = EventPayDB.getAll('ticket_tiers');
    tiers.forEach(tier => {
      const qty = bookingQuantities[tier.tier_id] || 0;
      if (qty > 0) {
        const names = attendeeNamesByTier[tier.tier_id] || [];
        // ใส่ชื่อคนแรกเป็น custName
        if (names.length === 0) names.push(custName);
        while (names.length < qty) names.push(custName);

        items.push({
          tier_id: tier.tier_id,
          quantity: qty,
          attendee_names: names
        });
      }
    });

    const orderData = {
      customer_name: custName,
      customer_phone: custPhone,
      payment_method: 'TRANSFER',
      shift_id: 'SHIFT-ONLINE-SELF',
      bank_ref: bankRef,
      slip_url: 'uploads/slips/online-slip-' + Date.now() + '.jpg',
      items: items
    };

    try {
      const result = EventPayDB.createOrder(orderData, 'ONLINE_CUSTOMER');
      
      // ตรวจสอบว่าถูกดักจับสลิปซ้ำหรือไม่
      if (result.order.payment_status === 'PENDING_VERIFICATION') {
        alert(`⚠️ แจ้งเตือน: ระบบตรวจพบว่าเลขอ้างอิงสลิป '${bankRef}' เคยถูกใช้งานแล้วในระบบ!\nบัตรจะถูกล็อกเป็นโมฆะชั่วคราวเพื่อรอเจ้าหน้าที่ตรวจสอบ`);
      }

      // เล่นเสียง Chime ยืนยันการสั่งซื้อสำเร็จ
      if (audioAlert) audioAlert.playSuccessChime();

      // แสดงส่วนความสำเร็จ และสร้างบัตร e-Ticket QR ทันที
      displayBookingSuccess(result);

    } catch (err) {
      console.error('[Booking] Order submission error:', err);
      alert('เกิดข้อผิดพลาดในการทำรายการ: ' + err.message);
    }
  };

  function displayBookingSuccess(result) {
    const formSection = document.getElementById('bookingFormSection');
    const successSection = document.getElementById('bookingSuccessSection');
    const ticketsArea = document.getElementById('bookingIssuedTicketsArea');

    if (formSection) formSection.style.display = 'none';
    if (successSection) successSection.style.display = 'block';

    // อัปเดตข้อมูลใบเสร็จ
    const order = result.order;
    const payment = result.payment;
    const tickets = result.tickets;

    document.getElementById('succReceiptId').textContent = payment.payment_id;
    document.getElementById('succCustName').textContent = order.customer_name;
    document.getElementById('succCustPhone').textContent = order.customer_phone;
    document.getElementById('succTotalAmount').textContent = `฿${order.total_amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    document.getElementById('succBankRef').textContent = payment.bank_ref || '-';

    // แสดงบัตรคอนเสิร์ต e-Ticket พร้อม QR Code
    if (ticketsArea) {
      ticketsArea.innerHTML = '';
      tickets.forEach((ticket, idx) => {
        const card = document.createElement('div');
        card.className = 'ep-ticket-pass';
        card.style.maxWidth = '420px';
        card.style.margin = '0 auto 20px auto';
        card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';

        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px; margin-bottom:8px;">
            <span style="font-size:0.75rem; color:var(--accent-gold); font-weight:700;">OFFICIAL E-TICKET PASS</span>
            <span style="font-size:0.75rem; color:var(--accent-green); font-weight:800;">● สิทธิ์สมบูรณ์</span>
          </div>
          <h3 style="color: var(--accent-gold); font-size: 1.25rem; margin-bottom: 4px;">${ticket.tier_name}</h3>
          <p style="font-size: 0.9rem; color: #fff; margin-bottom:10px;">ผู้ถือบัตร: <strong>${ticket.attendee_name}</strong></p>
          
          <div class="ep-ticket-qr-wrap" id="online_qr_${ticket.ticket_id}" style="width:180px; height:180px; margin:0 auto 10px auto; background:#fff; padding:10px; border-radius:8px;">
            <!-- QR rendered -->
          </div>

          <div style="font-family: monospace; font-size: 0.85rem; color: var(--accent-cyan); letter-spacing: 1px; margin-bottom:10px;">
            ${ticket.qr_code_hash}
          </div>

          <div class="ep-ticket-meta" style="text-align:left; font-size:0.8rem; background:#070d1a; padding:10px; border-radius:6px;">
            <div>รหัสบัตร: <strong style="color:#fff;">${ticket.ticket_id}</strong></div>
            <div>คำสั่งซื้อ: <strong style="color:#fff;">${ticket.order_id}</strong></div>
            <div>สถานะเข้างาน: <strong style="color: var(--accent-green);">${ticket.is_void ? '⚠️ ระงับตรวจสอบ' : 'พร้อมสแกนเข้างาน'}</strong></div>
            <div>ริสต์แบนด์: <strong style="color:var(--text-muted);">${ticket.wristband_id || 'รับสายรัดข้อมือหน้าประตู'}</strong></div>
          </div>
        `;
        ticketsArea.appendChild(card);

        // วาดภาพ QR Code แบบออฟไลน์
        setTimeout(() => {
          const qrBox = document.getElementById(`online_qr_${ticket.ticket_id}`);
          if (qrBox && typeof QRCode !== 'undefined') {
            new QRCode(qrBox, {
              text: ticket.qr_code_hash,
              width: 160,
              height: 160,
              colorDark: '#000000',
              colorLight: '#ffffff'
            });
          }
        }, 50);
      });
    }

    // เลื่อนหน้าจอขึ้นมาด้านบนสุด
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

})();

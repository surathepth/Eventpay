/**
 * ============================================================================
 * EVENTPAY TICKETING & CASH CONTROLLER (js/ticketing.js)
 * โครงการ: EventPay (Concert Payment & Secure Entry Platform)
 * พิกัด: D:\BillingApp\Antigravity\EventPay\js\ticketing.js
 * หน้าที่: ควบคุมตรรกะหน้าจำหน่ายบัตร, คำนวณเงินสด/เงินทอน, พร้อมเพย์, ใบเสร็จ และปิดกะ
 * ============================================================================
 */

(function () {
  'use strict';

  // State Management
  let currentOrderType = 'WALKIN'; // 'WALKIN' (หน้างาน) | 'PRESALE' (ล่วงหน้า)
  let currentPaymentMethod = 'CASH'; // 'CASH' | 'TRANSFER'
  let tierQuantities = {}; // { 'TIER-VIP': 1, 'TIER-REG': 0, ... }
  let lastOrderResult = null;
  let audioAlert = null;
  let activeShift = null;

  document.addEventListener('DOMContentLoaded', () => {
    try {
      if (typeof EventPayAudioAlert !== 'undefined') {
        audioAlert = new EventPayAudioAlert();
      }
    } catch (e) {
      console.warn('Audio alert init warning:', e);
    }
    initPage();
  });

  function initPage() {
    loadEventDetails();
    loadActiveShift();
    renderTierCards();
    updateTotalSummary();
    updateNetworkBadge();

    // ฟัง Real-time Broadcast จากเครื่องแม่ข่าย
    if (EventPayDB && typeof EventPayDB.onSyncEvent === 'function') {
      EventPayDB.onSyncEvent((data) => {
        loadActiveShift();
      });
    }

    // ปลดล็อก Web Audio ทันทีเมื่อผู้ใช้คลิกหน้าจอครั้งแรก
    document.addEventListener('click', function unlockOnce() {
      if (audioAlert) audioAlert.unlockAudio();
      document.removeEventListener('click', unlockOnce);
    }, { once: true });
  }

  async function updateNetworkBadge() {
    const badge = document.getElementById('networkModeBadge');
    if (!badge) return;
    try {
      const res = await EventPayDB.checkMasterConnection();
      if (res && res.connected) {
        badge.textContent = '🟢 LAN MASTER CONNECTED';
        badge.style.background = 'rgba(34, 197, 94, 0.15)';
        badge.style.borderColor = 'var(--accent-green)';
        badge.style.color = 'var(--accent-green)';
      } else {
        badge.textContent = '🟡 LOCAL OFFLINE MODE';
        badge.style.background = 'rgba(234, 179, 8, 0.15)';
        badge.style.borderColor = 'var(--accent-gold)';
        badge.style.color = 'var(--accent-gold)';
      }
    } catch (e) {
      badge.textContent = '🟡 LOCAL OFFLINE MODE';
    }
  }

  // ==========================================================================
  // 1. โหลดข้อมูลงานและกะแคชเชียร์
  // ==========================================================================
  function loadEventDetails() {
    const events = EventPayDB.getAll('events');
    if (events.length > 0) {
      const evt = events[0];
      const headerTitle = document.getElementById('headerEventName');
      const headerVenue = document.getElementById('headerVenue');
      if (headerTitle) headerTitle.textContent = evt.name;
      if (headerVenue) headerVenue.textContent = `${evt.venue} | ${new Date(evt.start_date).toLocaleDateString('th-TH')}`;
    }
  }

  function loadActiveShift() {
    const shifts = EventPayDB.getAll('cash_sessions', s => s.status === 'OPEN');
    const barShiftId = document.getElementById('barShiftId');
    const barCashier = document.getElementById('barCashierName');

    if (shifts.length > 0) {
      activeShift = shifts[0];
      if (barShiftId) barShiftId.textContent = activeShift.shift_id;
      if (barCashier) barCashier.textContent = activeShift.cashier_name;
    } else {
      activeShift = null;
      if (barShiftId) barShiftId.textContent = 'ไม่มีกะที่เปิดอยู่';
      if (barCashier) barCashier.textContent = '-';
    }
  }

  // ==========================================================================
  // 2. แสดงรายการโซนและประเภทบัตร
  // ==========================================================================
  function renderTierCards() {
    const container = document.getElementById('tierListContainer');
    if (!container) return;
    container.innerHTML = '';

    const tiers = EventPayDB.getAll('ticket_tiers');
    tiers.forEach((tier, index) => {
      if (tierQuantities[tier.tier_id] === undefined) {
        // ค่าเริ่มต้น: เลือก VIP 1 ใบให้ผู้ใช้เห็นทันที
        tierQuantities[tier.tier_id] = index === 0 ? 1 : 0;
      }

      const isSelected = tierQuantities[tier.tier_id] > 0;
      const card = document.createElement('div');
      card.className = `ep-tier-item ${isSelected ? 'selected' : ''}`;
      card.id = `tier_card_${tier.tier_id}`;

      card.innerHTML = `
        <div class="ep-tier-info">
          <h3>${tier.name}</h3>
          <p>โควตาคงเหลือ: ${(tier.quota - (tier.sold || 0)).toLocaleString()} ที่นั่ง</p>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <div class="ep-tier-price">฿${tier.price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
          <div class="ep-qty-control">
            <button type="button" class="ep-qty-btn" onclick="updateTierQty('${tier.tier_id}', -1)">-</button>
            <span class="ep-qty-val" id="qty_${tier.tier_id}">${tierQuantities[tier.tier_id]}</span>
            <button type="button" class="ep-qty-btn" onclick="updateTierQty('${tier.tier_id}', 1)">+</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    renderAttendeeInputs();
  }

  window.updateTierQty = function (tierId, delta) {
    const current = tierQuantities[tierId] || 0;
    const nextVal = Math.max(0, current + delta);
    tierQuantities[tierId] = nextVal;

    const qtySpan = document.getElementById(`qty_${tierId}`);
    if (qtySpan) qtySpan.textContent = nextVal;

    const card = document.getElementById(`tier_card_${tierId}`);
    if (card) {
      if (nextVal > 0) card.classList.add('selected');
      else card.classList.remove('selected');
    }

    renderAttendeeInputs();
    updateTotalSummary();
    calculateChange();
    if (currentPaymentMethod === 'TRANSFER') renderPromptPayQr();
  };

  // ==========================================================================
  // 3. ช่องกรอกชื่อผู้เข้าชมตามจำนวนบัตร
  // ==========================================================================
  function renderAttendeeInputs() {
    const container = document.getElementById('dynamicAttendeesContainer');
    if (!container) return;
    container.innerHTML = '';

    const tiers = EventPayDB.getAll('ticket_tiers');
    let totalTickets = 0;
    tiers.forEach(tier => {
      totalTickets += (tierQuantities[tier.tier_id] || 0);
    });

    let attendeeIndex = 1;
    const currentCustName = document.getElementById('custName')?.value.trim() || 'ลูกค้าหน้างาน';

    tiers.forEach(tier => {
      const qty = tierQuantities[tier.tier_id] || 0;
      for (let i = 0; i < qty; i++) {
        const row = document.createElement('div');
        row.className = 'ep-form-group';
        row.style.marginBottom = '8px';

        // หากซื้อบัตร 1 ใบ ให้ซิงก์ชื่อผู้สั่งซื้ออัตโนมัติ โดยซ่อนช่องกรอกซ้ำเพื่อความสะดวกรวดเร็ว
        if (totalTickets === 1) {
          row.style.display = 'none';
        }

        row.innerHTML = `
          <label class="ep-form-label" style="font-size: 0.78rem;">
            🎟️ ผู้เข้าชมคนที่ ${attendeeIndex} (${tier.name})
          </label>
          <input type="text" class="ep-input ep-attendee-input"
                 data-tier="${tier.tier_id}"
                 placeholder="ระบุชื่อ-นามสกุล ผู้ถือบัตรใบที่ ${attendeeIndex}"
                 value="${attendeeIndex === 1 ? currentCustName : ''}">
        `;
        container.appendChild(row);
        attendeeIndex++;
      }
    });

    // แสดงข้อความแนะนำเมื่อซื้อ 1 ใบ
    if (totalTickets === 1) {
      const hint = document.createElement('div');
      hint.style.fontSize = '0.78rem';
      hint.style.color = 'var(--accent-green)';
      hint.style.marginTop = '4px';
      hint.style.fontWeight = '600';
      hint.innerHTML = '✨ บัตร 1 ใบนี้จะระบุชื่อตาม <strong>"ชื่อผู้สั่งซื้อ"</strong> ด้านบนอัตโนมัติ (ไม่ต้องพิมพ์ซ้ำ)';
      container.appendChild(hint);
    }
  }

  // ==========================================================================
  // 4. สลับโหมดการซื้อและวิธีการชำระเงิน
  // ==========================================================================
  window.setOrderType = function (type) {
    currentOrderType = type;
    const btnWalkin = document.getElementById('btnTypeWalkin');
    const btnPresale = document.getElementById('btnTypePresale');
    if (btnWalkin && btnPresale) {
      if (type === 'WALKIN') {
        btnWalkin.classList.add('active');
        btnPresale.classList.remove('active');
      } else {
        btnPresale.classList.add('active');
        btnWalkin.classList.remove('active');
      }
    }
  };

  window.setPaymentMethod = function (method) {
    currentPaymentMethod = method;
    const tabCash = document.getElementById('tabPayCash');
    const tabTransfer = document.getElementById('tabPayTransfer');
    const panelCash = document.getElementById('panelCashPayment');
    const panelTransfer = document.getElementById('panelTransferPayment');
    const summaryMethod = document.getElementById('summaryPayMethod');

    if (method === 'CASH') {
      tabCash.classList.add('active');
      tabTransfer.classList.remove('active');
      panelCash.style.display = 'block';
      panelTransfer.style.display = 'none';
      if (summaryMethod) {
        summaryMethod.textContent = 'เงินสด (CASH)';
        summaryMethod.style.color = 'var(--accent-gold)';
      }
      calculateChange();
    } else {
      tabTransfer.classList.add('active');
      tabCash.classList.remove('active');
      panelTransfer.style.display = 'block';
      panelCash.style.display = 'none';
      if (summaryMethod) {
        summaryMethod.textContent = 'เงินโอน (THAI QR)';
        summaryMethod.style.color = 'var(--accent-cyan)';
      }
      renderPromptPayQr();
      validateTransferReadiness();
    }
  };

  // ==========================================================================
  // 5. คำนวณยอดเงินรวมและเงินทอน (Cash Variance / Change Math)
  // ==========================================================================
  function getTotalAmount() {
    const tiers = EventPayDB.getAll('ticket_tiers');
    let total = 0;
    tiers.forEach(tier => {
      const qty = tierQuantities[tier.tier_id] || 0;
      total += (tier.price * qty);
    });
    return total;
  }

  function getTotalTickets() {
    let count = 0;
    Object.values(tierQuantities).forEach(qty => { count += qty; });
    return count;
  }

  function updateTotalSummary() {
    const total = getTotalAmount();
    const count = getTotalTickets();

    const summaryCount = document.getElementById('summaryTotalTickets');
    const summaryTotal = document.getElementById('summaryTotalAmount');
    const btnSubmit = document.getElementById('btnSubmitOrder');

    if (summaryCount) summaryCount.textContent = `${count} ใบ`;
    if (summaryTotal) summaryTotal.textContent = `฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

    if (count === 0) {
      if (btnSubmit) btnSubmit.disabled = true;
    } else {
      if (currentPaymentMethod === 'CASH') calculateChange();
      else validateTransferReadiness();
    }
  }

  window.addQuickCash = function (amount) {
    const input = document.getElementById('cashReceivedInput');
    const total = getTotalAmount();
    if (amount === 'exact') {
      input.value = total;
    } else {
      const current = parseFloat(input.value) || 0;
      input.value = current + amount;
    }
    calculateChange();
  };

  window.clearCash = function () {
    const input = document.getElementById('cashReceivedInput');
    if (input) input.value = '';
    calculateChange();
  };

  window.calculateChange = function () {
    if (currentPaymentMethod !== 'CASH') return;

    const total = getTotalAmount();
    const count = getTotalTickets();
    const input = document.getElementById('cashReceivedInput');
    const banner = document.getElementById('changeBanner');
    const valSpan = document.getElementById('changeVal');
    const btnSubmit = document.getElementById('btnSubmitOrder');

    if (!input || !banner || !valSpan) return;

    const received = parseFloat(input.value) || 0;
    const diff = received - total;

    banner.className = 'ep-change-banner';

    if (count === 0) {
      banner.querySelector('.ep-change-label').textContent = 'กรุณาเลือกบัตรอย่างน้อย 1 ใบ';
      valSpan.textContent = '฿0.00';
      valSpan.className = 'ep-change-val';
      if (btnSubmit) btnSubmit.disabled = true;
      return;
    }

    if (received === 0) {
      banner.querySelector('.ep-change-label').textContent = 'รอรับเงินสดจากลูกค้า...';
      valSpan.textContent = `ยอดที่ต้องชำระ ฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      valSpan.className = 'ep-change-val';
      if (btnSubmit) btnSubmit.disabled = true;
    } else if (diff >= 0) {
      banner.classList.add('balanced');
      banner.querySelector('.ep-change-label').textContent = diff === 0 ? 'รับเงินมาพอดี (ไม่ต้องทอนเงิน):' : 'เงินทอนที่ต้องคืนลูกค้า:';
      valSpan.textContent = `฿${diff.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      valSpan.className = 'ep-change-val';
      if (btnSubmit) btnSubmit.disabled = false;
    } else {
      banner.classList.add('insufficient');
      banner.querySelector('.ep-change-label').textContent = 'เงินสดยังไม่ครบ (ขาดอีก):';
      valSpan.textContent = `฿${Math.abs(diff).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      valSpan.className = 'ep-change-val text-red';
      if (btnSubmit) btnSubmit.disabled = true;
    }
  };

  // ==========================================================================
  // 6. การสร้าง PromptPay QR Code และจำลองสลิป
  // ==========================================================================
  function renderPromptPayQr() {
    const holder = document.getElementById('promptPayQrHolder');
    const tag = document.getElementById('promptPayAmountTag');
    const accInfoEl = document.getElementById('indexPromptPayAccInfo');
    const total = getTotalAmount();

    if (tag) tag.textContent = `฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (!holder) return;
    holder.innerHTML = '';

    // ดึงบัญชีหลักจาก EventPayDB
    let activeBank = null;
    if (typeof EventPayDB !== 'undefined' && EventPayDB.getActiveBankAccount) {
      activeBank = EventPayDB.getActiveBankAccount();
    }
    const bankName = activeBank ? activeBank.bank_name : 'ธนาคารกสิกรไทย (KBANK)';
    const accNum = activeBank ? activeBank.account_number : '081-234-5678';
    const accName = activeBank ? activeBank.account_name : 'บริษัท สุรเทพอภัย คอนเสิร์ต จำกัด (EventPay Official)';
    const promptPayId = activeBank ? activeBank.promptpay_id : '0812345678';

    if (accInfoEl) {
      accInfoEl.innerHTML = `บัญชี: <strong>${bankName}</strong> (${accNum})<br>${accName}<br>พร้อมเพย์: <strong style="color:var(--accent-blue);">${promptPayId}</strong>`;
    }

    if (typeof QRCode !== 'undefined' && total > 0) {
      /* [REMARKED BY THEP-APAI & LILIN: โค้ดเดิมฟิกซ์เบอร์พร้อมเพย์ 0812345678]
      const payload = `TH.GOV.PROMPTPAY|0812345678|AMOUNT:${total.toFixed(2)}|EVENTPAY-CONCERT-2026`;
      */
      // [INSERT ACTIVE MODERN LOGIC]: ดึงเบอร์พร้อมเพย์จากบัญชีหลักที่เปิดใช้งานจริง
      const cleanPromptPayId = promptPayId.replace(/[^0-9]/g, '');
      const payload = `TH.GOV.PROMPTPAY|${cleanPromptPayId}|AMOUNT:${total.toFixed(2)}|EVENTPAY-CONCERT-2026`;
      new QRCode(holder, {
        text: payload,
        width: 170,
        height: 170,
        colorDark: '#002d62',
        colorLight: '#ffffff'
      });
    }
  }

  window.simulateSlipUpload = function () {
    const refInput = document.getElementById('bankRefInput');
    const statusText = document.getElementById('slipStatusText');
    const ref = 'KBANK-' + Date.now().toString().slice(-8);

    if (refInput) refInput.value = ref;
    if (statusText) statusText.textContent = `✅ แนบสลิปเรียบร้อย (${ref})`;
    validateTransferReadiness();
  };

  function validateTransferReadiness() {
    const btnSubmit = document.getElementById('btnSubmitOrder');
    const total = getTotalAmount();
    const count = getTotalTickets();

    if (count > 0 && total > 0) {
      if (btnSubmit) btnSubmit.disabled = false;
    } else {
      if (btnSubmit) btnSubmit.disabled = true;
    }
  }

  // ==========================================================================
  // 7. บันทึกคำสั่งซื้อและออกบัตร (Order Submission)
  // ==========================================================================
  window.processOrderSubmit = function () {
    const total = getTotalAmount();
    const count = getTotalTickets();
    if (count === 0 || total <= 0) return;

    const custName = document.getElementById('custName')?.value.trim() || 'ลูกค้าหน้างาน';
    const custPhone = document.getElementById('custPhone')?.value.trim() || '';

    // รวบรวมรายชื่อผู้เข้าชม
    const attendeeInputs = document.querySelectorAll('.ep-attendee-input');
    const attendeeNamesByTier = {};

    attendeeInputs.forEach(input => {
      const tierId = input.getAttribute('data-tier');
      const val = input.value.trim() || custName;
      if (!attendeeNamesByTier[tierId]) attendeeNamesByTier[tierId] = [];
      attendeeNamesByTier[tierId].push(val);
    });

    const items = [];
    Object.keys(tierQuantities).forEach(tierId => {
      const qty = tierQuantities[tierId];
      if (qty > 0) {
        items.push({
          tier_id: tierId,
          quantity: qty,
          attendee_names: attendeeNamesByTier[tierId] || []
        });
      }
    });

    const shiftId = activeShift ? activeShift.shift_id : 'SHIFT-20261017-01';
    const bankRef = document.getElementById('bankRefInput')?.value.trim() || '';

    const orderData = {
      customer_name: custName,
      customer_phone: custPhone,
      payment_method: currentPaymentMethod,
      shift_id: shiftId,
      bank_ref: bankRef,
      slip_url: currentPaymentMethod === 'TRANSFER' ? 'uploads/slips/slip-simulated.jpg' : '',
      items: items
    };

    try {
      const cashierId = activeShift ? activeShift.cashier_id : 'USER-STAFF-01';
      const result = EventPayDB.createOrder(orderData, cashierId);
      lastOrderResult = result;

      // เสียงติ๊ดสำเร็จ (Success Chime)
      if (audioAlert) audioAlert.playSuccessChime();

      // แสดงใบเสร็จรับเงิน
      openReceiptModal(result);

      // รีเซ็ตฟอร์ม
      resetOrderForm();
      loadActiveShift();
    } catch (err) {
      console.error('Order creation error:', err);
      alert('เกิดข้อผิดพลาดในการสร้างคำสั่งซื้อ: ' + err.message);
    }
  };

  function resetOrderForm() {
    tierQuantities = {};
    const tiers = EventPayDB.getAll('ticket_tiers');
    tiers.forEach((tier, index) => {
      tierQuantities[tier.tier_id] = index === 0 ? 1 : 0;
    });

    const cashInput = document.getElementById('cashReceivedInput');
    if (cashInput) cashInput.value = '';

    const bankRef = document.getElementById('bankRefInput');
    if (bankRef) bankRef.value = '';

    const slipStatus = document.getElementById('slipStatusText');
    if (slipStatus) slipStatus.textContent = '';

    renderTierCards();
    updateTotalSummary();
    calculateChange();
  }

  // ==========================================================================
  // 8. แสดงผลใบเสร็จรับเงิน (Modal 1)
  // ==========================================================================
  function openReceiptModal(orderResult) {
    const order = orderResult.order;
    const payment = orderResult.payment;
    const tickets = orderResult.tickets;

    document.getElementById('rcptId').textContent = payment.payment_id;
    document.getElementById('rcptDate').textContent = new Date(order.created_at).toLocaleString('th-TH');
    document.getElementById('rcptCustomer').textContent = `${order.customer_name} ${order.customer_phone ? '(' + order.customer_phone + ')' : ''}`;
    document.getElementById('rcptCashier').textContent = activeShift ? `${activeShift.cashier_name} (${activeShift.desk_id})` : 'แคชเชียร์หลัก';
    document.getElementById('rcptTotal').textContent = `฿${order.total_amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    document.getElementById('rcptPayMethod').textContent = order.payment_method;

    // ตารางรายการบัตร
    const tbody = document.getElementById('rcptItemsBody');
    tbody.innerHTML = '';

    // รวมกลุ่มตามโซน
    const summaryByTier = {};
    tickets.forEach(t => {
      if (!summaryByTier[t.tier_name]) summaryByTier[t.tier_name] = { qty: 0, tier_id: t.tier_id };
      summaryByTier[t.tier_name].qty++;
    });

    Object.keys(summaryByTier).forEach(tierName => {
      const item = summaryByTier[tierName];
      const tierObj = EventPayDB.get('ticket_tiers', item.tier_id);
      const price = tierObj ? tierObj.price : 0;
      const subtotal = price * item.qty;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${tierName}</td>
        <td style="text-align: center;">${item.qty}</td>
        <td style="text-align: right;">฿${subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
      `;
      tbody.appendChild(tr);
    });

    // ส่วนเงินสด / เงินโอน
    const cashRow = document.getElementById('rcptCashTenderedRow');
    const changeRow = document.getElementById('rcptChangeRow');
    const bankRow = document.getElementById('rcptBankRefRow');

    if (order.payment_method === 'CASH') {
      cashRow.style.display = 'flex';
      changeRow.style.display = 'flex';
      bankRow.style.display = 'none';

      const cashReceived = parseFloat(document.getElementById('cashReceivedInput')?.value) || order.total_amount;
      const change = Math.max(0, cashReceived - order.total_amount);
      document.getElementById('rcptTendered').textContent = `฿${cashReceived.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      document.getElementById('rcptChange').textContent = `฿${change.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    } else {
      cashRow.style.display = 'none';
      changeRow.style.display = 'none';
      bankRow.style.display = 'flex';
      document.getElementById('rcptBankRef').textContent = payment.bank_ref || 'QR-PROMPTPAY-CONFIRMED';
    }

    openModal('modalReceipt');
  }

  // ==========================================================================
  // 9. แสดงบัตร e-Ticket QR Code (Modal 2)
  // ==========================================================================
  window.viewIssuedTicketsFromReceipt = function () {
    closeModal('modalReceipt');
    if (!lastOrderResult) return;
    openTicketsModal(lastOrderResult.tickets);
  };

  function openTicketsModal(tickets) {
    const container = document.getElementById('ticketsListContainer');
    container.innerHTML = '';

    tickets.forEach((ticket, idx) => {
      const card = document.createElement('div');
      card.className = 'ep-ticket-pass';
      card.innerHTML = `
        <h3 style="color: var(--accent-gold); font-size: 1.15rem; margin-bottom: 4px;">${ticket.tier_name}</h3>
        <p style="font-size: 0.85rem; color: #fff;">ผู้ถือบัตร: <strong>${ticket.attendee_name}</strong></p>
        
        <div class="ep-ticket-qr-wrap" id="qr_ticket_${ticket.ticket_id}">
          <!-- QR rendered -->
        </div>

        <div style="font-family: monospace; font-size: 0.82rem; color: var(--accent-cyan); letter-spacing: 1px;">
          ${ticket.qr_code_hash}
        </div>

        <div class="ep-ticket-meta">
          <div>รหัสบัตร: <strong>${ticket.ticket_id}</strong></div>
          <div>คำสั่งซื้อ: <strong>${ticket.order_id}</strong></div>
          <div>สถานะประตู: <strong style="color: var(--accent-green);">${ticket.gate_status}</strong></div>
          <div>ริสต์แบนด์: <strong>${ticket.wristband_id || 'รอผูกหน้าประตู'}</strong></div>
        </div>
      `;
      container.appendChild(card);

      // วาด QR Code ด้วย qrcode.min.js
      setTimeout(() => {
        const qrBox = document.getElementById(`qr_ticket_${ticket.ticket_id}`);
        if (qrBox && typeof QRCode !== 'undefined') {
          new QRCode(qrBox, {
            text: ticket.qr_code_hash,
            width: 180,
            height: 180,
            colorDark: '#000000',
            colorLight: '#ffffff'
          });
        }
      }, 50);
    });

    openModal('modalTickets');
  }

  // ==========================================================================
  // 10. ระบบจัดการกะและการปิดกะ (Modal 3: Shift Closing Reconciliation)
  // ==========================================================================
  window.openShiftModal = function () {
    loadActiveShift();
    if (!activeShift) {
      alert('ขณะนี้ไม่มีกะเงินสดที่เปิดอยู่');
      return;
    }

    document.getElementById('shiftModalId').textContent = activeShift.shift_id;
    document.getElementById('shiftModalStatus').textContent = activeShift.status;
    document.getElementById('shiftModalCashier').textContent = activeShift.cashier_name;

    const openingFloat = activeShift.opening_float || 0;
    const cashSales = activeShift.cash_sales || 0;
    const cashPayouts = activeShift.cash_payouts || 0;
    const expected = openingFloat + cashSales - cashPayouts;

    document.getElementById('shiftFloatVal').textContent = `฿${openingFloat.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    document.getElementById('shiftSalesVal').textContent = `฿${cashSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    document.getElementById('shiftPayoutsVal').textContent = `฿${cashPayouts.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    document.getElementById('shiftExpectedVal').textContent = `฿${expected.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

    const input = document.getElementById('shiftCountedInput');
    if (input) input.value = '';
    onShiftCountChange();

    openModal('modalShift');
  };

  window.onShiftCountChange = function () {
    if (!activeShift) return;
    const input = document.getElementById('shiftCountedInput');
    const counted = parseFloat(input?.value) || 0;

    const recon = EventPayDB.calculateShiftVariance(activeShift.shift_id, counted);
    const banner = document.getElementById('shiftVarianceBanner');
    const valSpan = document.getElementById('shiftVarianceVal');
    const statusSpan = document.getElementById('shiftVarianceStatus');

    if (!recon || !banner || !valSpan) return;

    banner.className = 'ep-change-banner';

    if (!input.value) {
      valSpan.textContent = '฿0.00';
      statusSpan.textContent = 'กรุณาระบุยอดเงินสดที่นับได้จริงในลิ้นชัก';
      return;
    }

    valSpan.textContent = `฿${Math.abs(recon.variance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

    if (recon.status === 'BALANCED') {
      banner.classList.add('balanced');
      statusSpan.textContent = '✅ ยอดเงินสดในลิ้นชักถูกต้องพอดีเป๊ะ 100% (BALANCED)';
      valSpan.className = 'ep-change-val';
    } else if (recon.status === 'OVER') {
      banner.classList.add('balanced');
      statusSpan.textContent = '🔵 ยอดเงินสดในลิ้นชักเกินจากระบบ (CASH OVER)';
      valSpan.className = 'ep-change-val';
    } else {
      banner.classList.add('insufficient');
      statusSpan.textContent = '🚨 ยอดเงินสดในลิ้นชักขาดจากระบบ (CASH SHORT)';
      valSpan.className = 'ep-change-val text-red';
    }
  };

  window.submitCashPayout = function () {
    if (!activeShift) return;
    const amtInput = document.getElementById('payoutAmountInput');
    const reasonInput = document.getElementById('payoutReasonInput');

    const amt = parseFloat(amtInput?.value) || 0;
    const reason = reasonInput?.value.trim() || 'รายจ่ายหน้างาน';

    if (amt <= 0) {
      alert('กรุณาระบุจำนวนเงินที่ถูกต้อง');
      return;
    }

    EventPayDB.recordCashPayout(activeShift.shift_id, amt, reason, 'ทีมงานหน้างาน', 'USER-THEP');
    if (amtInput) amtInput.value = '';
    if (reasonInput) reasonInput.value = '';

    alert(`บันทึกจ่ายเงินสด ฿${amt.toLocaleString()} สำเร็จ!`);
    openShiftModal(); // refresh
  };

  window.submitCloseShift = function () {
    if (!activeShift) return;
    const input = document.getElementById('shiftCountedInput');
    const counted = parseFloat(input?.value);

    if (isNaN(counted)) {
      alert('กรุณากรอกยอดเงินสดที่นับได้จริงก่อนทำการปิดกะ');
      return;
    }

    if (!confirm(`ยืนยันการปิดกะ ${activeShift.shift_id} ด้วยยอดนับจริง ฿${counted.toLocaleString()} ใช่หรือไม่?`)) {
      return;
    }

    const result = EventPayDB.closeShift(activeShift.shift_id, counted, 'USER-STAFF-01');
    alert(`ปิดกะ ${activeShift.shift_id} เรียบร้อยแล้ว!\nส่วนต่าง: ฿${result.reconciliation.variance.toFixed(2)} (${result.reconciliation.status})`);
    closeModal('modalShift');
    loadActiveShift();
  };

  // ==========================================================================
  // 11. รายการคำสั่งซื้อและตั๋วที่ออกแล้ว (Modal 4: Order Manifest)
  // ==========================================================================
  window.openOrdersModal = function () {
    const container = document.getElementById('ordersListContainer');
    container.innerHTML = '';

    const orders = EventPayDB.getAll('orders').reverse();
    const tickets = EventPayDB.getAll('tickets');

    if (orders.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-dim); padding: 20px;">ยังไม่มีคำสั่งซื้อ</p>';
    } else {
      orders.forEach(order => {
        const orderTickets = tickets.filter(t => t.order_id === order.order_id);
        const card = document.createElement('div');
        card.style.cssText = 'background: #0d1527; border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 10px;';
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="color: var(--accent-gold); font-size: 0.95rem;">${order.order_id}</strong>
            <span style="font-size: 0.8rem; color: var(--accent-cyan);">${order.payment_method} | ฿${order.total_amount.toLocaleString()}</span>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 6px;">
            ผู้ซื้อ: <strong>${order.customer_name}</strong> | วันที่: ${new Date(order.created_at).toLocaleString('th-TH')}
          </div>
          <div style="font-size: 0.8rem; color: var(--accent-green); margin-bottom: 8px;">
            บัตร ${orderTickets.length} ใบ: ${orderTickets.map(t => `${t.tier_name} (${t.attendee_name})`).join(', ')}
          </div>
          <button type="button" class="ep-nav-btn" style="font-size: 0.78rem; padding: 4px 10px;" onclick='viewTicketsForOrder(${JSON.stringify(orderTickets)})'>
            🎟️ เปิดดู QR Code บัตรออเดอร์นี้
          </button>
        `;
        container.appendChild(card);
      });
    }

    openModal('modalOrders');
  };

  window.viewTicketsForOrder = function (tickets) {
    closeModal('modalOrders');
    openTicketsModal(tickets);
  };

  // ==========================================================================
  // 12. Helper เปิด-ปิด Modal
  // ==========================================================================
  window.openModal = function (modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('show');
  };

  window.closeModal = function (modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('show');
  };

  window.switchMainView = function (view) {
    // Single-page navigation handler
  };

})();

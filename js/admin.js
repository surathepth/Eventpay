/**
 * ============================================================================
 * EVENTPAY ADMIN AUDIT & FINANCIAL CONTROLLER (js/admin.js)
 * โครงการ: EventPay (Concert Payment & Secure Entry Platform)
 * พิกัด: D:\BillingApp\Antigravity\EventPay\js\admin.js
 * หน้าที่: ควบคุมแดชบอร์ดสถิติสด, ภาพหลักฐานสวมสิทธิ์, บัญชีกะเงินสด และ Audit Trail
 * ============================================================================
 */

(function () {
  'use strict';

  let currentTab = 'dashboard';
  let autoRefreshTimer = null;

  document.addEventListener('DOMContentLoaded', () => {
    initAdmin();
  });

  function initAdmin() {
    renderDashboardData();
    renderIncidentsTable();
    renderFinanceLedger();
    renderAuditLogsTable();
    updatePendingSlipsBadge();
    updateAdminNetBadge();
    loadFirebaseConfigInAdmin();
    initDropdowns();

    // คลิกพื้นที่สีดำด้านนอกเพื่อปิดโมดอลภาพถ่าย/สลิป (Backdrop Click to Close)
    const zoomModal = document.getElementById('modalPhotoZoom');
    if (zoomModal) {
      zoomModal.addEventListener('click', (e) => {
        if (e.target === zoomModal) {
          closeModal('modalPhotoZoom');
        }
      });
    }

    // ฟัง Real-time Broadcast จากเครื่องแม่ข่าย (ทันทีโดยไม่ต้องรอ 3 วินาที)
    if (EventPayDB && typeof EventPayDB.onSyncEvent === 'function') {
      EventPayDB.onSyncEvent((data) => {
        updatePendingSlipsBadge();
        if (currentTab === 'dashboard') renderDashboardData();
        else if (currentTab === 'incidents') renderIncidentsTable();
        else if (currentTab === 'finance') renderFinanceLedger();
        else if (currentTab === 'audit') renderAuditLogsTable();
      });
    }

    // Auto-Sync อัปเดตข้อมูลสดทุก 3 วินาที (เพื่อให้เห็นคนเข้างานและยอดขาย Real-time)
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => {
      updatePendingSlipsBadge();
      if (currentTab === 'dashboard') {
        renderDashboardData();
      }
    }, 3000);
  }

  async function updateAdminNetBadge() {
    const badge = document.getElementById('adminNetModeBadge');
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
  // 1. สลับหน้าแท็บในศูนย์บัญชาการ
  // ==========================================================================
  window.switchAdminTab = function (tabName) {
    currentTab = tabName;

    const tabs = ['dashboard', 'incidents', 'finance', 'audit', 'database', 'users', 'bankSettings'];
    tabs.forEach(t => {
      const btn = document.getElementById(`tabBtn${capitalize(t)}`);
      const view = document.getElementById(`adminView${capitalize(t)}`);
      if (btn) btn.classList.toggle('active', t === tabName);
      if (view) view.style.display = (t === tabName) ? 'block' : 'none';
    });

    if (tabName === 'dashboard') renderDashboardData();
    else if (tabName === 'incidents') renderIncidentsTable();
    else if (tabName === 'finance') renderFinanceLedger();
    else if (tabName === 'audit') renderAuditLogsTable();
    else if (tabName === 'users') renderUsersTable();
    else if (tabName === 'bankSettings') renderBankSettings();
  };

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ==========================================================================
  // 2. แดชบอร์ดสถิติสด (Tab 1: Live Dashboard)
  // ==========================================================================
  window.renderDashboardData = function () {
    const summary = EventPayDB.getDashboardSummary();
    const tickets = EventPayDB.getAll('tickets');
    const tiers = EventPayDB.getAll('ticket_tiers');

    // KPI 1-6
    const elInside = document.getElementById('kpiInsideAttendees');
    const elOutside = document.getElementById('kpiOutsideAttendees');
    const elInsidePct = document.getElementById('kpiInsidePercent');
    const elTotalSales = document.getElementById('kpiTotalSales');
    const elTotalTkts = document.getElementById('kpiTotalTickets');
    const elCashSales = document.getElementById('kpiCashSales');
    const elTransferSales = document.getElementById('kpiTransferSales');
    const elIncidents = document.getElementById('kpiTotalIncidents');

    if (elInside) elInside.textContent = summary.attendeesInside.toLocaleString();
    if (elOutside) elOutside.textContent = summary.attendeesRemaining.toLocaleString();

    const pct = summary.totalTicketsSold > 0 ? Math.round((summary.attendeesInside / summary.totalTicketsSold) * 100) : 0;
    if (elInsidePct) elInsidePct.textContent = `${pct}% ของบัตรที่ออกแล้ว`;

    if (elTotalSales) elTotalSales.textContent = `฿${summary.totalSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (elTotalTkts) elTotalTkts.textContent = `${summary.totalTicketsSold.toLocaleString()} ใบทั้งหมด`;
    if (elCashSales) elCashSales.textContent = `฿${summary.cashSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (elTransferSales) elTransferSales.textContent = `฿${summary.transferSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (elIncidents) elIncidents.textContent = summary.totalIncidents.toLocaleString();

    // ความจุฮอลล์ 7,500
    const hallCapacity = 7500;
    const hallPct = Math.min(100, Math.round((summary.attendeesInside / hallCapacity) * 100));
    const capBar = document.getElementById('capacityProgressBar');
    const capText = document.getElementById('capacityPercentText');
    if (capBar) capBar.style.width = `${hallPct}%`;
    if (capText) capText.textContent = `${summary.attendeesInside.toLocaleString()} / ${hallCapacity.toLocaleString()} คน (${hallPct}%)`;

    // สัดส่วนรายโซน
    renderZoneBreakdown(tiers, tickets);

    // Live Feed การสแกน
    renderLiveScanFeed(tickets);
  };

  function renderZoneBreakdown(tiers, tickets) {
    const container = document.getElementById('zoneBreakdownContainer');
    if (!container) return;
    container.innerHTML = '';

    tiers.forEach(tier => {
      const tierTickets = tickets.filter(t => t.tier_id === tier.tier_id);
      const insideCount = tierTickets.filter(t => t.gate_status === 'ENTERED').length;
      const soldCount = tierTickets.length;
      const zonePct = soldCount > 0 ? Math.round((insideCount / soldCount) * 100) : 0;

      const card = document.createElement('div');
      card.style.cssText = 'background: #0d1527; padding: 14px; border-radius: 8px; border: 1px solid var(--border-color);';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <strong style="color: #fff; font-size: 0.9rem;">${tier.name}</strong>
          <span style="color: var(--accent-gold); font-size: 0.85rem; font-weight: 700;">฿${tier.price.toLocaleString()}</span>
        </div>
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 8px;">
          เข้างานแล้ว: <strong style="color: var(--accent-green);">${insideCount}</strong> / ${soldCount} ใบ (${zonePct}%)
        </div>
        <div style="background: #1e293b; height: 8px; border-radius: 4px; overflow: hidden;">
          <div style="background: var(--accent-cyan); width: ${zonePct}%; height: 100%;"></div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function renderLiveScanFeed(tickets) {
    const tbody = document.getElementById('liveGateFeedBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // รวบรวม entry history ทั้งหมด
    const feed = [];
    tickets.forEach(t => {
      if (t.entry_history && Array.isArray(t.entry_history)) {
        t.entry_history.forEach(h => {
          feed.push({
            ticket_id: t.ticket_id,
            attendee_name: t.attendee_name,
            tier_name: t.tier_name,
            wristband_id: h.wristband_id || t.wristband_id,
            gate_id: h.gate_id || 'GATE-01',
            action: h.action,
            timestamp: h.timestamp
          });
        });
      }
    });

    feed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const recentFeed = feed.slice(0, 10);

    if (recentFeed.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 20px;">ยังไม่มีประวัติการสแกนผ่านประตู</td></tr>';
      return;
    }

    recentFeed.forEach(row => {
      const tr = document.createElement('tr');
      const timeStr = new Date(row.timestamp).toLocaleTimeString('th-TH');
      const actionBadge = row.action === 'FIRST_ENTRY'
        ? '<span class="ep-badge ep-badge-pass">เข้าครั้งแรก</span>'
        : '<span class="ep-badge ep-badge-info">เข้าซ้ำ</span>';

      tr.innerHTML = `
        <td>${timeStr}</td>
        <td><strong style="color: var(--accent-cyan);">${row.gate_id}</strong></td>
        <td><strong>${row.attendee_name}</strong></td>
        <td>${row.tier_name}</td>
        <td style="font-family: monospace;">${row.ticket_id}</td>
        <td style="font-family: monospace; color: var(--accent-gold);">${row.wristband_id || '-'}</td>
        <td>${actionBadge}</td>
        <td><span class="ep-badge ep-badge-pass">PASS</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ==========================================================================
  // 3. ตารางเหตุการณ์ความปลอดภัยและภาพถ่ายผู้สวมสิทธิ์ (Tab 2: Incidents)
  // ==========================================================================
  function renderIncidentsTable() {
    const tbody = document.getElementById('incidentsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const incidents = EventPayDB.getAll('security_incidents').reverse();

    if (incidents.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 30px;">✅ ยอดเยี่ยม! ไม่พบเหตุการณ์ความปลอดภัยหรือการสวมสิทธิ์</td></tr>';
      return;
    }

    incidents.forEach(inc => {
      const tr = document.createElement('tr');
      const timeStr = new Date(inc.created_at).toLocaleString('th-TH');
      const photoSrc = inc.snapshot_photo || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="50" height="50"%3E%3Crect width="50" height="50" fill="%23333"/%3E%3C/svg%3E';

      tr.innerHTML = `
        <td style="text-align: center;">
          <img src="${photoSrc}" alt="Suspect"
               style="width: 48px; height: 48px; border-radius: 6px; border: 2px solid var(--accent-red); object-fit: cover; cursor: pointer; background: #000;"
               onclick="openPhotoZoom('${photoSrc}', '${inc.incident_type}', '${escapeHtml(inc.notes)}', '${inc.ticket_id || '-'}')">
        </td>
        <td style="font-family: monospace; font-size: 0.8rem; color: var(--accent-gold);">${inc.incident_id}</td>
        <td>${timeStr}</td>
        <td><strong style="color: var(--accent-cyan);">${inc.gate_id}</strong></td>
        <td><span class="ep-badge ep-badge-danger">${inc.incident_type}</span></td>
        <td style="font-family: monospace;">${inc.ticket_id || '<span style="color: var(--text-dim);">-</span>'}</td>
        <td style="font-family: monospace; color: var(--accent-gold);">${inc.wristband_id || '-'}</td>
        <td style="color: #fca5a5;">${inc.notes}</td>
        <td>
          <button type="button" class="ep-nav-btn" style="font-size: 0.72rem; padding: 4px 8px;"
                  onclick="openPhotoZoom('${photoSrc}', '${inc.incident_type}', '${escapeHtml(inc.notes)}', '${inc.ticket_id || '-'}')">
            🔍 ดูหลักฐาน
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ==========================================================================
  // 4. บัญชีการเงินและกะเงินสด (Tab 3: Finance Ledger)
  // ==========================================================================
  function renderFinanceLedger() {
    renderProfitAndLossCard();
    renderFinancialCategories();
    renderExpensesTable();

    // 1. ตารางกะเงินสด
    const shiftsTbody = document.getElementById('shiftsTableBody');
    if (shiftsTbody) {
      shiftsTbody.innerHTML = '';
      const shifts = EventPayDB.getAll('cash_sessions').reverse();

      if (shifts.length === 0) {
        shiftsTbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--text-dim); padding: 20px;">ไม่มีข้อมูลกะเงินสด</td></tr>';
      } else {
        shifts.forEach(s => {
          const tr = document.createElement('tr');
          const statusBadge = s.status === 'OPEN'
            ? '<span class="ep-badge ep-badge-pass">เปิดกะ (OPEN)</span>'
            : '<span class="ep-badge ep-badge-info">ปิดกะแล้ว (CLOSED)</span>';

          const varianceBadge = s.variance === 0
            ? '<span class="ep-badge ep-badge-pass">฿0.00 พอดี</span>'
            : (s.variance > 0
                ? `<span class="ep-badge ep-badge-warning">+฿${s.variance.toFixed(2)} เกิน</span>`
                : `<span class="ep-badge ep-badge-danger">-฿${Math.abs(s.variance).toFixed(2)} ขาด</span>`);

          tr.innerHTML = `
            <td style="font-family: monospace; font-weight: 700; color: var(--accent-cyan);">${s.shift_id}</td>
            <td><strong>${s.cashier_name}</strong></td>
            <td>${s.desk_id}</td>
            <td>฿${(s.opening_float || 0).toLocaleString()}</td>
            <td style="color: var(--accent-green);">+฿${(s.cash_sales || 0).toLocaleString()}</td>
            <td style="color: var(--accent-red);">-฿${(s.cash_payouts || 0).toLocaleString()}</td>
            <td><strong>฿${(s.expected_cash || 0).toLocaleString()}</strong></td>
            <td><strong>฿${(s.counted_cash || 0).toLocaleString()}</strong></td>
            <td>${varianceBadge}</td>
            <td>${statusBadge}</td>
            <td style="font-size: 0.78rem;">
              เปิด: ${new Date(s.opened_at).toLocaleTimeString('th-TH')}<br>
              ${s.closed_at ? 'ปิด: ' + new Date(s.closed_at).toLocaleTimeString('th-TH') : '-'}
            </td>
          `;
          shiftsTbody.appendChild(tr);
        });
      }
    }

    // 2. ตารางคำสั่งซื้อ
    renderOrdersTable();
  }

  function renderOrdersTable() {
    const ordersTbody = document.getElementById('ordersTableBody');
    if (!ordersTbody) return;
    ordersTbody.innerHTML = '';
    const orders = EventPayDB.getAll('orders').reverse();
    const allPayments = EventPayDB.getAll('payments');

    if (orders.length === 0) {
      ordersTbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 20px;">ไม่มีคำสั่งซื้อ</td></tr>';
      return;
    }

    orders.forEach(o => {
      const tr = document.createElement('tr');
      const methodBadge = o.payment_method === 'CASH'
        ? '<span class="ep-badge ep-badge-warning">เงินสด</span>'
        : '<span class="ep-badge ep-badge-info">เงินโอน</span>';

      const payment = allPayments.find(p => p.order_id === o.order_id);
      const slipSrc = (payment && payment.slip_url) ? payment.slip_url : (o.slip_url || '');

      let statusHtml = '';
      let actionHtml = '';

      if (o.payment_method === 'TRANSFER') {
        if (o.payment_status === 'PENDING_VERIFICATION') {
          statusHtml = '<span class="ep-badge ep-badge-warning" style="animation: pulse 1.5s infinite; font-weight: 700;">🟡 รอตรวจสเตทเมนต์</span>';
          actionHtml = `
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              ${slipSrc ? `<button type="button" class="ep-nav-btn" style="font-size: 0.72rem; padding: 4px 8px; background: #0284c7; color: #fff;" onclick="openSlipInspection('${o.order_id}', '${payment ? payment.payment_id : ''}')">🖼️ ดูสลิปจริง</button>` : ''}
              <button type="button" class="ep-btn-submit" style="width: auto; font-size: 0.72rem; padding: 4px 10px; background: #10b981; color: #000; font-weight: 800;" onclick="approveTransferOrder('${o.order_id}', '${payment ? payment.payment_id : ''}')">✅ อนุมัติ &amp; เจนตั๋ว</button>
              <button type="button" class="ep-nav-btn" style="font-size: 0.72rem; padding: 4px 8px; background: #ef4444; color: #fff;" onclick="rejectTransferOrder('${o.order_id}', '${payment ? payment.payment_id : ''}')">🚨 สลิปปลอม</button>
            </div>
          `;
        } else if (o.payment_status === 'PAID') {
          statusHtml = '<span class="ep-badge ep-badge-pass">🟢 ชำระแล้ว (อนุมัติแล้ว)</span>';
          actionHtml = slipSrc ? `
            <button type="button" class="ep-nav-btn" style="font-size: 0.72rem; padding: 3px 8px;" onclick="openSlipInspection('${o.order_id}', '${payment ? payment.payment_id : ''}')">
              🖼️ ดูสลิป
            </button>
          ` : '<span style="color: var(--text-dim); font-size: 0.8rem;">เรียบร้อย</span>';
        } else if (o.payment_status === 'VOID') {
          statusHtml = '<span class="ep-badge ep-badge-danger">🔴 โมฆะ / สลิปปลอม</span>';
          actionHtml = slipSrc ? `
            <button type="button" class="ep-nav-btn" style="font-size: 0.72rem; padding: 3px 8px; background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #fca5a5;" onclick="openSlipInspection('${o.order_id}', '${payment ? payment.payment_id : ''}')">
              🖼️ ดูสลิป
            </button>
          ` : '<span style="color: #ef4444; font-size: 0.8rem;">ระงับแล้ว</span>';
        } else {
          statusHtml = `<span class="ep-badge">${o.payment_status}</span>`;
          actionHtml = '-';
        }
      } else {
        statusHtml = '<span class="ep-badge ep-badge-pass">ชำระเงินสดแล้ว</span>';
        actionHtml = '<span style="color: var(--text-dim); font-size: 0.8rem;">เงินสดหน้าเคาน์เตอร์</span>';
      }

      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: 700; color: var(--accent-gold);">${o.order_id}</td>
        <td>${new Date(o.created_at).toLocaleString('th-TH')}</td>
        <td><strong>${escapeHtml(o.customer_name)}</strong></td>
        <td>${escapeHtml(o.customer_phone || '-')}</td>
        <td><strong>฿${o.total_amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong></td>
        <td>${methodBadge}</td>
        <td style="font-family: monospace; font-size: 0.8rem;">${escapeHtml(o.bank_ref || (payment ? payment.bank_ref : '') || '-')}</td>
        <td>${statusHtml}</td>
        <td>${actionHtml}</td>
      `;
      ordersTbody.appendChild(tr);
    });

    updatePendingSlipsBadge();
  }

  window.updatePendingSlipsBadge = function () {
    const badge = document.getElementById('badgePendingSlipsTab');
    if (!badge || typeof EventPayDB === 'undefined' || !EventPayDB.getAll) return;
    const orders = EventPayDB.getAll('orders') || [];
    const pendingOrders = orders.filter(o => o.payment_method === 'TRANSFER' && o.payment_status === 'PENDING_VERIFICATION');
    if (pendingOrders.length > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = `🔴 รอตรวจ ${pendingOrders.length} รายการ`;
      badge.style.background = '#ef4444';
      badge.style.color = '#ffffff';
      badge.style.fontWeight = '800';
    } else {
      badge.style.display = 'none';
    }
  };

  // ==========================================================================
  // 4.1 สรุปงบกำไร-ขาดทุนสุทธิ (Profit & Loss / P&L Summary)
  // ==========================================================================
  function renderProfitAndLossCard() {
    if (!EventPayDB || typeof EventPayDB.getProfitAndLossSummary !== 'function') return;
    const pnl = EventPayDB.getProfitAndLossSummary();

    const elRev = document.getElementById('pnlTotalRevenue');
    const elExp = document.getElementById('pnlTotalExpense');
    const elNet = document.getElementById('pnlNetProfit');
    const elBadge = document.getElementById('pnlStatusBadge');
    const elTicketRev = document.getElementById('pnlTicketRevenue');

    if (elRev) elRev.textContent = `฿${pnl.totalRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (elTicketRev) elTicketRev.textContent = `บัตร: ฿${pnl.ticketRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (elExp) elExp.textContent = `฿${pnl.totalExpense.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (elNet) elNet.textContent = `฿${Math.abs(pnl.netProfit).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

    if (elBadge) {
      if (pnl.isProfitable) {
        elBadge.innerHTML = `<span class="ep-badge-pnl-profit">🟢 กำไรสุทธิ +฿${pnl.netProfit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>`;
      } else {
        elBadge.innerHTML = `<span class="ep-badge-pnl-loss">🔴 ขาดทุนสุทธิ -฿${Math.abs(pnl.netProfit).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>`;
      }
    }
  }

  // ==========================================================================
  // 4.2 หมวดหมู่รายได้ & ค่าใช้จ่าย (Categories Overview A5, A6, A7, A8)
  // ==========================================================================
  function renderFinancialCategories() {
    if (!EventPayDB) return;
    const revContainer = document.getElementById('revCategoriesList');
    const expContainer = document.getElementById('expCategoriesList');

    // หมวดหมู่รายได้ A5 & ตั๋ว A7
    if (revContainer) {
      const revCats = EventPayDB.getAll('revenue_categories');
      const tiers = EventPayDB.getAll('ticket_tiers');
      const pnl = typeof EventPayDB.getProfitAndLossSummary === 'function' ? EventPayDB.getProfitAndLossSummary() : null;

      revContainer.innerHTML = revCats.map(cat => {
        let catAmount = 0;
        if (pnl && Array.isArray(pnl.revenueByCategory)) {
          const match = pnl.revenueByCategory.find(r => r.category_id === cat.category_id);
          if (match) catAmount = match.amount;
        }

        const isRevTicket = cat.category_id === 'REV-TICKET';

        const tierDetails = isRevTicket ? `
          <div style="margin-top: 10px; padding: 10px 12px; background: rgba(0,0,0,0.3); border-left: 3px solid var(--accent-gold); border-radius: 4px; font-size: 0.8rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 700; color: var(--accent-gold);">🎟️ โซนและราคาบัตรคอนเสิร์ต (Ticket Tiers &amp; Pricing):</span>
              <button type="button" class="ep-nav-btn" style="font-size: 0.72rem; padding: 2px 8px; background: rgba(245, 158, 11, 0.2); border: 1px solid var(--accent-gold); color: #fde68a;" onclick="openTicketTierModal()">
                ➕ เพิ่มโซนใหม่
              </button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${tiers.map(t => `
                <div style="background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.4); padding: 4px 10px; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px;">
                  <span style="color: #fff; font-weight: 600;">${t.name}</span>
                  <span style="color: var(--accent-gold); font-weight: 700;">฿${(t.price || 0).toLocaleString()}</span>
                  <span style="color: var(--text-dim); font-size: 0.72rem;">(โควต้า: ${(t.quota || t.capacity || 0).toLocaleString()})</span>
                  <button type="button" style="background: none; border: none; cursor: pointer; color: var(--accent-cyan); font-size: 0.78rem; padding: 0 2px;" title="แก้ไขโซนบัตร" onclick="openTicketTierModal('${t.tier_id}')">✏️</button>
                  <button type="button" style="background: none; border: none; cursor: pointer; color: #f87171; font-size: 0.78rem; padding: 0 2px;" title="ลบโซนบัตร" onclick="deleteTicketTierClick('${t.tier_id}')">🗑️</button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : '';

        return `
          <div style="background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <div>
                <strong style="color: var(--accent-cyan); font-size: 0.9rem;">${cat.category_id}</strong>: 
                <span style="color: #fff; font-weight: 600;">${cat.name}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 700; color: var(--accent-green); font-size: 0.95rem;">฿${catAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                <button type="button" class="ep-nav-btn" style="font-size: 0.72rem; padding: 3px 8px; background: rgba(6, 182, 212, 0.15); border: 1px solid var(--accent-cyan); color: var(--accent-cyan);" onclick="openRevCategoryModal('${cat.category_id}')" title="แก้ไขชื่อ/รายละเอียด">✏️ แก้ไข</button>
                ${!isRevTicket ? `<button type="button" class="ep-nav-btn" style="font-size: 0.72rem; padding: 3px 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #fca5a5;" onclick="deleteRevCategoryClick('${cat.category_id}')" title="ลบหมวดหมู่นี้">🗑️ ลบ</button>` : `<span style="font-size: 0.7rem; color: var(--text-dim);" title="หมวดหมู่หลักของตั๋วคอนเสิร์ตห้ามลบ">(หมวดหลัก)</span>`}
              </div>
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">${cat.description || ''}</div>
            ${tierDetails}
          </div>
        `;
      }).join('');
    }

    // หมวดหมู่ค่าใช้จ่าย A6 & การจ่ายจริง A8
    if (expContainer) {
      const expCats = EventPayDB.getAll('expense_categories');
      const pnl = typeof EventPayDB.getProfitAndLossSummary === 'function' ? EventPayDB.getProfitAndLossSummary() : null;

      expContainer.innerHTML = expCats.map(cat => {
        let catAmount = 0;
        if (pnl && Array.isArray(pnl.expenseByCategory)) {
          const match = pnl.expenseByCategory.find(e => e.category_id === cat.category_id);
          if (match) catAmount = match.amount;
        }

        return `
          <div style="background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <div>
                <strong style="color: var(--accent-red); font-size: 0.9rem;">${cat.category_id}</strong>: 
                <span style="color: #fff; font-weight: 600;">${cat.name}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 700; color: #f87171; font-size: 0.95rem;">฿${catAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                <button type="button" class="ep-nav-btn" style="font-size: 0.72rem; padding: 3px 8px; background: rgba(245, 158, 11, 0.15); border: 1px solid var(--accent-gold); color: var(--accent-gold);" onclick="openExpCategoryModal('${cat.category_id}')" title="แก้ไขหมวดหมู่ค่าใช้จ่าย">✏️ แก้ไข</button>
                <button type="button" class="ep-nav-btn" style="font-size: 0.72rem; padding: 3px 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #fca5a5;" onclick="deleteExpCategoryClick('${cat.category_id}')" title="ลบหมวดหมู่ค่าใช้จ่าย">🗑️ ลบ</button>
              </div>
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">${cat.description || ''}</div>
          </div>
        `;
      }).join('');
    }
  }

  // ==========================================================================
  // 4.3 ตารางรายการค่าใช้จ่ายที่จ่ายจริง (Recorded Expenses Ledger)
  // ==========================================================================
  function renderExpensesTable() {
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const payouts = EventPayDB.getAll('cash_payouts').reverse();

    if (payouts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 20px;">ยังไม่มีรายการบันทึกค่าใช้จ่าย</td></tr>';
      return;
    }

    payouts.forEach(p => {
      const tr = document.createElement('tr');
      const catName = p.category_id || 'EXP-MISC';
      tr.innerHTML = `
        <td style="font-family: monospace; color: var(--accent-gold); font-weight: 700;">${p.payout_id}</td>
        <td>${new Date(p.created_at).toLocaleString('th-TH')}</td>
        <td><span class="ep-badge ep-badge-warning">${catName}</span></td>
        <td><strong>${p.payee || '-'}</strong></td>
        <td>${p.reason || '-'}</td>
        <td style="color: var(--accent-cyan);">${p.approved_by || '-'}</td>
        <td style="color: #f87171; font-weight: 700;">-฿${(p.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
        <td>
          <button type="button" class="ep-nav-btn" style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; padding: 4px 8px; font-size: 0.75rem;" onclick="voidExpenseClick('${p.payout_id}', ${p.amount})">
            🗑️ ยกเลิก (Void)
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ==========================================================================
  // 4.4 MODAL: บันทึกค่าใช้จ่ายงานคอนเสิร์ต (Expense Entry Modal)
  // ==========================================================================
  window.openExpenseModal = function (defaultCat = '') {
    const modal = document.getElementById('modalExpenseRecord');
    if (!modal) return;
    const catSelect = document.getElementById('expModalCategory');
    if (catSelect && EventPayDB) {
      const expCats = EventPayDB.getAll('expense_categories');
      catSelect.innerHTML = expCats.map(c => `
        <option value="${c.category_id}" ${c.category_id === defaultCat ? 'selected' : ''}>
          ${c.category_id} - ${c.name}
        </option>
      `).join('');
    }
    const amt = document.getElementById('expModalAmount');
    const payee = document.getElementById('expModalPayee');
    const reason = document.getElementById('expModalReason');
    const appBy = document.getElementById('expModalApprovedBy');
    if (amt) amt.value = '';
    if (payee) payee.value = '';
    if (reason) reason.value = '';
    if (appBy) appBy.value = 'เทพอภัย (ผัวจ๋า) / ผู้บริหาร';
    modal.classList.add('show');
    modal.style.display = 'flex';
  };

  window.closeExpenseModal = function () {
    const modal = document.getElementById('modalExpenseRecord');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
  };

  window.saveExpenseSubmit = function (e) {
    if (e) e.preventDefault();
    const cat = document.getElementById('expModalCategory')?.value;
    const amt = parseFloat(document.getElementById('expModalAmount')?.value) || 0;
    const payee = document.getElementById('expModalPayee')?.value.trim();
    const reason = document.getElementById('expModalReason')?.value.trim();
    const approvedBy = document.getElementById('expModalApprovedBy')?.value.trim() || 'ADMIN';

    if (amt <= 0) {
      alert('กรุณาระบุจำนวนเงินที่มากกว่า 0');
      return;
    }
    if (!reason || !payee) {
      alert('กรุณากรอกผู้รับเงินและเหตุผลการจ่ายให้ครบถ้วน');
      return;
    }

    try {
      const openShift = EventPayDB.getAll('cash_sessions', s => s.status === 'OPEN')[0];
      const shiftId = openShift ? openShift.shift_id : 'SHIFT-GENERAL-CORP';

      EventPayDB.recordCashPayout(shiftId, amt, reason, payee, approvedBy, '', cat);
      alert(`✅ บันทึกค่าใช้จ่าย ฿${amt.toLocaleString()} ในหมวด [${cat}] เรียบร้อยแล้ว!`);
      closeExpenseModal();
      renderFinanceLedger();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  // ==========================================================================
  // 4.5 MODAL: จัดการหมวดหมู่รายได้ (Revenue Category CRUD A5)
  // ==========================================================================
  window.openRevCategoryModal = function (catId = null) {
    const modal = document.getElementById('modalRevenueCategory');
    if (!modal) return;
    const title = document.getElementById('revCatModalTitle');
    const isEdit = document.getElementById('revCatIsEdit');
    const idInput = document.getElementById('revCatModalId');
    const nameInput = document.getElementById('revCatModalName');
    const descInput = document.getElementById('revCatModalDesc');

    if (catId) {
      const cat = EventPayDB.get('revenue_categories', catId);
      if (!cat) return;
      if (title) title.textContent = `✏️ แก้ไขหมวดหมู่รายได้: ${catId}`;
      if (isEdit) isEdit.value = '1';
      if (idInput) {
        idInput.value = cat.category_id;
        idInput.disabled = true;
      }
      if (nameInput) nameInput.value = cat.name || '';
      if (descInput) descInput.value = cat.description || '';
    } else {
      if (title) title.textContent = '➕ เพิ่มหมวดหมู่รายได้ใหม่';
      if (isEdit) isEdit.value = '0';
      if (idInput) {
        idInput.value = '';
        idInput.disabled = false;
      }
      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
    }
    modal.classList.add('show');
    modal.style.display = 'flex';
  };

  window.closeRevCategoryModal = function () {
    const modal = document.getElementById('modalRevenueCategory');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
  };

  window.saveRevCategorySubmit = function (e) {
    if (e) e.preventDefault();
    const isEdit = document.getElementById('revCatIsEdit')?.value === '1';
    const id = document.getElementById('revCatModalId')?.value.trim().toUpperCase();
    const name = document.getElementById('revCatModalName')?.value.trim();
    const desc = document.getElementById('revCatModalDesc')?.value.trim();

    if (!id || !name) {
      alert('กรุณากรอกรหัสและชื่อหมวดหมู่รายได้ให้ครบถ้วน');
      return;
    }

    try {
      if (isEdit) {
        EventPayDB.update('revenue_categories', id, { name, description: desc });
        alert(`✅ แก้ไขหมวดหมู่รายได้ [${id}] สำเร็จเรียบร้อยแล้วค่ะ!`);
      } else {
        if (EventPayDB.get('revenue_categories', id)) {
          alert(`❌ รหัสหมวดหมู่ [${id}] มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่นค่ะ`);
          return;
        }
        EventPayDB.insert('revenue_categories', { category_id: id, name, description: desc });
        alert(`✅ เพิ่มหมวดหมู่รายได้ใหม่ [${id}] สำเร็จเรียบร้อยแล้วค่ะ!`);
      }
      closeRevCategoryModal();
      renderFinanceLedger();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  window.deleteRevCategoryClick = function (catId) {
    if (catId === 'REV-TICKET') {
      alert('❌ หมวดหมู่ REV-TICKET เป็นหมวดหมู่หลักของระบบการจำหน่ายตั๋วคอนเสิร์ต ห้ามลบเด็ดขาดค่ะ');
      return;
    }
    if (!confirm(`คุณต้องการลบหมวดหมู่รายได้ [${catId}] ใช่หรือไม่?`)) return;
    try {
      EventPayDB.delete('revenue_categories', catId);
      alert(`✅ ลบหมวดหมู่รายได้ [${catId}] เรียบร้อยแล้วค่ะ`);
      renderFinanceLedger();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  // ==========================================================================
  // 4.6 MODAL: จัดการหมวดหมู่ค่าใช้จ่าย (Expense Category CRUD A6)
  // ==========================================================================
  window.openExpCategoryModal = function (catId = null) {
    const modal = document.getElementById('modalExpenseCategory');
    if (!modal) return;
    const title = document.getElementById('expCatModalTitle');
    const isEdit = document.getElementById('expCatIsEdit');
    const idInput = document.getElementById('expCatModalId');
    const nameInput = document.getElementById('expCatModalName');
    const descInput = document.getElementById('expCatModalDesc');

    if (catId) {
      const cat = EventPayDB.get('expense_categories', catId);
      if (!cat) return;
      if (title) title.textContent = `✏️ แก้ไขหมวดหมู่ค่าใช้จ่าย: ${catId}`;
      if (isEdit) isEdit.value = '1';
      if (idInput) {
        idInput.value = cat.category_id;
        idInput.disabled = true;
      }
      if (nameInput) nameInput.value = cat.name || '';
      if (descInput) descInput.value = cat.description || '';
    } else {
      if (title) title.textContent = '➕ เพิ่มหมวดหมู่ค่าใช้จ่ายใหม่';
      if (isEdit) isEdit.value = '0';
      if (idInput) {
        idInput.value = '';
        idInput.disabled = false;
      }
      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
    }
    modal.classList.add('show');
    modal.style.display = 'flex';
  };

  window.closeExpCategoryModal = function () {
    const modal = document.getElementById('modalExpenseCategory');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
  };

  window.saveExpCategorySubmit = function (e) {
    if (e) e.preventDefault();
    const isEdit = document.getElementById('expCatIsEdit')?.value === '1';
    const id = document.getElementById('expCatModalId')?.value.trim().toUpperCase();
    const name = document.getElementById('expCatModalName')?.value.trim();
    const desc = document.getElementById('expCatModalDesc')?.value.trim();

    if (!id || !name) {
      alert('กรุณากรอกรหัสและชื่อหมวดหมู่ค่าใช้จ่ายให้ครบถ้วน');
      return;
    }

    try {
      if (isEdit) {
        EventPayDB.update('expense_categories', id, { name, description: desc });
        alert(`✅ แก้ไขหมวดหมู่ค่าใช้จ่าย [${id}] สำเร็จเรียบร้อยแล้วค่ะ!`);
      } else {
        if (EventPayDB.get('expense_categories', id)) {
          alert(`❌ รหัสหมวดหมู่ [${id}] มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่นค่ะ`);
          return;
        }
        EventPayDB.insert('expense_categories', { category_id: id, name, description: desc });
        alert(`✅ เพิ่มหมวดหมู่ค่าใช้จ่ายใหม่ [${id}] สำเร็จเรียบร้อยแล้วค่ะ!`);
      }
      closeExpCategoryModal();
      renderFinanceLedger();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  window.deleteExpCategoryClick = function (catId) {
    if (!confirm(`คุณต้องการลบหมวดหมู่ค่าใช้จ่าย [${catId}] ใช่หรือไม่?`)) return;
    try {
      EventPayDB.delete('expense_categories', catId);
      alert(`✅ ลบหมวดหมู่ค่าใช้จ่าย [${catId}] เรียบร้อยแล้วค่ะ`);
      renderFinanceLedger();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  // ==========================================================================
  // 4.7 MODAL: จัดการราคาและโซนบัตรคอนเสิร์ต (Ticket Tier & Pricing CRUD A7)
  // ==========================================================================
  window.openTicketTierModal = function (tierId = null) {
    const modal = document.getElementById('modalTicketTier');
    if (!modal) return;
    const title = document.getElementById('tierModalTitle');
    const isEdit = document.getElementById('tierIsEdit');
    const idInput = document.getElementById('tierModalId');
    const nameInput = document.getElementById('tierModalName');
    const priceInput = document.getElementById('tierModalPrice');
    const quotaInput = document.getElementById('tierModalQuota');

    if (tierId) {
      const tier = EventPayDB.get('ticket_tiers', tierId);
      if (!tier) return;
      if (title) title.textContent = `🎟️ ปรับราคา / โควต้าโซนบัตร: ${tier.name}`;
      if (isEdit) isEdit.value = '1';
      if (idInput) {
        idInput.value = tier.tier_id;
        idInput.disabled = true;
      }
      if (nameInput) nameInput.value = tier.name || '';
      if (priceInput) priceInput.value = tier.price || 0;
      if (quotaInput) quotaInput.value = tier.quota || tier.capacity || 0;
    } else {
      if (title) title.textContent = '🎟️ เพิ่มโซนบัตรและกำหนดราคาใหม่';
      if (isEdit) isEdit.value = '0';
      if (idInput) {
        idInput.value = '';
        idInput.disabled = false;
      }
      if (nameInput) nameInput.value = '';
      if (priceInput) priceInput.value = '';
      if (quotaInput) quotaInput.value = '';
    }
    modal.classList.add('show');
    modal.style.display = 'flex';
  };

  window.closeTicketTierModal = function () {
    const modal = document.getElementById('modalTicketTier');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
  };

  window.saveTicketTierSubmit = function (e) {
    if (e) e.preventDefault();
    const isEdit = document.getElementById('tierIsEdit')?.value === '1';
    const id = document.getElementById('tierModalId')?.value.trim().toUpperCase();
    const name = document.getElementById('tierModalName')?.value.trim();
    const price = parseFloat(document.getElementById('tierModalPrice')?.value) || 0;
    const quota = parseInt(document.getElementById('tierModalQuota')?.value, 10) || 0;

    if (!id || !name || price < 0 || quota <= 0) {
      alert('กรุณากรอกรหัสโซนบัตร, ชื่อ, ราคา และจำนวนโควต้าให้ถูกต้องครบถ้วนค่ะ');
      return;
    }

    try {
      if (isEdit) {
        EventPayDB.update('ticket_tiers', id, {
          name,
          price,
          quota,
          capacity: quota
        });
        alert(`✅ ปรับข้อมูลโซนบัตร [${name}] สำเร็จเรียบร้อยแล้วค่ะ!`);
      } else {
        if (EventPayDB.get('ticket_tiers', id)) {
          alert(`❌ รหัสโซนบัตร [${id}] มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่นค่ะ`);
          return;
        }
        EventPayDB.insert('ticket_tiers', {
          tier_id: id,
          name,
          price,
          quota,
          capacity: quota
        });
        alert(`✅ เพิ่มโซนบัตรใหม่ [${name}] (฿${price.toLocaleString()}) สำเร็จเรียบร้อยแล้วค่ะ!`);
      }
      closeTicketTierModal();
      renderFinanceLedger();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  window.deleteTicketTierClick = function (tierId) {
    const tier = EventPayDB.get('ticket_tiers', tierId);
    const tierName = tier ? tier.name : tierId;
    if (!confirm(`คุณต้องการลบโซนบัตร "${tierName}" ใช่หรือไม่?`)) return;
    try {
      EventPayDB.delete('ticket_tiers', tierId);
      alert(`✅ ลบโซนบัตร "${tierName}" เรียบร้อยแล้วค่ะ`);
      renderFinanceLedger();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  // ==========================================================================
  // 4.8 ตรวจสอบและยกเลิกรายการจ่ายเงิน (Void Expense A8)
  // ==========================================================================
  window.voidExpenseClick = function (payoutId, amount) {
    const reason = prompt(`กรุณาระบุเหตุผลในการยกเลิกรายการจ่ายเงิน ${payoutId} (฿${(amount || 0).toLocaleString()}):`, 'ระบุข้อมูลผิดพลาด / ยกเลิกรายการ');
    if (!reason || !reason.trim()) return;

    try {
      const operator = (typeof EventPayAuth !== 'undefined' && EventPayAuth.getCurrentUser())
        ? EventPayAuth.getCurrentUser().name
        : 'ผู้บริหาร (เทพอภัย)';

      EventPayDB.voidCashPayout(payoutId, reason.trim(), operator);
      alert(`✅ ยกเลิกรายการจ่ายเงิน ${payoutId} สำเร็จ ยอดเงินสดได้คืนเข้าสู่ลิ้นชักเรียบร้อยแล้วค่ะ!`);
      renderFinanceLedger();
    } catch (err) {
      alert('❌ ไม่สามารถยกเลิกรายการจ่ายเงินได้: ' + err.message);
    }
  };

  // ==========================================================================
  // 5. ประวัติการทำงานย้อนหลัง (Tab 4: Immutable Audit Trail)
  // ==========================================================================
  function renderAuditLogsTable(searchQuery = '') {
    const tbody = document.getElementById('auditLogsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const logs = EventPayDB.getAll('audit_logs').reverse();
    const query = searchQuery.toLowerCase().trim();

    const filtered = query
      ? logs.filter(l =>
          l.log_id.toLowerCase().includes(query) ||
          l.action.toLowerCase().includes(query) ||
          l.category.toLowerCase().includes(query) ||
          l.operator_id.toLowerCase().includes(query) ||
          l.details.toLowerCase().includes(query)
        )
      : logs;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 20px;">ไม่พบประวัติ Audit Log ที่ค้นหา</td></tr>';
      return;
    }

    filtered.forEach(log => {
      const tr = document.createElement('tr');
      const timeStr = new Date(log.timestamp).toLocaleString('th-TH');

      tr.innerHTML = `
        <td style="font-family: monospace; font-size: 0.78rem; color: var(--accent-cyan);">${log.log_id}</td>
        <td>${timeStr}</td>
        <td><span class="ep-badge ep-badge-purple">${log.category}</span></td>
        <td><strong>${log.action}</strong></td>
        <td>${log.operator_id}</td>
        <td style="max-width: 380px; word-break: break-word;">${log.details}</td>
        <td style="font-size: 0.78rem; color: var(--text-dim);">${log.ip_or_device || 'Console'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  window.filterAuditLogs = function () {
    const input = document.getElementById('auditSearchInput');
    renderAuditLogsTable(input ? input.value : '');
  };

  // ==========================================================================
  // 6. การสำรองข้อมูลและการบำรุงรักษา (Tab 5: Database JSON Export & Reset)
  // ==========================================================================
  window.exportFullDatabaseJSON = function () {
    try {
      const jsonStr = EventPayDB.exportJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const now = new Date().toISOString().replace(/[:.]/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = `eventpay_backup_${now}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('✅ ส่งออกและดาวน์โหลดไฟล์สำรองข้อมูลฐานข้อมูล JSON เรียบร้อยแล้ว!');
    } catch (e) {
      alert('เกิดข้อผิดพลาดในการส่งออกข้อมูล: ' + e.message);
    }
  };

  window.confirmResetDatabase = function () {
    if (!confirm('⚠️ คำเตือนสำคัญ:\nคุณแน่ใจหรือไม่ว่าต้องการรีเซ็ตฐานข้อมูลเป็นค่าตั้งต้น?\nข้อมูลการขายและการสแกนจริงทั้งหมดจะถูกรีเซ็ตกลับเป็น Seed Data')) {
      return;
    }
    EventPayDB.resetDatabase();
    alert('✅ รีเซ็ตฐานข้อมูลเป็น Mock Seed Data เริ่มต้นเรียบร้อยแล้ว!');
    renderDashboardData();
    renderIncidentsTable();
    renderFinanceLedger();
    renderAuditLogsTable();
  };

  // ==========================================================================
  // 7. ซูมภาพถ่ายหลักฐานใบหน้า (Photo Zoom Modal) & UNIVERSAL CLOSE MODAL
  // ==========================================================================
  window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
    }
  };

  window.openPhotoZoom = function (imgSrc, title, notes, tktId) {
    const modal = document.getElementById('modalPhotoZoom');
    const modalImg = document.getElementById('zoomModalImg');
    const modalTitle = document.getElementById('zoomModalTitle');
    const modalDetails = document.getElementById('zoomModalDetails');

    if (modalImg) modalImg.src = imgSrc;
    if (modalTitle) modalTitle.textContent = `🚨 หลักฐาน: ${title}`;
    if (modalDetails) {
      modalDetails.innerHTML = `
        <div><strong>รหัสตั๋วที่นำมาสแกน:</strong> ${tktId}</div>
        <div style="margin-top: 6px;"><strong>รายละเอียดข้อผิดพลาด:</strong> ${notes}</div>
        <div style="margin-top: 6px; color: var(--accent-cyan);"><strong>คำสั่งการ์ด:</strong> เชิญตัวผู้ต้องสงสัยออกไปจุดตรวจสอบหน้าประตู</div>
      `;
    }
    if (modal) modal.classList.add('show');
  };

  // ==========================================================================
  // REAL TRANSFER SLIP INSPECTION & 3-MINUTE APPROVAL LOGIC
  // ==========================================================================
  window.openSlipInspection = function (orderId, paymentId) {
    const order = EventPayDB.get('orders', orderId);
    let payment = paymentId ? EventPayDB.get('payments', paymentId) : null;
    if (!payment && order) {
      payment = EventPayDB.getAll('payments').find(p => p.order_id === orderId);
    }

    const modal = document.getElementById('modalPhotoZoom');
    const modalImg = document.getElementById('zoomModalImg');
    const modalTitle = document.getElementById('zoomModalTitle');
    const modalDetails = document.getElementById('zoomModalDetails');

    const slipSrc = (payment && payment.slip_url) ? payment.slip_url : (order ? order.slip_url : '');
    const bankRef = (payment && payment.bank_ref) ? payment.bank_ref : (order ? order.bank_ref : '-');
    const amount = order ? order.total_amount : (payment ? payment.amount : 0);
    const custName = order ? order.customer_name : '-';
    const custPhone = order ? order.customer_phone : '-';

    if (modalImg) {
      modalImg.src = slipSrc || 'assets/placeholder-slip.png';
      modalImg.style.maxHeight = '420px';
    }
    if (modalTitle) modalTitle.textContent = `🧾 ตรวจสอบสลิปโอนเงิน (Order: ${orderId})`;
    if (modalDetails) {
      const isPending = order && order.payment_status === 'PENDING_VERIFICATION';
      modalDetails.innerHTML = `
        <div style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); line-height: 1.8; font-size: 0.88rem;">
          <div><strong>ชื่อลูกค้า:</strong> ${escapeHtml(custName)} (โทร: ${escapeHtml(custPhone)})</div>
          <div><strong>ยอดเงินที่ต้องเข้าสเตทเมนต์:</strong> <strong style="color: var(--accent-gold); font-size: 1.15rem;">฿${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong></div>
          <div><strong>เลขอ้างอิงสลิป:</strong> <span style="font-family: monospace; color: var(--accent-cyan); font-weight: 700;">${escapeHtml(bankRef)}</span></div>
          <div><strong>สถานะปัจจุบัน:</strong> <span class="ep-badge ${isPending ? 'ep-badge-warning' : (order && order.payment_status === 'PAID' ? 'ep-badge-pass' : 'ep-badge-danger')}">${order ? order.payment_status : '-'}</span></div>
        </div>

        ${isPending ? `
          <div style="margin-top: 14px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="ep-btn-submit" style="width: auto; padding: 10px 18px; font-size: 0.9rem; background: #10b981; color: #000; font-weight: 800;" onclick="approveTransferOrder('${orderId}', '${payment ? payment.payment_id : ''}', true)">
              ✅ ยืนยันเงินเข้าสเตทเมนต์ &amp; เจนตั๋วให้ลูกค้าทันที
            </button>
            <button type="button" class="ep-nav-btn" style="padding: 10px 18px; font-size: 0.9rem; background: #ef4444; color: #fff; font-weight: 700;" onclick="rejectTransferOrder('${orderId}', '${payment ? payment.payment_id : ''}', true)">
              🚨 สลิปปลอม / ระงับคำสั่งซื้อ
            </button>
          </div>
        ` : ''}
      `;
    }
    if (modal) modal.classList.add('show');
  };

  window.approveTransferOrder = function (orderId, paymentId, closeModalAfter = false) {
    if (!confirm(`ยืนยันว่า "ตรวจพบยอดเงินในสเตทเมนต์ธนาคารจริง" สำหรับคำสั่งซื้อ ${orderId} ใช่หรือไม่?\n\nเมื่อยืนยันแล้ว:\n1. ออกใบเสร็จรับเงินทางการทันที\n2. เจนคิวอาร์โค้ด e-Ticket ส่งตรงถึงหน้าจอมือถือลูกค้าทันทีแบบเรียลไทม์`)) {
      return;
    }

    const currentUser = (typeof AuthGuard !== 'undefined' && AuthGuard.getCurrentUser()) ? AuthGuard.getCurrentUser().user_id : 'ADMIN-FINANCE';

    if (!paymentId) {
      const p = EventPayDB.getAll('payments').find(x => x.order_id === orderId);
      paymentId = p ? p.payment_id : null;
    }

    if (paymentId && typeof EventPayDB !== 'undefined' && EventPayDB.confirmPayment) {
      EventPayDB.confirmPayment(paymentId, currentUser);
    } else {
      EventPayDB.update('orders', orderId, { payment_status: 'PAID' });
      const tickets = EventPayDB.getAll('tickets', t => t.order_id === orderId);
      tickets.forEach(t => EventPayDB.update('tickets', t.ticket_id, { is_void: false }));
    }

    alert(`✅ ยืนยันการเงินสำเร็จ!\nคำสั่งซื้อ ${orderId} ได้รับการอนุมัติแล้ว\nระบบได้ออกใบเสร็จรับเงินและส่งตั๋ว e-Ticket ไปยังหน้าจอลูกค้าเรียบร้อยแล้วค่ะ`);

    if (closeModalAfter) {
      closeModal('modalPhotoZoom');
    }
    renderOrdersTable();
    renderFinanceLedger();
    updatePendingSlipsBadge();
  };

  window.rejectTransferOrder = function (orderId, paymentId, closeModalAfter = false) {
    const reason = prompt('กรุณาระบุเหตุผลการระงับคำสั่งซื้อ (เช่น สลิปปลอม, ยอดเงินไม่เข้าสเตทเมนต์):', 'สลิปปลอม / ไม่พบยอดเงินในบัญชีธนาคาร');
    if (!reason) return;

    const currentUser = (typeof AuthGuard !== 'undefined' && AuthGuard.getCurrentUser()) ? AuthGuard.getCurrentUser().user_id : 'ADMIN-FINANCE';

    if (!paymentId) {
      const p = EventPayDB.getAll('payments').find(x => x.order_id === orderId);
      paymentId = p ? p.payment_id : null;
    }

    if (paymentId && typeof EventPayDB !== 'undefined' && EventPayDB.rejectPayment) {
      EventPayDB.rejectPayment(paymentId, currentUser, reason);
    } else {
      EventPayDB.update('orders', orderId, { payment_status: 'VOID' });
      const tickets = EventPayDB.getAll('tickets', t => t.order_id === orderId);
      tickets.forEach(t => EventPayDB.update('tickets', t.ticket_id, { is_void: true }));
      EventPayDB.logAudit('REJECT_ORDER', 'FINANCE', `ระงับคำสั่งซื้อ ${orderId} เหตุผล: ${reason}`, currentUser);
    }

    alert(`🚨 ระงับคำสั่งซื้อ ${orderId} เรียบร้อยแล้ว!\nบัตรคอนเสิร์ตทั้งหมดถูกล็อกเป็นโมฆะ หากผู้ต้องสงสัยนำไปสแกนที่ Kiosk หน้าประตู ระบบจะลั่นไซเรนเตือนภัยทันทีค่ะ`);

    if (closeModalAfter) {
      closeModal('modalPhotoZoom');
    }
    renderOrdersTable();
    renderFinanceLedger();
    updatePendingSlipsBadge();
  };

  // ==========================================================================
  // 8. การจัดการ FIREBASE CLOUD SYNC
  // ==========================================================================
  function loadFirebaseConfigInAdmin() {
    if (typeof EventPayFirebase === 'undefined') return;
    const cfg = EventPayFirebase.config;
    const statusText = document.getElementById('firebaseSyncStatusText');

    if (cfg && cfg.projectId) {
      if (statusText) statusText.textContent = `🟢 ระบบเชื่อมต่อ Cloud อัตโนมัติเรียบร้อย (Project: ${cfg.projectId})`;
    } else {
      if (statusText) statusText.textContent = '⚪ กำลังเชื่อมต่อ Cloud...';
    }
  }

  window.saveFirebaseConfigFromAdmin = function () {
    if (typeof EventPayFirebase === 'undefined') {
      alert('ไม่พบ Firebase Adapter');
      return;
    }
    const proj = document.getElementById('cfgFirebaseProjectId')?.value.trim();
    const key = document.getElementById('cfgFirebaseApiKey')?.value.trim();
    const statusText = document.getElementById('firebaseSyncStatusText');

    if (!proj) {
      alert('กรุณาระบุ Firebase Project ID');
      return;
    }

    EventPayFirebase.saveConfig({ projectId: proj, apiKey: key });
    if (statusText) statusText.textContent = `🟢 บันทึกสำเร็จ: ${proj}`;
    alert('✅ บันทึกการตั้งค่า Firebase เรียบร้อยแล้ว!');
  };

  window.triggerCloudSyncFromAdmin = async function () {
    if (typeof EventPayFirebase === 'undefined') {
      alert('ไม่พบ Firebase Adapter');
      return;
    }
    const statusText = document.getElementById('firebaseSyncStatusText');
    if (statusText) statusText.textContent = '⏳ กำลังส่งข้อมูลขึ้น Firebase Cloud...';

    const res = await EventPayFirebase.syncToCloud(EventPayDB);
    if (res.success) {
      if (statusText) statusText.textContent = `✅ ${res.message} (เวลา: ${new Date(res.syncedAt).toLocaleTimeString('th-TH')})`;
      alert(`✅ ${res.message}\nคำสั่งซื้อ: ${res.recordsSynced.orders}\nตั๋ว: ${res.recordsSynced.tickets}\nIncidents: ${res.recordsSynced.incidents}`);
    } else {
      if (statusText) statusText.textContent = `⚠️ ${res.message}`;
      alert(`⚠️ การซิงก์แจ้งเตือน: ${res.message}`);
    }
  };

  // ==========================================================================
  // 6. การจัดการผู้ใช้งานและสิทธิ์ (Tab 6: Users & RBAC Management)
  // ==========================================================================
  window.renderUsersTable = function () {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    if (typeof EventPayAuth === 'undefined') {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#f87171;">ไม่พบโมดูล EventPayAuth</td></tr>';
      return;
    }

    const users = EventPayAuth.getUsers();
    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">ไม่พบข้อมูลผู้ใช้งาน</td></tr>';
      return;
    }

    tbody.innerHTML = users.map((u, idx) => {
      const p = u.permissions || {};
      const bookingPill = p.booking ? '<span class="ep-perm-pill ep-perm-yes">✓ booking.html</span>' : '<span class="ep-perm-pill ep-perm-no">✗ booking.html</span>';
      const indexPill = p.index ? '<span class="ep-perm-pill ep-perm-yes">✓ index.html</span>' : '<span class="ep-perm-pill ep-perm-no">✗ index.html</span>';
      const kioskPill = p.kiosk ? '<span class="ep-perm-pill ep-perm-yes">✓ kiosk.html</span>' : '<span class="ep-perm-pill ep-perm-no">✗ kiosk.html</span>';
      const adminPill = p.admin ? '<span class="ep-perm-pill ep-perm-yes">✓ admin.html</span>' : '<span class="ep-perm-pill ep-perm-no">✗ admin.html</span>';

      const isMasterAdmin = u.username === 'admin';
      const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString('th-TH') : '-';

      return `
        <tr>
          <td style="font-weight: 700; color: #fff;">${idx + 1}</td>
          <td>
            <strong style="color: var(--accent-gold); font-size: 0.95rem;">${u.username}</strong>
            ${isMasterAdmin ? '<span style="background: #4338ca; color:#fff; font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">MASTER</span>' : ''}
          </td>
          <td style="color: #fff;">${u.name || '-'}</td>
          <td>
            <span style="background: rgba(6,182,212,0.15); color: var(--accent-cyan); border: 1px solid var(--accent-cyan); padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">
              ${u.role || 'STAFF'}
            </span>
          </td>
          <td>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
              ${bookingPill} ${indexPill} ${kioskPill} ${adminPill}
            </div>
          </td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${dateStr}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="ep-nav-btn" style="font-size: 0.75rem; padding: 4px 10px; background: #1e293b;" onclick="openUserModal('${u.user_id}')">
                ✏️ แก้ไข
              </button>
              ${!isMasterAdmin ? `
                <button type="button" class="ep-nav-btn" style="font-size: 0.75rem; padding: 4px 8px; background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #fca5a5;" onclick="deleteUserClick('${u.user_id}', '${u.username}')">
                  🗑️ ลบ
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  };

  window.openUserModal = function (userId = null) {
    const modal = document.getElementById('adminUserModal');
    if (!modal) return;

    const title = document.getElementById('userModalTitle');
    const uId = document.getElementById('userModalUserId');
    const uName = document.getElementById('userModalUsername');
    const uPass = document.getElementById('userModalPassword');
    const uFullName = document.getElementById('userModalName');
    const uRole = document.getElementById('userModalRole');
    const pBooking = document.getElementById('permBooking');
    const pIndex = document.getElementById('permIndex');
    const pKiosk = document.getElementById('permKiosk');
    const pAdmin = document.getElementById('permAdmin');
    const passHint = document.getElementById('userModalPassHint');

    if (userId) {
      const user = EventPayAuth.getUser(userId);
      if (!user) return;
      if (title) title.textContent = '✏️ แก้ไขข้อมูลผู้ใช้งาน';
      if (uId) uId.value = user.user_id;
      if (uName) {
        uName.value = user.username;
        uName.disabled = true;
      }
      if (uPass) {
        uPass.value = '';
        uPass.required = false;
      }
      if (passHint) passHint.style.display = 'block';
      if (uFullName) uFullName.value = user.name || '';
      if (uRole) uRole.value = user.role || 'STAFF';

      const p = user.permissions || {};
      if (pBooking) pBooking.checked = !!p.booking;
      if (pIndex) pIndex.checked = !!p.index;
      if (pKiosk) pKiosk.checked = !!p.kiosk;
      if (pAdmin) {
        pAdmin.checked = !!p.admin;
        if (user.username === 'admin') pAdmin.disabled = true;
        else pAdmin.disabled = false;
      }
    } else {
      if (title) title.textContent = '➕ เพิ่มผู้ใช้งานใหม่';
      if (uId) uId.value = '';
      if (uName) {
        uName.value = '';
        uName.disabled = false;
      }
      if (uPass) {
        uPass.value = '';
        uPass.required = true;
      }
      if (passHint) passHint.style.display = 'none';
      if (uFullName) uFullName.value = '';
      if (uRole) uRole.value = 'STAFF';
      if (pBooking) pBooking.checked = true;
      if (pIndex) pIndex.checked = true;
      if (pKiosk) pKiosk.checked = true;
      if (pAdmin) {
        pAdmin.checked = false;
        pAdmin.disabled = false;
      }
    }

    modal.style.display = 'flex';
  };

  window.closeUserModal = function () {
    const modal = document.getElementById('adminUserModal');
    if (modal) modal.style.display = 'none';
  };

  window.saveUserSubmit = function (e) {
    if (e) e.preventDefault();

    const uId = document.getElementById('userModalUserId')?.value.trim();
    const uName = document.getElementById('userModalUsername')?.value.trim();
    const uPass = document.getElementById('userModalPassword')?.value.trim();
    const uFullName = document.getElementById('userModalName')?.value.trim();
    const uRole = document.getElementById('userModalRole')?.value;
    const pBooking = !!document.getElementById('permBooking')?.checked;
    const pIndex = !!document.getElementById('permIndex')?.checked;
    const pKiosk = !!document.getElementById('permKiosk')?.checked;
    const pAdmin = !!document.getElementById('permAdmin')?.checked;

    try {
      if (uId) {
        const updates = {
          name: uFullName,
          role: uRole,
          permissions: {
            booking: pBooking,
            index: pIndex,
            kiosk: pKiosk,
            admin: pAdmin
          }
        };
        if (uPass) updates.password = uPass;

        EventPayAuth.updateUser(uId, updates);
        alert('✅ แก้ไขข้อมูลผู้ใช้งานเรียบร้อยแล้ว!');
      } else {
        if (!uName || !uPass) {
          alert('กรุณากรอก Username และ Password');
          return;
        }
        EventPayAuth.createUser({
          username: uName,
          password: uPass,
          name: uFullName || uName,
          role: uRole,
          permissions: {
            booking: pBooking,
            index: pIndex,
            kiosk: pKiosk,
            admin: pAdmin
          }
        });
        alert(`✅ สร้างผู้ใช้งาน "${uName}" สำเร็จเรียบร้อยแล้ว!`);
      }

      closeUserModal();
      renderUsersTable();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  window.deleteUserClick = function (userId, username) {
    if (!confirm(`คุณต้องการลบผู้ใช้งาน "${username}" ใช่หรือไม่?`)) return;
    try {
      EventPayAuth.deleteUser(userId);
      alert(`✅ ลบผู้ใช้งาน "${username}" เรียบร้อยแล้ว`);
      renderUsersTable();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  // ==========================================================================
  // 7. จัดการบัญชีธนาคารและพร้อมเพย์ (Tab 7: Bank & PromptPay Management)
  // ==========================================================================
  window.renderBankSettings = function () {
    const tbody = document.getElementById('adminBankAccountsTableBody');
    const bannerContainer = document.getElementById('activeBankBannerContainer');
    if (!tbody) return;

    if (typeof EventPayDB === 'undefined') {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#f87171;">ไม่พบโมดูล EventPayDB</td></tr>';
      return;
    }

    const accounts = EventPayDB.getAll('bank_accounts') || [];
    const activeAccount = EventPayDB.getActiveBankAccount();

    // Render Active Account Banner
    if (bannerContainer) {
      if (activeAccount) {
        bannerContainer.innerHTML = `
          <div style="background: rgba(16, 185, 129, 0.12); border: 1.5px solid #10b981; border-radius: 10px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
            <div>
              <div style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: #34d399; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
                บัญชีรับเงินหลักที่เปิดใช้งานอยู่ในปัจจุบัน (Active Primary Account)
              </div>
              <div style="font-size: 1.15rem; font-weight: 800; color: #fff; margin-top: 4px;">
                ${escapeHtml(activeAccount.bank_name)} &nbsp;•&nbsp; เลขบัญชี: <span style="color: var(--accent-gold); font-family: monospace; font-size: 1.25rem;">${escapeHtml(activeAccount.account_number)}</span>
              </div>
              <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 2px;">
                ชื่อบัญชี: <strong style="color: #e2e8f0;">${escapeHtml(activeAccount.account_name)}</strong> &nbsp;|&nbsp; 
                เบอร์พร้อมเพย์: <strong style="color: var(--accent-cyan); font-family: monospace;">${escapeHtml(activeAccount.promptpay_id)}</strong>
              </div>
            </div>
            <div>
              <button type="button" class="ep-nav-btn" style="border-color: #10b981; color: #34d399; font-weight: 700;" onclick="openBankAccountModal('${activeAccount.account_id}')">
                ✏️ แก้ไขข้อมูลบัญชีหลัก
              </button>
            </div>
          </div>
        `;
      } else {
        bannerContainer.innerHTML = `
          <div style="background: rgba(239, 68, 68, 0.12); border: 1.5px solid #ef4444; border-radius: 10px; padding: 14px 20px; color: #f87171;">
            ⚠️ ยังไม่ได้เปิดใช้งานบัญชีหลัก! กรุณากำหนดบัญชีหลักด้านล่างเพื่อให้ลูกค้าโอนเงินและสร้าง QR Code ได้
          </div>
        `;
      }
    }

    if (accounts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding: 24px;">ไม่พบข้อมูลบัญชีธนาคาร กรุณากดปุ่ม "เพิ่มบัญชีธนาคารใหม่" ด้านบน</td></tr>';
      return;
    }

    tbody.innerHTML = accounts.map((acc, idx) => {
      const isActive = acc.is_active;
      const statusBadge = isActive
        ? '<span class="ep-badge ep-badge-success" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; font-weight: 700; padding: 4px 10px; border-radius: 20px;">✅ เปิดใช้งาน (Active)</span>'
        : '<span class="ep-badge" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid #475569; padding: 4px 10px; border-radius: 20px;">⚪ ปิดอยู่ (Inactive)</span>';

      const promptPayTypeLabels = {
        'PHONE': 'เบอร์โทร',
        'ID_CARD': 'บัตรประชาชน',
        'TAX_ID': 'ผู้เสียภาษี',
        'EWALLET': 'e-Wallet'
      };
      const ppType = promptPayTypeLabels[acc.promptpay_type] || acc.promptpay_type || 'เบอร์โทร';

      let actionButtons = '';
      if (!isActive) {
        actionButtons += `<button type="button" class="ep-nav-btn" style="border-color: #f59e0b; color: #f59e0b; font-size: 0.78rem; padding: 4px 8px; margin-right: 4px;" onclick="setBankActiveClick('${acc.account_id}')">⭐ ใช้งานหลัก</button>`;
      }
      actionButtons += `<button type="button" class="ep-nav-btn" style="font-size: 0.78rem; padding: 4px 8px; margin-right: 4px;" onclick="openBankAccountModal('${acc.account_id}')">✏️ แก้ไข</button>`;
      if (!isActive && accounts.length > 1) {
        actionButtons += `<button type="button" class="ep-nav-btn" style="border-color: #ef4444; color: #f87171; font-size: 0.78rem; padding: 4px 8px;" onclick="deleteBankAccountClick('${acc.account_id}', '${escapeHtml(acc.bank_name)}')">🗑️ ลบ</button>`;
      }

      return `
        <tr style="${isActive ? 'background: rgba(16, 185, 129, 0.04);' : ''}">
          <td style="font-weight: 700; color: ${isActive ? '#34d399' : 'var(--text-muted)'};">${idx + 1}</td>
          <td style="font-weight: 700; color: #fff;">
            ${isActive ? '⭐ ' : ''}${escapeHtml(acc.bank_name)}
          </td>
          <td style="font-family: monospace; font-size: 0.95rem; font-weight: 700; color: var(--accent-gold);">
            ${escapeHtml(acc.account_number)}
          </td>
          <td style="font-weight: 600; color: #e2e8f0;">
            ${escapeHtml(acc.account_name)}
          </td>
          <td>
            <span style="font-family: monospace; font-weight: 700; color: var(--accent-cyan);">${escapeHtml(acc.promptpay_id)}</span>
            <span style="font-size: 0.7rem; color: #94a3b8; display: block;">(${ppType})</span>
          </td>
          <td>${statusBadge}</td>
          <td style="font-size: 0.8rem; color: #94a3b8;">${escapeHtml(acc.notes || '-')}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 4px;">
              ${actionButtons}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  };

  window.openBankAccountModal = function (accountId = null) {
    const modal = document.getElementById('adminBankAccountModal');
    if (!modal) return;

    const titleEl = document.getElementById('bankModalTitle');
    const idInput = document.getElementById('bankModalAccountId');
    const bankSelect = document.getElementById('bankModalBankSelect');
    const customBankInput = document.getElementById('bankModalCustomBankName');
    const accNumInput = document.getElementById('bankModalAccountNumber');
    const accNameInput = document.getElementById('bankModalAccountName');
    const ppIdInput = document.getElementById('bankModalPromptPayId');
    const ppTypeSelect = document.getElementById('bankModalPromptPayType');
    const notesInput = document.getElementById('bankModalNotes');
    const isActiveCheckbox = document.getElementById('bankModalIsActive');

    if (accountId) {
      const acc = EventPayDB.getById('bank_accounts', accountId);
      if (!acc) return alert('❌ ไม่พบข้อมูลบัญชี');
      titleEl.textContent = '✏️ แก้ไขบัญชีธนาคาร & พร้อมเพย์';
      idInput.value = acc.account_id;

      // Select matching bank or show custom
      let foundOption = false;
      for (let i = 0; i < bankSelect.options.length; i++) {
        if (bankSelect.options[i].value === acc.bank_name) {
          bankSelect.selectedIndex = i;
          foundOption = true;
          break;
        }
      }
      if (!foundOption) {
        bankSelect.value = 'OTHER';
        customBankInput.style.display = 'block';
        customBankInput.value = acc.bank_name;
      } else {
        customBankInput.style.display = 'none';
        customBankInput.value = '';
      }

      accNumInput.value = acc.account_number || '';
      accNameInput.value = acc.account_name || '';
      ppIdInput.value = acc.promptpay_id || '';
      ppTypeSelect.value = acc.promptpay_type || 'PHONE';
      notesInput.value = acc.notes || '';
      isActiveCheckbox.checked = !!acc.is_active;
    } else {
      titleEl.textContent = '➕ เพิ่มบัญชีธนาคาร & พร้อมเพย์ใหม่';
      idInput.value = '';
      bankSelect.selectedIndex = 0;
      customBankInput.style.display = 'none';
      customBankInput.value = '';
      accNumInput.value = '';
      accNameInput.value = '';
      ppIdInput.value = '';
      ppTypeSelect.value = 'PHONE';
      notesInput.value = '';
      isActiveCheckbox.checked = false;
    }

    modal.classList.add('show');
  };

  window.closeBankAccountModal = function () {
    const modal = document.getElementById('adminBankAccountModal');
    if (modal) modal.classList.remove('show');
  };

  window.onBankSelectChange = function (val) {
    const customInput = document.getElementById('bankModalCustomBankName');
    if (customInput) {
      customInput.style.display = (val === 'OTHER') ? 'block' : 'none';
      if (val === 'OTHER') customInput.focus();
    }
  };

  window.saveBankAccountSubmit = function (event) {
    event.preventDefault();

    const accountId = document.getElementById('bankModalAccountId').value;
    const bankSelect = document.getElementById('bankModalBankSelect').value;
    const customBank = document.getElementById('bankModalCustomBankName').value.trim();
    const bankName = (bankSelect === 'OTHER') ? customBank : bankSelect;
    const accNum = document.getElementById('bankModalAccountNumber').value.trim();
    const accName = document.getElementById('bankModalAccountName').value.trim();
    const ppId = document.getElementById('bankModalPromptPayId').value.trim();
    const ppType = document.getElementById('bankModalPromptPayType').value;
    const notes = document.getElementById('bankModalNotes').value.trim();
    const isActive = document.getElementById('bankModalIsActive').checked;

    if (!bankName) return alert('กรุณาระบุชื่อธนาคาร');
    if (!accNum) return alert('กรุณากรอกเลขที่บัญชี');
    if (!accName) return alert('กรุณากรอกชื่อบัญชีผู้รับเงิน');
    if (!ppId) return alert('กรุณากรอกเบอร์พร้อมเพย์');

    try {
      const now = new Date().toISOString();
      if (accountId) {
        // Edit existing
        EventPayDB.update('bank_accounts', accountId, {
          bank_name: bankName,
          account_number: accNum,
          account_name: accName,
          promptpay_id: ppId,
          promptpay_type: ppType,
          notes: notes,
          updated_at: now
        });
        if (isActive) {
          EventPayDB.setActiveBankAccount(accountId);
        }
        alert('✅ แก้ไขข้อมูลบัญชีธนาคารเรียบร้อยแล้ว');
      } else {
        // Create new
        const newId = 'BANK-' + Date.now().toString().slice(-4);
        const newAccount = {
          account_id: newId,
          bank_name: bankName,
          bank_code: 'CUSTOM',
          account_number: accNum,
          account_name: accName,
          promptpay_id: ppId,
          promptpay_type: ppType,
          is_active: isActive,
          notes: notes,
          created_at: now,
          updated_at: now
        };
        EventPayDB.insert('bank_accounts', newAccount);
        if (isActive) {
          EventPayDB.setActiveBankAccount(newId);
        }
        alert('✅ เพิ่มบัญชีธนาคารใหม่เรียบร้อยแล้ว');
      }

      closeBankAccountModal();
      renderBankSettings();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  window.setBankActiveClick = function (accountId) {
    if (!confirm('คุณต้องการเปลี่ยนบัญชีรับเงินหลักสำหรับหน้าจองตั๋วเป็นบัญชีนี้ใช่หรือไม่?')) return;
    try {
      EventPayDB.setActiveBankAccount(accountId);
      alert('✅ สลับบัญชีรับเงินหลักเรียบร้อยแล้ว! หน้าจองตั๋วและหน้าขายบัตรจะอัปเดตข้อมูลบัญชีนี้ทันที');
      renderBankSettings();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  window.deleteBankAccountClick = function (accountId, bankName) {
    if (!confirm(`คุณต้องการลบบัญชี "${bankName}" ใช่หรือไม่?`)) return;
    try {
      EventPayDB.delete('bank_accounts', accountId);
      alert('✅ ลบบัญชีธนาคารเรียบร้อยแล้ว');
      renderBankSettings();
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  function initDropdowns() {
    document.addEventListener('click', (e) => {
      const isDropdownBtn = e.target.closest('.ep-dropdown-btn');
      const isInsideDropdown = e.target.closest('.ep-dropdown');

      if (!isInsideDropdown) {
        document.querySelectorAll('.ep-dropdown.show').forEach(d => d.classList.remove('show'));
      } else if (isDropdownBtn) {
        const parentDropdown = isDropdownBtn.closest('.ep-dropdown');
        const wasOpen = parentDropdown.classList.contains('show');
        document.querySelectorAll('.ep-dropdown.show').forEach(d => d.classList.remove('show'));
        if (!wasOpen) {
          parentDropdown.classList.add('show');
        }
      }
    });

    document.querySelectorAll('.ep-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.ep-dropdown.show').forEach(d => d.classList.remove('show'));
      });
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

})();

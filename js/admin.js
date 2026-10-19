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
    updateAdminNetBadge();
    loadFirebaseConfigInAdmin();

    // ฟัง Real-time Broadcast จากเครื่องแม่ข่าย (ทันทีโดยไม่ต้องรอ 3 วินาที)
    if (EventPayDB && typeof EventPayDB.onSyncEvent === 'function') {
      EventPayDB.onSyncEvent((data) => {
        if (currentTab === 'dashboard') renderDashboardData();
        else if (currentTab === 'incidents') renderIncidentsTable();
        else if (currentTab === 'finance') renderFinanceLedger();
        else if (currentTab === 'audit') renderAuditLogsTable();
      });
    }

    // Auto-Sync อัปเดตข้อมูลสดทุก 3 วินาที (เพื่อให้เห็นคนเข้างานและยอดขาย Real-time)
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => {
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

    const tabs = ['dashboard', 'incidents', 'finance', 'audit', 'database'];
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
    const ordersTbody = document.getElementById('ordersTableBody');
    if (ordersTbody) {
      ordersTbody.innerHTML = '';
      const orders = EventPayDB.getAll('orders').reverse();

      if (orders.length === 0) {
        ordersTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 20px;">ไม่มีคำสั่งซื้อ</td></tr>';
      } else {
        orders.forEach(o => {
          const tr = document.createElement('tr');
          const methodBadge = o.payment_method === 'CASH'
            ? '<span class="ep-badge ep-badge-warning">เงินสด</span>'
            : '<span class="ep-badge ep-badge-info">เงินโอน</span>';

          tr.innerHTML = `
            <td style="font-family: monospace; font-weight: 700; color: var(--accent-gold);">${o.order_id}</td>
            <td>${new Date(o.created_at).toLocaleString('th-TH')}</td>
            <td><strong>${o.customer_name}</strong></td>
            <td>${o.customer_phone || '-'}</td>
            <td><strong>฿${o.total_amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong></td>
            <td>${methodBadge}</td>
            <td style="font-family: monospace; font-size: 0.8rem;">${o.bank_ref || '-'}</td>
            <td><span class="ep-badge ep-badge-pass">${o.payment_status}</span></td>
          `;
          ordersTbody.appendChild(tr);
        });
      }
    }
  }

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
  // 7. ซูมภาพถ่ายหลักฐานใบหน้า (Photo Zoom Modal)
  // ==========================================================================
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

  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

})();

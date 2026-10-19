/**
 * ============================================================================
 * EVENTPAY KIOSK GATE CONTROLLER (js/gate.js)
 * โครงการ: EventPay (Concert Payment & Secure Entry Platform)
 * พิกัด: D:\BillingApp\Antigravity\EventPay\js\gate.js
 * หน้าที่: ควบคุมการสแกน 3 ประสาน, กล้อง WebRTC, จอเขียวผ่าน vs จอแดงไซเรนลั่นลำโพง
 * ============================================================================
 */

(function () {
  'use strict';

  let audioAlert = null;
  let hwBridge = null;
  let currentCameraFacing = 'user'; // 'user' (กล้องหน้าตู้ Kiosk) หรือ 'environment'
  let passAutoCloseTimer = null;
  const currentGateId = 'GATE-01';
  const currentOperatorId = 'USER-GATE-01';

  document.addEventListener('DOMContentLoaded', () => {
    initGate();
  });

  function initGate() {
    try {
      if (typeof EventPayAudioAlert !== 'undefined') {
        audioAlert = new EventPayAudioAlert();
      }
      if (typeof EventPayHardwareBridge !== 'undefined') {
        hwBridge = new EventPayHardwareBridge();
      }
    } catch (e) {
      console.warn('Init instances warning:', e);
    }

    loadGateInfo();
    updateGateStats();
    updateKioskNetBadge();

    // ฟัง Real-time Broadcast จากเครื่องแม่ข่าย
    if (EventPayDB && typeof EventPayDB.onSyncEvent === 'function') {
      EventPayDB.onSyncEvent((data) => {
        updateGateStats();
      });
    }

    // เริ่มเปิดกล้องอัตโนมัติ
    startCameraStream();

    // ดักจับการแตะหน้าจอครั้งแรกเพื่อปลดล็อก Web Audio Autoplay ทันที
    document.addEventListener('click', function unlockOnce() {
      unlockKioskAudioAndCamera();
      document.removeEventListener('click', unlockOnce);
    }, { once: true });
  }

  async function updateKioskNetBadge() {
    const badge = document.getElementById('kioskNetBadge');
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

  function loadGateInfo() {
    const gate = EventPayDB.get('gates', currentGateId);
    if (gate) {
      const title = document.getElementById('kioskGateTitle');
      if (title) title.textContent = `🚪 ${gate.name}`;
    }

    const guard = EventPayDB.get('staff', currentOperatorId);
    if (guard) {
      const guardSpan = document.getElementById('kioskGuardName');
      if (guardSpan) guardSpan.textContent = `${guard.name} (${guard.staff_id})`;
    }
  }

  // ==========================================================================
  // 1. ปลดล็อกระบบเสียง Web Audio และเริ่มกล้อง
  // ==========================================================================
  window.unlockKioskAudioAndCamera = function () {
    if (audioAlert) {
      audioAlert.unlockAudio().then(() => {
        const banner = document.getElementById('kioskUnlockBanner');
        if (banner) banner.style.display = 'none';

        const badge = document.getElementById('badgeAudioStatus');
        if (badge) {
          badge.textContent = '🔊 ลำโพงไซเรน: พร้อมใช้งาน (Armed)';
          badge.style.background = '#064e3b';
          badge.style.borderColor = '#10b981';
        }
      });
    }
    startCameraStream();
  };

  // ==========================================================================
  // 2. ควบคุมกล้อง WebRTC และสลับกล้อง
  // ==========================================================================
  function startCameraStream() {
    const videoEl = document.getElementById('gateCameraVideo');
    const statusText = document.getElementById('cameraStatusText');

    if (!hwBridge || !videoEl) return;

    if (!hwBridge.isCameraSupported()) {
      if (statusText) {
        statusText.textContent = 'อุปกรณ์ไม่รองรับกล้องจริง (ใช้โหมดจำลองภาพถ่าย)';
        statusText.style.color = 'var(--accent-gold)';
      }
      return;
    }

    if (statusText) statusText.textContent = 'กำลังเปิดกล้อง...';

    hwBridge.startCamera(videoEl, null, currentCameraFacing)
      .then(() => {
        if (statusText) {
          statusText.textContent = 'กล้องทำงานปกติ (360x360 Ready)';
          statusText.style.color = 'var(--accent-green)';
        }
      })
      .catch(err => {
        console.warn('Camera stream warning:', err);
        if (statusText) {
          statusText.textContent = 'ไม่พบกล้อง/ไม่ได้รับอนุญาต (ใช้โหมดจำลองภาพถ่าย)';
          statusText.style.color = 'var(--accent-gold)';
        }
      });
  }

  window.switchCamera = function () {
    currentCameraFacing = currentCameraFacing === 'user' ? 'environment' : 'user';
    startCameraStream();
  };

  window.toggleKioskFullscreen = function () {
    if (!hwBridge) return;
    if (hwBridge.isFullscreen()) {
      hwBridge.exitFullscreen();
    } else {
      hwBridge.enterFullscreen();
    }
  };

  // ==========================================================================
  // 3. ตรวจสอบสิทธิ์ 3 ประสาน (Gate 3-Point Validation)
  // ==========================================================================
  window.processGateScan = function () {
    const qrInput = document.getElementById('gateQrInput');
    const wbInput = document.getElementById('gateWbInput');
    const videoEl = document.getElementById('gateCameraVideo');

    const qrVal = (qrInput?.value || '').trim();
    const wbVal = (wbInput?.value || '').trim();

    if (!qrVal) {
      alert('กรุณายิงสแกน QR Code บนบัตร');
      if (qrInput) qrInput.focus();
      return;
    }

    // ถ่ายภาพใบหน้าความเร็วสูงจากกล้อง 360x360 (< 40KB)
    let facePhotoDataUrl = '';
    let captureMeta = { byteSize: 0, durationMs: 0 };

    try {
      if (videoEl && videoEl.readyState >= 2 && hwBridge) {
        const capture = hwBridge.captureFace(videoEl, 360, 360);
        facePhotoDataUrl = capture.dataUrl;
        captureMeta = { byteSize: capture.byteSize, durationMs: capture.durationMs };
      } else {
        // Fallback จำลองรูปถ่ายใบหน้าหากไม่มีกล้องจริง
        facePhotoDataUrl = generateSimulatedFaceCanvas(qrVal);
        captureMeta = { byteSize: 28500, durationMs: 15 };
      }
    } catch (e) {
      facePhotoDataUrl = generateSimulatedFaceCanvas(qrVal);
      captureMeta = { byteSize: 28500, durationMs: 15 };
    }

    // เรียกแกนสมองตรวจสอบสิทธิ์ 3 ประสาน (Atomic Validation Engine)
    const result = EventPayDB.validateGateScan(qrVal, wbVal, facePhotoDataUrl, currentGateId, currentOperatorId);

    // อัปเดตกล่องแสดงภาพถ่ายใบหน้าล่าสุดบนหน้าจอหลัก
    updateLastFaceSnapshot(result, facePhotoDataUrl, captureMeta);
    updateGateStats();

    if (result.success) {
      handleGatePassSuccess(result, facePhotoDataUrl);
    } else {
      handleGateFraudDetected(result, facePhotoDataUrl);
    }
  };

  // ==========================================================================
  // 4. แสดงผลกรณีผ่าน (BIG GREEN PASS SCREEN)
  // ==========================================================================
  function handleGatePassSuccess(result, facePhotoUrl) {
    const ticket = result.ticket;

    // เล่นเสียง Chime นุ่มนวล
    if (audioAlert) audioAlert.playSuccessChime();

    const overlay = document.getElementById('overlayPass');
    const passMode = document.getElementById('passModeText');
    const passName = document.getElementById('passAttendeeName');
    const passTier = document.getElementById('passTierName');
    const passTktId = document.getElementById('passTicketId');
    const passWbId = document.getElementById('passWristbandId');
    const passImg = document.getElementById('passFaceImg');

    if (passMode) {
      passMode.textContent = result.mode === 'FIRST_ENTRY'
        ? 'ยินดีต้อนรับเข้าสู่งานคอนเสิร์ต (ลงทะเบียนครั้งแรกสำเร็จ)'
        : `ยินดีต้อนรับกลับเข้าสู่งาน (เข้าซ้ำครั้งที่ ${ticket.entry_count})`;
    }
    if (passName) passName.textContent = ticket.attendee_name;
    if (passTier) passTier.textContent = ticket.tier_name;
    if (passTktId) passTktId.textContent = ticket.ticket_id;
    if (passWbId) passWbId.textContent = ticket.wristband_id;
    if (passImg) passImg.src = facePhotoUrl;

    if (overlay) overlay.classList.add('show');

    // รีเซ็ตอัตโนมัติใน 3.2 วินาที เพื่อรับคนถัดไป
    if (passAutoCloseTimer) clearTimeout(passAutoCloseTimer);
    passAutoCloseTimer = setTimeout(() => {
      closePassScreen();
    }, 3200);
  }

  window.closePassScreen = function () {
    if (passAutoCloseTimer) clearTimeout(passAutoCloseTimer);
    const overlay = document.getElementById('overlayPass');
    if (overlay) overlay.classList.remove('show');

    // ล้างช่องกรอกและโฟกัสกลับช่อง QR Code
    resetInputs();
  };

  // ==========================================================================
  // 5. แสดงผลกรณีทุจริต/สวมสิทธิ์ (BIG FLASHING RED LOUDSPEAKER ALARM)
  // ==========================================================================
  function handleGateFraudDetected(result, facePhotoUrl) {
    // ลั่นเสียงไซเรนเตือนภัยความถี่สูง 800-1600Hz LFO ออกลำโพงภายนอก Kiosk ทันที!
    if (audioAlert) audioAlert.startAlarmSiren();

    const overlay = document.getElementById('overlayFraud');
    const textViolation = document.getElementById('fraudViolationText');
    const textTktId = document.getElementById('fraudTicketId');
    const textWbId = document.getElementById('fraudWristbandId');
    const textReason = document.getElementById('fraudReasonDetail');
    const fraudImg = document.getElementById('fraudFaceImg');

    if (textViolation) textViolation.textContent = `REJECT: ${result.message}`;
    if (textTktId) textTktId.textContent = result.ticket ? result.ticket.ticket_id : (document.getElementById('gateQrInput')?.value || '-');
    if (textWbId) textWbId.textContent = document.getElementById('gateWbInput')?.value || 'ไม่ได้ระบุ';
    if (textReason) textReason.textContent = `[${result.code}] ${result.message}`;
    if (fraudImg) fraudImg.src = facePhotoUrl;

    if (overlay) overlay.classList.add('show');
  }

  window.silenceAlarmAndReset = function () {
    // เจ้าหน้าที่กดหยุดเสียงไซเรนเตือนภัย
    if (audioAlert) audioAlert.stopAlarmSiren();

    const overlay = document.getElementById('overlayFraud');
    if (overlay) overlay.classList.remove('show');

    resetInputs();
  };

  function resetInputs() {
    const qrInput = document.getElementById('gateQrInput');
    const wbInput = document.getElementById('gateWbInput');
    if (qrInput) {
      qrInput.value = '';
      qrInput.focus();
    }
    if (wbInput) wbInput.value = '';
  }

  // ==========================================================================
  // 6. อัปเดตสถิติและภาพถ่ายใบหน้าล่าสุด
  // ==========================================================================
  function updateLastFaceSnapshot(result, facePhotoUrl, meta) {
    const img = document.getElementById('lastFaceImg');
    const nameSpan = document.getElementById('lastFaceAttendee');
    const wbSpan = document.getElementById('lastFaceWristband');
    const timeSpan = document.getElementById('lastFaceTime');
    const metaTag = document.getElementById('faceMetaTag');

    if (img) img.src = facePhotoUrl;
    if (nameSpan) nameSpan.textContent = result.ticket ? result.ticket.attendee_name : 'ไม่พบข้อมูล';
    if (wbSpan) wbSpan.textContent = document.getElementById('gateWbInput')?.value || '-';
    if (timeSpan) timeSpan.textContent = new Date().toLocaleTimeString('th-TH');
    if (metaTag) metaTag.textContent = `${Math.round(meta.byteSize / 1024)}KB (${meta.durationMs}ms)`;
  }

  function updateGateStats() {
    const summary = EventPayDB.getDashboardSummary();
    const statEntered = document.getElementById('statEnteredCount');
    const statIncident = document.getElementById('statIncidentCount');
    const statRemain = document.getElementById('statRemainingCount');

    if (statEntered) statEntered.textContent = `${summary.attendeesInside.toLocaleString()} คน`;
    if (statIncident) statIncident.textContent = `${summary.totalIncidents.toLocaleString()} ครั้ง`;
    if (statRemain) statRemain.textContent = `${summary.attendeesRemaining.toLocaleString()} คน`;
  }

  // ==========================================================================
  // 7. ปุ่มทดสอบจำลองเหตุการณ์หน้างานจริง (Quick-Demo Test Buttons)
  // ==========================================================================
  window.fillTestTicket = function (type) {
    const qrInput = document.getElementById('gateQrInput');
    const wbInput = document.getElementById('gateWbInput');

    if (type === 'NEW_VIP') {
      if (qrInput) qrInput.value = 'EP-TKT-VIP-001-A9F7';
      if (wbInput) wbInput.value = 'WB-ALPHA-01';
    } else if (type === 'NEW_REG') {
      if (qrInput) qrInput.value = 'EP-TKT-REG-002-B8E3';
      if (wbInput) wbInput.value = 'WB-BETA-02';
    } else if (type === 'FRAUD_DUPLICATE') {
      // บัตร TKT-VIP-004 เข้างานแล้วและผูกกับ WB-9901 แต่เราส่ง WB-WRONG-IMPOSTER-99 เข้าไป
      if (qrInput) qrInput.value = 'EP-TKT-VIP-004-D6C5';
      if (wbInput) wbInput.value = 'WB-WRONG-IMPOSTER-99';
    } else if (type === 'VOID_TICKET') {
      if (qrInput) qrInput.value = 'EP-TKT-VOID-999-VOID';
      if (wbInput) wbInput.value = 'WB-NEW-99';
    }

    // รันการตรวจสอบทันที
    processGateScan();
  };

  // Helper สำหรับสร้างภาพ Canvas จำลองใบหน้าเมื่อไม่มีกล้องจริง
  function generateSimulatedFaceCanvas(label) {
    if (typeof document === 'undefined') return '';
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 360, 360);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 360, 360);

    // Silhouette icon
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(180, 140, 65, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(180, 340, 110, Math.PI, 0, false);
    ctx.fill();

    // Text tag
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FACECAP 360x360', 180, 240);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText(label.slice(0, 20), 180, 265);

    return canvas.toDataURL('image/jpeg', 0.75);
  }

})();

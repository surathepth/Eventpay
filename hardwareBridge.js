/**
 * ============================================================================
 * EVENTPAY HARDWARE ISOLATION & DEVICE BRIDGE (js/hardwareBridge.js)
 * โครงการ: EventPay (โครงการระบบโอนและเงินสด รับเงิน-จ่ายเงิน งานคอนเสิร์ต)
 * พิกัด: D:\BillingApp\Antigravity\EventPay\js\hardwareBridge.js
 * สถาปัตยกรรม: WebRTC Camera Engine & Hardware Port Isolation Layer
 * มาตรฐาน: AGENTS.md (Rule 24), PROJECT_ARCHITECTURE.md (Section 16), SKILL.md
 * ============================================================================
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EventPayHardwareBridge = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class EventPayHardwareBridge {
    constructor() {
      this.currentStream = null;
      this.activeDeviceId = null;
      this.isCapturing = false;

      // บังคับใช้เกราะป้องกันฮาร์ดแวร์ไอโซเลชั่น (Rule 24 Isolation Shield)
      this.isolationActive = true;
    }

    /**
     * ตรวจสอบว่าเบราว์เซอร์รองรับกล้อง WebRTC หรือไม่
     */
    isCameraSupported() {
      return !!(typeof navigator !== 'undefined' &&
                navigator.mediaDevices &&
                navigator.mediaDevices.getUserMedia);
    }

    /**
     * ดึงรายชื่อกล้องที่เชื่อมต่ออยู่ โดยไม่แตะต้องพอร์ต Serial/USB ใดๆ ทั้งสิ้น
     */
    async getCameraList() {
      if (!this.isCameraSupported()) {
        console.warn('[EventPay Hardware] MediaDevices not supported.');
        return [];
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices
          .filter(d => d.kind === 'videoinput')
          .map((d, index) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${index + 1} (${d.deviceId.slice(0, 6)})`,
            groupId: d.groupId
          }));
        return videoDevices;
      } catch (err) {
        console.error('[EventPay Hardware] Failed to enumerate camera devices:', err);
        return [];
      }
    }

    /**
     * เปิดกล้องและเชื่อมต่อเข้ากับแท็ก <video>
     * @param {HTMLVideoElement} videoElement
     * @param {string|null} preferredDeviceId
     * @param {string} facingMode 'environment' (กล้องหลัง/กล้องตู้) หรือ 'user' (กล้องหน้า)
     */
    async startCamera(videoElement, preferredDeviceId = null, facingMode = 'environment') {
      if (!this.isCameraSupported()) {
        throw new Error('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง WebRTC');
      }

      // หยุดกล้องเดิมก่อนเปิดกล้องใหม่เพื่อป้องกัน Memory Leak
      this.stopCamera(videoElement);

      // [THEP-APAI MISSION 55: RESILIENT 3-TIER CAMERA CONSTRAINTS FOR ANDROID & MOBILE KIOSK]
      let stream = null;
      let lastError = null;

      // Tier 1: Ideal HD / Flexible without rigid 'min' that causes OverconstrainedError on Android
      const tier1Constraints = {
        audio: false,
        video: preferredDeviceId
          ? { deviceId: { exact: preferredDeviceId } }
          : {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
      };

      // Tier 2: Flexible Facing Mode (user/environment)
      const tier2Constraints = {
        audio: false,
        video: preferredDeviceId
          ? { deviceId: { exact: preferredDeviceId } }
          : { facingMode: facingMode }
      };

      // Tier 3: Universal Fallback (video: true)
      const tier3Constraints = {
        audio: false,
        video: true
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia(tier1Constraints);
      } catch (err1) {
        console.warn('[EventPay Hardware] Tier 1 camera constraints failed, trying Tier 2:', err1);
        lastError = err1;
        try {
          stream = await navigator.mediaDevices.getUserMedia(tier2Constraints);
        } catch (err2) {
          console.warn('[EventPay Hardware] Tier 2 camera constraints failed, trying Tier 3 universal:', err2);
          lastError = err2;
          try {
            stream = await navigator.mediaDevices.getUserMedia(tier3Constraints);
          } catch (err3) {
            console.error('[EventPay Hardware] All camera tiers failed:', err3);
            lastError = err3;
            throw lastError;
          }
        }
      }

      try {
        this.currentStream = stream;

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
          this.activeDeviceId = settings.deviceId || preferredDeviceId || 'default';
        }

        if (videoElement) {
          videoElement.muted = true;
          videoElement.defaultMuted = true;
          videoElement.setAttribute('playsinline', 'true');
          videoElement.setAttribute('webkit-playsinline', 'true');
          videoElement.srcObject = stream;

          const playPromise = videoElement.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => {
              console.warn('[EventPay Hardware] Direct play warning, waiting loadedmetadata:', e);
              videoElement.onloadedmetadata = () => {
                videoElement.play().catch(err => console.warn('[EventPay Hardware] Metadata play warning:', err));
              };
            });
          }
        }

        return stream;
      } catch (err) {
        console.error('[EventPay Hardware] Failed to configure camera stream:', err);
        throw err;
      }
    }

    /**
     * ปิดกล้องและคืนทรัพยากรระบบทั้งหมด
     * @param {HTMLVideoElement|null} videoElement
     */
    stopCamera(videoElement = null) {
      if (this.currentStream) {
        this.currentStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {
            // Ignored
          }
        });
        this.currentStream = null;
      }

      if (videoElement && videoElement.srcObject) {
        videoElement.srcObject = null;
      }
      this.activeDeviceId = null;
    }

    /**
     * บันทึกภาพใบหน้าความเร็วสูงจากวิดีโอ (Face Capture Engine)
     * มาตรฐาน CPCSEP:
     * - ครอปสี่เหลี่ยมจัตุรัส 1:1 กึ่งกลางภาพ
     * - บีบอัดความละเอียด 360x360 พิกเซล
     * - เข้ารหัส JPEG คุณภาพ 0.75 ขนาดไฟล์ < 40KB
     * - ประมวลผลเสร็จในเวลา < 0.05 วินาที
     * @param {HTMLVideoElement} videoElement
     * @param {number} targetWidth
     * @param {number} targetHeight
     * @returns {{ dataUrl: string, byteSize: number, durationMs: number, width: number, height: number }}
     */
    captureFace(videoElement, targetWidth = 360, targetHeight = 360) {
      const startTime = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();

      if (!videoElement || videoElement.readyState < 2) {
        throw new Error('วิดีโอยังไม่พร้อมสำหรับการบันทึกภาพ');
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      const videoWidth = videoElement.videoWidth || 640;
      const videoHeight = videoElement.videoHeight || 480;

      // คำนวณจุดตัด 1:1 กึ่งกลางกล้อง (Square Center Crop)
      const minDim = Math.min(videoWidth, videoHeight);
      const startX = (videoWidth - minDim) / 2;
      const startY = (videoHeight - minDim) / 2;

      ctx.drawImage(
        videoElement,
        startX, startY, minDim, minDim,
        0, 0, targetWidth, targetHeight
      );

      // ส่งออก Base64 JPEG คุณภาพ 0.75
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

      const endTime = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
      const durationMs = Math.round((endTime - startTime) * 100) / 100;

      // คำนวณขนาดไฟล์จริง (Byte Size) จาก Base64
      const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
      const byteSize = Math.round((base64Length * 3) / 4);

      return {
        dataUrl: dataUrl,
        byteSize: byteSize,
        durationMs: durationMs,
        width: targetWidth,
        height: targetHeight
      };
    }

    /**
     * ล็อกหน้าจอ Kiosk เต็มหน้าจอ (Fullscreen PWA Lock)
     * รองรับเบราว์เซอร์มาตรฐาน, Chrome, Safari, Android WebView
     */
    enterFullscreen(targetElement = null) {
      const elem = targetElement || (typeof document !== 'undefined' ? document.documentElement : null);
      if (!elem) return Promise.resolve(false);

      if (elem.requestFullscreen) {
        return elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        return elem.webkitRequestFullscreen();
      } else if (elem.msRequestFullscreen) {
        return elem.msRequestFullscreen();
      }
      return Promise.resolve(false);
    }

    /**
     * ออกจากโหมดเต็มหน้าจอ
     */
    exitFullscreen() {
      if (typeof document === 'undefined') return Promise.resolve(false);

      if (document.exitFullscreen) {
        return document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        return document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        return document.msExitFullscreen();
      }
      return Promise.resolve(false);
    }

    /**
     * ตรวจสอบว่ากำลังอยู่ในโหมดเต็มจอหรือไม่
     */
    isFullscreen() {
      if (typeof document === 'undefined') return false;
      return !!(document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.msFullscreenElement);
    }
  }

  return EventPayHardwareBridge;
}));

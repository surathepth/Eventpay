/**
 * ============================================================================
 * EVENTPAY LOCAL MASTER HUB (server/masterServer.js)
 * โครงการ: EventPay (Concert Payment, Cash Management & Secure Entry Platform)
 * พิกัด: D:\BillingApp\Antigravity\EventPay\server\masterServer.js
 * สถาปัตยกรรม: Pure Node.js Offline LAN Master Server + Real-time SSE Broadcast
 * วัตถุประสงค์: เป็นเครื่องแม่ข่ายหน้างานคอนเสิร์ต ให้บริการเครื่องลูกทั้งหมด
 *              (ตู้ Kiosk, แคชเชียร์, Admin) ในวง LAN เดียวกันแบบออฟไลน์ 100%
 *              และทำหน้าที่เชื่อมต่อซิงก์ขึ้น Firebase Cloud เมื่อมีอินเทอร์เน็ต
 * ============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

// โหลดฐานข้อมูล EventPay DB Core
const EventPayDB = require('../js/db.js');

const PORT = process.env.PORT || 8080;
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'master_db.json');

// ตรวจสอบและสร้างโฟลเดอร์ data
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// โหลดข้อมูลเก่าจากไฟล์ Master DB (หากมี) หรือเซฟข้อมูลเริ่มต้น
function loadMasterDbFromFile() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.data) {
        Object.keys(parsed.data).forEach(col => {
          EventPayDB._saveCollection(col, parsed.data[col]);
        });
        console.log(`💾 [Master Server] โหลดข้อมูล Master DB สำเร็จ (${Object.keys(parsed.data).length} คอลเลกชัน)`);
      }
    } catch (err) {
      console.error('⚠️ [Master Server] ไม่สามารถอ่านไฟล์ DB เดิมได้ ใช้ข้อมูล Seed เริ่มต้น:', err.message);
    }
  } else {
    saveMasterDbToFile();
  }
}

function saveMasterDbToFile() {
  try {
    const jsonStr = EventPayDB.exportJSON();
    fs.writeFileSync(DB_FILE, jsonStr, 'utf8');
  } catch (err) {
    console.error('❌ [Master Server] ไม่สามารถบันทึก DB ลงไฟล์ได้:', err.message);
  }
}

// รายชื่อ SSE Clients ที่เชื่อมต่ออยู่สดๆ
const sseClients = new Set();

function broadcastEvent(eventType, payload) {
  const message = `data: ${JSON.stringify({ type: eventType, payload, timestamp: new Date().toISOString() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// หาหมายเลข IP ในวง LAN ทั้งหมดของเครื่องนี้
function getLanIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if ('IPv4' === iface.family && !iface.internal) {
        ips.push({ interface: name, address: iface.address });
      }
    }
  }
  return ips;
}

// ตาราง MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ฟังก์ชันช่วยอ่าน Request Body (JSON)
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { // จำกัดขนาด 5MB
        req.destroy();
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', err => reject(err));
  });
}

// ============================================================================
// HTTP REQUEST HANDLER
// ============================================================================
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const method = req.method;

  // CORS Headers รองรับเครื่องลูกในวง LAN ทุกเครื่อง
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --------------------------------------------------------------------------
  // 1. API: Server-Sent Events (SSE) Live Broadcast Stream
  // --------------------------------------------------------------------------
  if (pathname === '/api/events/live-stream' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'EventPay SSE Live Stream Active' })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // --------------------------------------------------------------------------
  // 2. API: สถานะเครื่องแม่ข่าย (Server Health & Status)
  // --------------------------------------------------------------------------
  if (pathname === '/api/status' && method === 'GET') {
    const summary = EventPayDB.getDashboardSummary();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ONLINE',
      mode: 'LOCAL_MASTER_HUB',
      version: '1.0.0',
      serverTime: new Date().toISOString(),
      lanIps: getLanIpAddresses(),
      connectedClients: sseClients.size,
      summary: summary
    }));
    return;
  }

  // --------------------------------------------------------------------------
  // 3. API: การตรวจสอบสิทธิ์หน้าประตูแบบ Atomic (Gate 3-Point Validation & IN/OUT/RE-ENTRY)
  // --------------------------------------------------------------------------
  if (pathname === '/api/gate/scan' && method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { qrCode, wristbandId, facePhotoUrl, gateId, operatorId, gateDirection, direction } = body;
      const dir = (gateDirection || direction || 'IN').toUpperCase();

      const result = EventPayDB.validateGateScan(qrCode, wristbandId, facePhotoUrl, gateId || 'GATE-01', operatorId || 'USER-GATE-01', dir);
      saveMasterDbToFile();

      // Broadcast สดให้ทุกเครื่อง (ตู้ Kiosk และ Admin) ทราบทันที
      broadcastEvent('GATE_SCAN_EVENT', {
        result,
        gateId: gateId || 'GATE-01',
        gateDirection: dir,
        time: new Date().toISOString()
      });

      // ซิงก์กระดานคนอยู่นอกงานแบบ Real-time (Auto-Sync Outside Board)
      if (result.success && (result.mode === 'EXIT' || result.mode === 'RE_ENTRY')) {
        const outsideList = typeof EventPayDB.getActiveOutsideAttendees === 'function' ? EventPayDB.getActiveOutsideAttendees() : [];
        broadcastEvent('OUTSIDE_ATTENDEES_UPDATED', {
          count: outsideList.length,
          attendees: outsideList,
          lastAction: result.mode,
          ticketId: result.ticket?.ticket_id,
          time: new Date().toISOString()
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: err.message }));
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 3.1 API: ดึงรายชื่อผู้ที่อยู่นอกงานขณะนี้ (Live Active Outside Attendees)
  // --------------------------------------------------------------------------
  if (pathname === '/api/gate/outside-attendees' && method === 'GET') {
    try {
      const list = typeof EventPayDB.getActiveOutsideAttendees === 'function' ? EventPayDB.getActiveOutsideAttendees() : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: list.length, attendees: list }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: err.message, attendees: [] }));
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 4. API: สร้างคำสั่งซื้อและออกตั๋ว (Order Creation & Ticketing)
  // --------------------------------------------------------------------------
  if (pathname === '/api/orders/create' && method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { orderData, cashierId } = body;

      const result = EventPayDB.createOrder(orderData, cashierId);
      saveMasterDbToFile();

      // Broadcast สดให้เครื่องอื่นทราบยอดขายทันที
      broadcastEvent('ORDER_CREATED_EVENT', {
        orderId: result.order.order_id,
        total: result.order.total_amount,
        ticketsCount: result.tickets.length,
        time: new Date().toISOString()
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: err.message }));
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 4.1. API: ตั้งค่าและดึงสถานะ Payment Mode (Dual-Mode: System C vs Legacy)
  // --------------------------------------------------------------------------
  if (pathname === '/api/payment/config' && method === 'GET') {
    const config = EventPayDB.getPaymentConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, config }));
    return;
  }

  if (pathname === '/api/payment/config' && method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const updated = EventPayDB.setPaymentConfig(body);
      saveMasterDbToFile();
      broadcastEvent('PAYMENT_CONFIG_CHANGED', updated);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, config: updated }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: err.message }));
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 4.2. API: ตรวจจับเงินเข้าอัตโนมัติ (Zero-Slip Autonomous Bot: Mobile Forwarder, Gmail & Simulation)
  // --------------------------------------------------------------------------
  if (pathname === '/api/payment/notification' && method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { amount, order_id, bank, timestamp, bank_ref, sender_name, raw_message } = body;

      let parsedAmount = (amount !== undefined && amount !== null && amount !== '') ? parseFloat(amount) : undefined;
      let parsedRef = bank_ref || undefined;
      let parsedSender = sender_name || undefined;

      // Smart Parser: หากได้รับข้อความแจ้งเตือนดิบ (raw_message จาก Forwarder/Gmail)
      if (raw_message && typeof raw_message === 'string') {
        // ดึงยอดเงิน: เช่น +2,000.00 หรือ 2,000.00 บาท หรือ 2000 บาท
        if (parsedAmount === undefined) {
          const amtMatch = raw_message.match(/(?:\+|เงินเข้า|รับโอนเงิน|จำนวน)\s*([0-9,]+(?:\.[0-9]{2})?)/);
          if (amtMatch) {
            parsedAmount = parseFloat(amtMatch[1].replace(/,/g, ''));
          }
        }
        // ดึงเลขที่อ้างอิงธุรกรรมธนาคาร: เช่น Ref: 202610258819203810 หรือ รหัส 20261025781290
        if (!parsedRef) {
          const refMatch = raw_message.match(/(?:Ref|เลขอ้างอิง|รหัสอ้างอิง|รหัส)\s*[:\s]*([A-Za-z0-9_-]{8,})/i);
          if (refMatch) {
            parsedRef = refMatch[1].trim();
          }
        }
        // ดึงชื่อผู้โอน: เช่น จาก นาย สมชาย ใจ...
        if (!parsedSender) {
          const senderMatch = raw_message.match(/จาก\s+([^,0-9\n\r]+)/);
          if (senderMatch) {
            parsedSender = senderMatch[1].trim();
          }
        }
      }

      const criteria = {
        order_id: order_id || undefined,
        amount: parsedAmount,
        bank_ref: parsedRef,
        sender_name: parsedSender,
        bank: bank || 'PROMPTPAY'
      };

      const result = EventPayDB.autoConfirmPromptPayPayment(criteria, 'AUTO-BOT-ZERO-SLIP');
      if (result.success) {
        saveMasterDbToFile();
        // Broadcast สัญญาณสด ปลดล็อกหน้าจอลูกค้า และส่งเสียงเตือน Admin ทันที
        broadcastEvent('PAYMENT_CONFIRMED', {
          orderId: result.order.order_id,
          amount: result.order.total_amount,
          customerName: result.order.customer_name,
          customerPhone: result.order.customer_phone,
          bankRef: result.order.bank_ref,
          tickets: result.tickets,
          time: new Date().toISOString()
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...result }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: result.message }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: err.message }));
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 4.3. API: ค้นหาบัตร e-Ticket และใบเสร็จของลูกค้า (Self-Service 24/7 Retrieval)
  // --------------------------------------------------------------------------
  if (pathname === '/api/tickets/lookup' && method === 'GET') {
    const parsedUrl = url.parse(req.url, true);
    const query = parsedUrl.query.query || '';
    const results = EventPayDB.lookupCustomerOrders(query);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, query, count: results.length, results }));
    return;
  }

  // --------------------------------------------------------------------------
  // 5. API: ดึงสถิติแดชบอร์ดสด (Dashboard Summary)
  // --------------------------------------------------------------------------
  if (pathname === '/api/dashboard/summary' && method === 'GET') {
    const summary = EventPayDB.getDashboardSummary();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(summary));
    return;
  }

  // --------------------------------------------------------------------------
  // 5.6 API: ซิงค์ประเภทราคาตั๋วทั้งหมดลงไฟล์ถาวร (POST /api/db/ticket_tiers/sync)
  // --------------------------------------------------------------------------
  if (pathname === '/api/db/ticket_tiers/sync' && method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      if (Array.isArray(body)) {
        EventPayDB._saveCollection('ticket_tiers', body);
        saveMasterDbToFile();
        broadcastEvent('TIERS_SYNCED', { count: body.length, timestamp: new Date().toISOString() });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, count: body.length, message: 'Ticket tiers persisted to disk successfully' }));
        return;
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
      return;
    }
  }

  // --------------------------------------------------------------------------
  // 5.7 API: ซิงค์บัญชีธนาคารลงดิสก์ถาวร (POST /api/db/bank_accounts/sync)
  // --------------------------------------------------------------------------
  if (pathname === '/api/db/bank_accounts/sync' && method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      if (Array.isArray(body)) {
        EventPayDB._saveCollection('bank_accounts', body);
        saveMasterDbToFile();
        broadcastEvent('BANK_ACCOUNTS_SYNCED', { count: body.length, timestamp: new Date().toISOString() });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, count: body.length, message: 'Bank accounts persisted to disk successfully' }));
        return;
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
      return;
    }
  }

  // --------------------------------------------------------------------------
  // 6. API: Generic Database Collections (GET /api/db/:collection)
  // --------------------------------------------------------------------------
  if (pathname.startsWith('/api/db/')) {
    const colName = pathname.replace('/api/db/', '').trim();
    if (method === 'GET') {
      const items = EventPayDB.getAll(colName);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(items));
      return;
    }
    if (method === 'POST') {
      const body = await parseRequestBody(req);
      const inserted = EventPayDB.insert(colName, body);
      saveMasterDbToFile();
      broadcastEvent('DB_INSERT_EVENT', { collection: colName, item: inserted });
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(inserted));
      return;
    }
  }

  // --------------------------------------------------------------------------
  // 7. API: ส่งออกและกู้คืนสำรองข้อมูล (JSON Backup & Reset)
  // --------------------------------------------------------------------------
  if (pathname === '/api/db/export' && method === 'GET') {
    const jsonStr = EventPayDB.exportJSON();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="eventpay_master_backup.json"'
    });
    res.end(jsonStr);
    return;
  }

  if (pathname === '/api/db/reset' && method === 'POST') {
    EventPayDB.resetDatabase();
    saveMasterDbToFile();
    broadcastEvent('DB_RESET_EVENT', { message: 'Database reset to clean state' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'รีเซ็ตฐานข้อมูลสำเร็จ' }));
    return;
  }

  // --------------------------------------------------------------------------
  // 8. STATIC FILE SERVING (ให้บริการไฟล์หน้าเว็บ index, kiosk, admin, css, js)
  // --------------------------------------------------------------------------
  let filePath = path.join(ROOT_DIR, pathname === '/' ? 'index.html' : pathname);

  // ป้องกัน Directory Traversal
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  // ปรับปรุง Fallback อัจฉริยะ (Smart HTML Fallback: รองรับ .htm และ URLs ไร้นามสกุล)
  if (!fs.existsSync(filePath)) {
    if (filePath.endsWith('.htm') && fs.existsSync(filePath + 'l')) {
      filePath = filePath + 'l'; // เช่น admin.htm -> admin.html
    } else if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html'; // เช่น /admin -> /admin.html
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: ${pathname}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// เริ่มต้นโหลด Master DB
loadMasterDbFromFile();

// เริ่มต้นรันเซิร์ฟเวอร์
server.listen(PORT, '0.0.0.0', () => {
  const lanIps = getLanIpAddresses();
  console.log('\n======================================================================');
  console.log('🚀 [EVENTPAY LOCAL MASTER HUB]: เครื่องแม่ข่ายหน้างานคอนเสิร์ตเปิดทำงานแล้ว!');
  console.log('======================================================================');
  console.log(`🌐 Local Server Port: ${PORT}`);
  console.log(`💻 เข้าใช้งานบนเครื่องแม่ (Localhost):`);
  console.log(`   - 📱 ลูกค้าจองบัตรออนไลน์:   http://localhost:${PORT}/booking.html`);
  console.log(`   - 🎟️ จุดขายบัตร & แคชเชียร์: http://localhost:${PORT}/`);
  console.log(`   - 🚪 ประตูคัดกรอง Kiosk:      http://localhost:${PORT}/kiosk.html`);
  console.log(`   - 💻 ศูนย์บัญชาการ Admin:      http://localhost:${PORT}/admin.html\n`);

  if (lanIps.length > 0) {
    console.log(`📶 พิกัดเข้าใช้งานสำหรับเครื่องลูกในวง WiFi หน้างาน (Android / iPad / iPhone / Kiosk):`);
    lanIps.forEach(ip => {
      console.log(`   [การ์ดเครือข่าย: ${ip.interface}]`);
      console.log(`   - 📱 จองออนไลน์: http://${ip.address}:${PORT}/booking.html`);
      console.log(`   - 🎟️ จุดขายบัตร: http://${ip.address}:${PORT}/`);
      console.log(`   - 🚪 ตู้ Kiosk:  http://${ip.address}:${PORT}/kiosk.html`);
      console.log(`   - 💻 แดชบอร์ด:   http://${ip.address}:${PORT}/admin.html`);
    });
  } else {
    console.log('⚠️ ไม่พบการเชื่อมต่อเครือข่าย LAN/WiFi กรุณาตรวจสอบเราเตอร์');
  }
  console.log('======================================================================\n');
});

module.exports = { server, broadcastEvent };

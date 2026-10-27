const fs = require('fs');
const path = require('path');

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const bDir = path.join('d:\\BillingApp\\Antigravity\\EventPay\\Backups', `backup_autonomous_zero_slip_bot_${ts}`);

fs.mkdirSync(bDir, { recursive: true });

const files = [
  'server/masterServer.js',
  'js/db.js',
  'js/booking.js',
  'booking.html',
  'js/admin.js',
  'admin.html',
  'js/gate.js',
  'kiosk.html'
];

files.forEach(f => {
  const src = path.join('d:\\BillingApp\\Antigravity\\EventPay', f);
  const dest = path.join(bDir, path.basename(f));
  fs.copyFileSync(src, dest);
  const stats = fs.statSync(dest);
  console.log(`Copied ${f} -> ${stats.size} bytes`);
});

console.log('BACKUP_COMPLETE: ' + bDir);

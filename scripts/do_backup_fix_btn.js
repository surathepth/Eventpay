const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const backupDir = path.join(rootDir, 'Backups', 'backup_fix_zero_slip_simulate_button_20261026_003300');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const files = ['js/booking.js', 'booking.html', 'server/masterServer.js', 'js/db.js'];
files.forEach(f => {
  const src = path.join(rootDir, f);
  const dest = path.join(backupDir, path.basename(f));
  fs.copyFileSync(src, dest);
  console.log(`Backed up: ${f} -> ${dest} (${fs.statSync(dest).size} bytes)`);
});

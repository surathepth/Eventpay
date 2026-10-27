@echo off
chcp 65001 >nul
title [EVENTPAY] LOCAL MASTER SERVER - THEP-APAI & LILIN SUPREME
color 0B

echo ==============================================================================
echo   🚀 [EVENTPAY] เครื่องแม่ข่ายหน้างานคอนเสิร์ต (Local Master Server Hub)
echo   👑 พัฒนาโดย: เทพอภัย ^& ลิลิน (Lilin Supreme AI)
echo   พิกัด: D:\BillingApp\Antigravity\EventPay
echo ==============================================================================
echo.

:: 1. ตรวจสอบ Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] ไม่พบ Node.js ในเครื่องคอมพิวเตอร์นี้!
    echo กรุณาติดตั้ง Node.js จาก https://nodejs.org ก่อนใช้งานค่ะ
    echo.
    pause
    exit /b
)

:: 2. เปิดหน้าต่างเบราว์เซอร์อัตโนมัติหลังสตาร์ท 2 วินาที
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8080/index.html"

:: 3. รัน Master Server ใน Loop (Auto-Restart)
:RUN_SERVER
cls
echo ==============================================================================
echo   🚀 [EVENTPAY] เซิร์ฟเวอร์กำลังทำงานบนพอร์ต 8080...
echo   💻 เข้าใช้งานบนเครื่องแม่ (Localhost):
echo      - 📱 ลูกค้าจองบัตรออนไลน์:   http://localhost:8080/booking.html
echo      - 🎟️ จุดขายบัตร ^& แคชเชียร์: http://localhost:8080/index.html
echo      - 🚪 ประตูคัดกรอง Kiosk:      http://localhost:8080/kiosk.html
echo      - 💻 ศูนย์บัญชาการ Admin:      http://localhost:8080/admin.html
echo ==============================================================================
echo   (กด Ctrl+C หากต้องการหยุดการทำงานของเซิร์ฟเวอร์)
echo.

node "server\masterServer.js"

echo.
echo ⚠️ [คำเตือน] เซิร์ฟเวอร์หยุดทำงาน กำลังรีสตาร์ทใน 3 วินาที...
timeout /t 3 /nobreak >nul
goto RUN_SERVER

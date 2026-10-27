@echo off
chcp 65001 >nul
title [EVENTPAY] OPEN IN EXPLORER MODE (file:///)
color 0A

echo ==============================================================================
echo   📂 [EVENTPAY] เปิดใช้งานระบบในโหมด Windows Explorer (file:///)
echo   👑 พัฒนาโดย: เทพอภัย ^& ลิลิน (Lilin Supreme AI)
echo   รองรับระบบ Self-Healing อัปเกรดข้อมูลแคชเก่าอัตโนมัติ 100%
echo ==============================================================================
echo.

start "" "%~dp0index.html"

echo ✅ เปิดหน้าต่าง index.html ในเบราว์เซอร์เรียบร้อยแล้วค่ะ!
timeout /t 2 /nobreak >nul
exit

@echo off
title Bus Tracker Pro - by Najed Al-Eizari
color 0A
echo.
echo  ==========================================
echo    Bus Tracker Pro
echo    by Najed Al-Eizari  
echo  ==========================================
echo.

echo  [1/3] Adding firewall rules...
netsh advfirewall firewall add rule name="BusTracker-Node" dir=in action=allow program="C:\Program Files\nodejs\node.exe" enable=yes >nul 2>&1
netsh advfirewall firewall add rule name="BusTracker-Cloudflared" dir=in action=allow program="C:\BusTracker\cloudflared.exe" enable=yes >nul 2>&1
netsh advfirewall firewall add rule name="BusTracker-Node-Out" dir=out action=allow program="C:\Program Files\nodejs\node.exe" enable=yes >nul 2>&1
netsh advfirewall firewall add rule name="BusTracker-Cloudflared-Out" dir=out action=allow program="C:\BusTracker\cloudflared.exe" enable=yes >nul 2>&1
echo  Firewall: OK
echo.

echo  [2/3] Starting Server...
start /min node server.js
timeout /t 3 /nobreak > nul
echo  Server: OK [http://localhost:4567]
echo.

echo  [3/3] Creating Internet Link...
echo.
echo  ==========================================
echo  A new window will open with the URL.
echo  Copy the URL from that window.
echo  ==========================================
echo.
start cloudflared.exe tunnel --url http://127.0.0.1:4567 --protocol http2
timeout /t 20 /nobreak > nul

echo  Admin Dashboard: http://localhost:4567/admin.html
echo  Login: admin / admin123
echo.
echo  ==========================================
echo  Press any key to stop everything...
pause > nul
taskkill /f /im node.exe > nul 2>&1
taskkill /f /im cloudflared.exe > nul 2>&1
echo  All stopped.

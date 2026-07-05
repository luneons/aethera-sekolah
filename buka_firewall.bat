@echo off
echo Membuka port 3000 dan 8001 di Windows Firewall...
echo (Membutuhkan hak Administrator)
echo.

:: Hapus rule lama jika ada
netsh advfirewall firewall delete rule name="Aethera LAN" >nul 2>&1

:: Tambah rule baru
netsh advfirewall firewall add rule name="Aethera LAN" dir=in action=allow protocol=TCP localport=3000,8001

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ BERHASIL! Port 3000 dan 8001 sudah dibuka.
    echo.
    echo Sekarang bisa diakses dari perangkat lain di jaringan:
    echo   Frontend : http://192.168.100.142:3000
    echo   Backend  : http://192.168.100.142:8001
) else (
    echo.
    echo ❌ GAGAL! Coba klik kanan file ini dan pilih "Run as administrator"
)

echo.
pause

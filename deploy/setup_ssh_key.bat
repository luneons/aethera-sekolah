@echo off
:: =============================================================================
:: Setup SSH Key untuk akses VPS
:: Jalankan SEKALI sebelum upload_to_vps.bat
:: =============================================================================

set VPS_IP=103.150.116.52
set VPS_USER=luneons

echo ============================================
echo   Setup SSH Key untuk VPS Aethera
echo ============================================
echo.

:: Buat SSH key jika belum ada
if not exist "%USERPROFILE%\.ssh\id_ed25519" (
    echo Membuat SSH key baru...
    ssh-keygen -t ed25519 -C "aethera-vps" -f "%USERPROFILE%\.ssh\id_ed25519" -N ""
    echo.
) else (
    echo SSH key sudah ada di: %USERPROFILE%\.ssh\id_ed25519
    echo.
)

echo ============================================
echo   Public Key Kamu (copy semua teks ini):
echo ============================================
echo.
type "%USERPROFILE%\.ssh\id_ed25519.pub"
echo.
echo ============================================
echo.
echo CARA DAFTARKAN KE VPS:
echo.
echo Opsi 1 - Pakai password login dulu (jika VPS support):
echo   Buka PowerShell/CMD, jalankan:
echo   type "%USERPROFILE%\.ssh\id_ed25519.pub" ^| ssh %VPS_USER%@%VPS_IP% "mkdir -p ~/.ssh ^&^& cat ^>^> ~/.ssh/authorized_keys ^&^& chmod 700 ~/.ssh ^&^& chmod 600 ~/.ssh/authorized_keys"
echo.
echo Opsi 2 - Via panel VPS provider (Biznet Neo):
echo   1. Login ke https://portal.biznetgio.com
echo   2. Buka VPS kamu ^> Console/VNC
echo   3. Login dengan username/password dari email provider
echo   4. Jalankan perintah:
echo      mkdir -p ~/.ssh
echo      nano ~/.ssh/authorized_keys
echo   5. Paste public key di atas, save ^(Ctrl+X, Y, Enter^)
echo   6. chmod 700 ~/.ssh ^&^& chmod 600 ~/.ssh/authorized_keys
echo.
echo Opsi 3 - Pakai Git Bash (jika terinstall):
echo   ssh-copy-id -i ~/.ssh/id_ed25519.pub %VPS_USER%@%VPS_IP%
echo.
echo Setelah selesai, test dengan:
echo   ssh %VPS_USER%@%VPS_IP%
echo.
echo Jika berhasil masuk tanpa password, jalankan upload_to_vps.bat
echo.
pause

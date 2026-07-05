@echo off
:: =============================================================================
:: Upload Aethera ke VPS — versi lengkap
:: Jalankan dari folder root project (Absensi/)
:: =============================================================================

echo ============================================
echo   Upload Aethera ke VPS
echo ============================================
echo.

:: ── Konfigurasi ──────────────────────────────────────────────────────────────
set VPS_IP=103.150.116.52
set VPS_USER=luneons
set REMOTE_DIR=/var/www/aethera
set SSH_KEY=%USERPROFILE%\Downloads\Razor-246810.pem

echo VPS IP   : %VPS_IP%
echo VPS User : %VPS_USER%
echo Remote   : %REMOTE_DIR%
echo.

:: ── Pastikan dijalankan dari folder yang benar ────────────────────────────────
if not exist "backend\app" (
    echo [ERROR] Jalankan script ini dari folder Absensi/
    pause
    exit /b 1
)

:: ── Test koneksi SSH ──────────────────────────────────────────────────────────
echo [0/7] Test koneksi SSH...
ssh -i "%SSH_KEY%" -o ConnectTimeout=10 -o BatchMode=yes %VPS_USER%@%VPS_IP% "echo OK" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Tidak bisa connect ke VPS!
    echo Pastikan SSH key ada di: %SSH_KEY%
    pause
    exit /b 1
)
echo [OK] Koneksi SSH berhasil!
echo.

:: ── Buat folder di VPS ───────────────────────────────────────────────────────
echo [1/7] Buat folder di VPS...
ssh -i "%SSH_KEY%" %VPS_USER%@%VPS_IP% "sudo mkdir -p %REMOTE_DIR%/backend %REMOTE_DIR%/frontend %REMOTE_DIR%/deploy && sudo chown -R %VPS_USER%:%VPS_USER% %REMOTE_DIR%"
echo [OK]

:: ── Upload backend (app + scripts) ───────────────────────────────────────────
echo [2/7] Upload backend...
scp -i "%SSH_KEY%" -r backend\app %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/backend/
scp -i "%SSH_KEY%" backend\requirements.txt %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/backend/
scp -i "%SSH_KEY%" backend\.env.example %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/backend/

:: Upload seed & migration scripts
scp -i "%SSH_KEY%" backend\_migrate.py %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/backend/
scp -i "%SSH_KEY%" backend\_gen_vapid.py %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/backend/
scp -i "%SSH_KEY%" backend\_seed_all_grades.py %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/backend/
scp -i "%SSH_KEY%" backend\_seed_attendance_demo.py %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/backend/

:: Upload SQL files kalau ada
if exist "backend\add_organization_mode.sql" (
    scp -i "%SSH_KEY%" backend\add_organization_mode.sql %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/backend/
)
if exist "backend\add_school_classes.sql" (
    scp -i "%SSH_KEY%" backend\add_school_classes.sql %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/backend/
)
echo [OK]

:: ── Upload frontend ───────────────────────────────────────────────────────────
echo [3/7] Upload frontend...
scp -i "%SSH_KEY%" -r frontend\src %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/frontend/
scp -i "%SSH_KEY%" -r frontend\public %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/frontend/
scp -i "%SSH_KEY%" frontend\package.json %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/frontend/
scp -i "%SSH_KEY%" frontend\package-lock.json %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/frontend/
scp -i "%SSH_KEY%" frontend\next.config.mjs %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/frontend/
scp -i "%SSH_KEY%" frontend\tailwind.config.ts %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/frontend/
scp -i "%SSH_KEY%" frontend\tsconfig.json %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/frontend/
scp -i "%SSH_KEY%" frontend\postcss.config.mjs %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/frontend/
if exist "frontend\.env.local.example" (
    scp -i "%SSH_KEY%" frontend\.env.local.example %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/frontend/
)
echo [OK]

:: ── Upload deploy scripts ─────────────────────────────────────────────────────
echo [4/7] Upload deploy scripts...
scp -i "%SSH_KEY%" -r deploy %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/
echo [OK]

:: ── Upload wa-gateway ─────────────────────────────────────────────────────────
echo [5/7] Upload wa-gateway...
if exist "wa-gateway" (
    ssh -i "%SSH_KEY%" %VPS_USER%@%VPS_IP% "mkdir -p %REMOTE_DIR%/wa-gateway"
    scp -i "%SSH_KEY%" -r wa-gateway\src %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/wa-gateway/
    scp -i "%SSH_KEY%" wa-gateway\package.json %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/wa-gateway/
    echo [OK]
) else (
    echo [SKIP] Folder wa-gateway tidak ditemukan
)

:: ── Upload models AI ──────────────────────────────────────────────────────────
echo [6/7] Upload AI models...
if exist "backend\models" (
    ssh -i "%SSH_KEY%" %VPS_USER%@%VPS_IP% "mkdir -p %REMOTE_DIR%/backend/models"
    scp -i "%SSH_KEY%" backend\models\*.onnx %VPS_USER%@%VPS_IP%:%REMOTE_DIR%/backend/models/
    echo [OK]
) else (
    echo [SKIP] Folder models tidak ditemukan - akan auto-download saat pertama run
)

:: ── Set permissions ───────────────────────────────────────────────────────────
echo [7/7] Set permissions...
ssh -i "%SSH_KEY%" %VPS_USER%@%VPS_IP% "chmod +x %REMOTE_DIR%/deploy/*.sh && echo OK"
echo [OK]

echo.
echo ============================================
echo   Upload Selesai!
echo ============================================
echo.
echo Langkah selanjutnya - SSH ke VPS:
echo   ssh -i "%SSH_KEY%" %VPS_USER%@%VPS_IP%
echo.
echo Lalu jalankan update:
echo   sudo bash %REMOTE_DIR%/deploy/update_app.sh
echo.
echo Atau kalau PERTAMA KALI setup:
echo   sudo bash %REMOTE_DIR%/deploy/setup_vps.sh
echo   sudo bash %REMOTE_DIR%/deploy/setup_database.sh
echo   sudo bash %REMOTE_DIR%/deploy/setup_app.sh
echo   sudo bash %REMOTE_DIR%/deploy/setup_nginx.sh aethera.my.id admin@aethera.my.id
echo   sudo bash %REMOTE_DIR%/deploy/setup_services.sh
echo.
pause

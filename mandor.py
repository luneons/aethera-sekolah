import os
import time
import re
import subprocess
import atexit

# Kode sakti Windows untuk menyembunyikan terminal
CREATE_NO_WINDOW = 0x08000000
daftar_proses = []

def bersihkan_proses():
    print("\n🛑 Sabar, lagi mematikan semua server hantu di background...")
    for p in daftar_proses:
        try:
            # /F (Force) /T (Tree - bunuh sampai ke akar-akarnya)
            subprocess.run(['taskkill', '/F', '/T', '/PID', str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except:
            pass
    print("✅ Semua server udah mati dengan aman! Port 3000 & 8001 sudah bebas.")

# Pastikan fungsi bersih-bersih dipanggil saat script ini ditutup
atexit.register(bersihkan_proses)

def update_env_file(filepath, key, new_val):
    if not os.path.exists(filepath):
        print(f"File {filepath} tidak ditemukan!")
        return
    with open(filepath, 'r') as file:
        lines = file.readlines()
    updated = False
    with open(filepath, 'w') as file:
        for line in lines:
            if line.startswith(key):
                file.write(f"{key}={new_val}\n")
                updated = True
            else:
                file.write(line)
        if not updated:
            file.write(f"\n{key}={new_val}\n")

def get_cloudflare_url(log_file):
    print(f"[*] Menunggu URL Cloudflare dari {log_file}...")
    for _ in range(20):
        if os.path.exists(log_file):
            with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                match = re.search(r"(https://[a-zA-Z0-9-]+\.trycloudflare\.com)", content)
                if match:
                    return match.group(1)
        time.sleep(1)
    return None

def jalankan_siluman(perintah):
    # Menjalankan proses tanpa memunculkan jendela baru
    p = subprocess.Popen(perintah, shell=True, creationflags=CREATE_NO_WINDOW)
    daftar_proses.append(p)

print("====================================")
print("🚀 MENU Aethera AUTO-RUNNER (STEALTH) 🚀")
print("====================================")
print("1. Jalankan LOKAL (localhost)")
print("2. Jalankan ONLINE (Cloudflare Tunnel)")
print("3. Jalankan LAN (akses dari HP/PC satu jaringan WiFi)")
pilihan = input("Pilih menu (1, 2, atau 3): ")

if pilihan == "1":
    print("\n✅ Memulai versi LOKAL di background...")
    update_env_file('backend/.env', 'CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001')
    update_env_file('frontend/.env.local', 'NEXT_PUBLIC_API_URL', 'http://127.0.0.1:8001/v1')
    update_env_file('frontend/.env.local', 'NEXT_PUBLIC_API_BASE', 'http://127.0.0.1:8001')
    
    jalankan_siluman('cd backend && .\\.venv\\Scripts\\activate && python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload')
    jalankan_siluman('cd frontend && npm run dev')

elif pilihan == "2":
    print("\n🌐 Memulai versi ONLINE di background (Harap tunggu...)")
    if os.path.exists("back.log"): os.remove("back.log")
    if os.path.exists("front.log"): os.remove("front.log")

    jalankan_siluman('npx cloudflared tunnel --url http://127.0.0.1:8001 2> back.log')
    jalankan_siluman('npx cloudflared tunnel --url http://localhost:3000 2> front.log')

    url_backend = get_cloudflare_url("back.log")
    url_frontend = get_cloudflare_url("front.log")

    if url_backend and url_frontend:
        print(f"\n[SUKSES] URL Backend: {url_backend}")
        print(f"[SUKSES] URL Frontend: {url_frontend}")
        
        print("⚙️ Menulis otomatis ke file .env...")
        update_env_file('backend/.env', 'CORS_ORIGINS', f'http://localhost:3000,http://localhost:3001,{url_frontend}')
        update_env_file('frontend/.env.local', 'NEXT_PUBLIC_API_URL', f'{url_backend}/v1')
        update_env_file('frontend/.env.local', 'NEXT_PUBLIC_API_BASE', f'{url_backend}')
        
        print("🚀 Menyalakan Server Backend & Frontend di background...")
        jalankan_siluman('cd backend && .\\.venv\\Scripts\\activate && python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload')
        jalankan_siluman('cd frontend && npm run dev')
        
        print(f"\n🎉 SELESAI! Bagikan link ini ke teman lu:\n👉 {url_frontend}")
    else:
        print("\n❌ Gagal mendapatkan URL Cloudflare. Coba jalankan ulang.")

elif pilihan == "3":
    import socket

    # Auto-detect IP LAN
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        lan_ip = s.getsockname()[0]
        s.close()
    except Exception:
        lan_ip = "192.168.100.142"  # fallback manual

    print(f"\n🌐 IP LAN terdeteksi: {lan_ip}")
    print(f"   Backend  → http://{lan_ip}:8001")
    print(f"   Frontend → http://{lan_ip}:3000")

    # Update CORS: izinkan akses dari IP LAN
    cors = (
        f"http://localhost:3000,"
        f"http://localhost:3001,"
        f"http://{lan_ip}:3000,"
        f"http://{lan_ip}:3001"
    )
    update_env_file('backend/.env', 'CORS_ORIGINS', cors)

    # Update frontend env agar API request ke IP LAN (bukan 127.0.0.1)
    update_env_file('frontend/.env.local', 'NEXT_PUBLIC_API_URL', f'http://{lan_ip}:8001/v1')
    update_env_file('frontend/.env.local', 'NEXT_PUBLIC_API_BASE', f'http://{lan_ip}:8001')

    print("\n✅ Konfigurasi .env sudah diupdate!")
    print("🚀 Menyalakan server di background...")

    # Backend bind ke 0.0.0.0 agar bisa diakses dari LAN
    jalankan_siluman(
        'cd backend && .\\.venv\\Scripts\\activate && '
        'python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload'
    )
    # Frontend bind ke 0.0.0.0 agar bisa diakses dari LAN
    jalankan_siluman('cd frontend && npm run dev -- --hostname 0.0.0.0')

    print(f"\n🎉 SELESAI! Akses dari perangkat lain di jaringan yang sama:")
    print(f"   👉 http://{lan_ip}:3000")
    print(f"\n💡 Pastikan Windows Firewall tidak memblokir port 3000 dan 8001.")
    print(f"   Jika tidak bisa akses, jalankan perintah ini di PowerShell (Admin):")
    print(f"   netsh advfirewall firewall add rule name=\"Aethera\" dir=in action=allow protocol=TCP localport=3000,8001")

# Ini bagian yang menahan agar script tidak langsung tertutup
if pilihan in ["1", "2", "3"]:
    print("\n" + "="*40)
    print("🟢 SEMUA SERVER SEDANG BERJALAN 🟢")
    print("Taskbar lu sekarang bersih!")
    print("="*40)
    input("\n⚠️  Tekan tombol ENTER di terminal ini jika ingin MEMATIKAN semuanya...\n")
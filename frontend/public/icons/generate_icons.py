"""
Generate PWA icons + maskable + monochrome + screenshots dari logo-source.png.
Run: python generate_icons.py
Requires: pip install Pillow
"""
from PIL import Image, ImageDraw
import os

SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
MASKABLE_SIZES = [192, 512]
MONOCHROME_SIZES = [512]

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_FILE = os.path.join(OUTPUT_DIR, "logo-source.png")

BG_COLOR = (5, 10, 15, 255)  # #050a0f


def _flatten_to_bg(img: Image.Image, size: int) -> Image.Image:
    """Resize logo + tempel di atas background gelap (full bleed)."""
    resized = img.resize((size, size), Image.LANCZOS)
    bg = Image.new("RGBA", (size, size), BG_COLOR)
    bg.paste(resized, (0, 0), resized)
    return bg


def generate_standard():
    """Icon dengan purpose=any — fokus logo memenuhi canvas."""
    src = Image.open(SOURCE_FILE).convert("RGBA")
    print(f"✅ Source: {src.size[0]}x{src.size[1]}px")
    for size in SIZES:
        out = _flatten_to_bg(src, size).convert("RGB")
        out.save(os.path.join(OUTPUT_DIR, f"icon-{size}.png"), "PNG", optimize=True)
        print(f"  · icon-{size}.png")


def generate_maskable():
    """Maskable icon — Android safe zone 80% (logo lebih kecil + padding)."""
    src = Image.open(SOURCE_FILE).convert("RGBA")
    for size in MASKABLE_SIZES:
        canvas = Image.new("RGBA", (size, size), BG_COLOR)
        # Safe zone: logo hanya menempati 70% dari canvas, sisanya padding
        inner = int(size * 0.70)
        logo = src.resize((inner, inner), Image.LANCZOS)
        offset = (size - inner) // 2
        canvas.paste(logo, (offset, offset), logo)
        canvas.convert("RGB").save(
            os.path.join(OUTPUT_DIR, f"maskable-{size}.png"), "PNG", optimize=True
        )
        print(f"  · maskable-{size}.png")


def generate_monochrome():
    """Monochrome icon — silhouette putih untuk Android adaptive themed icon."""
    src = Image.open(SOURCE_FILE).convert("RGBA")
    for size in MONOCHROME_SIZES:
        # Buat versi alpha-only putih
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        inner = int(size * 0.70)
        logo = src.resize((inner, inner), Image.LANCZOS)
        # Convert ke putih solid dengan alpha dari logo
        r, g, b, a = logo.split()
        white = Image.new("L", logo.size, 255)
        mono = Image.merge("RGBA", (white, white, white, a))
        offset = (size - inner) // 2
        canvas.paste(mono, (offset, offset), mono)
        canvas.save(
            os.path.join(OUTPUT_DIR, f"monochrome-{size}.png"), "PNG", optimize=True
        )
        print(f"  · monochrome-{size}.png")


def _draw_card(draw, x, y, w, h, fill, radius=14):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill)


def create_screenshot_mobile():
    """Screenshot 390x844 (iPhone-ish) untuk PWA install prompt."""
    img = Image.new("RGB", (390, 844), (5, 10, 15))
    draw = ImageDraw.Draw(img)

    # Header bar
    draw.rectangle([0, 0, 390, 60], fill=(10, 20, 30))

    if os.path.exists(SOURCE_FILE):
        logo = Image.open(SOURCE_FILE).convert("RGBA")
        logo = logo.resize((36, 36), Image.LANCZOS)
        img.paste(logo, (12, 12), logo)

    draw.text((60, 18), "AETHERA", fill=(56, 189, 248))
    draw.text((20, 100), "Dashboard", fill=(255, 255, 255))
    draw.text((20, 130), "Platform Sekolah Modern", fill=(100, 120, 140))

    cards = [
        ("Total Siswa", "42", (14, 165, 233)),
        ("Hadir", "38", (34, 197, 94)),
        ("Terlambat", "3", (168, 85, 247)),
        ("Tidak Hadir", "1", (239, 68, 68)),
    ]
    for i, (label, val, color) in enumerate(cards):
        col = i % 2
        row = i // 2
        x = 20 + col * 185
        y = 180 + row * 110
        _draw_card(draw, x, y, 170, 95, (10, 20, 30))
        draw.text((x + 15, y + 15), val, fill=color)
        draw.text((x + 15, y + 55), label, fill=(100, 120, 140))

    # Big chart placeholder
    _draw_card(draw, 20, 410, 350, 200, (10, 20, 30))
    draw.text((35, 425), "Tren Kehadiran 7 Hari", fill=(255, 255, 255))
    bars = [50, 70, 60, 90, 80, 95, 75]
    for idx, v in enumerate(bars):
        bx = 40 + idx * 46
        bh = int(v * 1.3)
        draw.rounded_rectangle(
            [bx, 580 - bh, bx + 32, 580], radius=6, fill=(14, 165, 233)
        )

    # Leaderboard list
    _draw_card(draw, 20, 630, 350, 180, (10, 20, 30))
    draw.text((35, 645), "Papan Peringkat Kelas", fill=(255, 255, 255))
    rows = [
        ("11 IPA 1", "92.3"),
        ("10 IPA 2", "89.1"),
        ("12 IPS 1", "86.4"),
    ]
    for i, (cls, score) in enumerate(rows):
        y = 680 + i * 38
        draw.text((40, y), f"#{i + 1}  {cls}", fill=(220, 230, 240))
        draw.text((310, y), score, fill=(56, 189, 248))

    img.save(os.path.join(OUTPUT_DIR, "screenshot-mobile.png"), "PNG", optimize=True)
    print("  · screenshot-mobile.png (390x844)")


def create_screenshot_wide():
    """Screenshot 1280x800 untuk desktop install prompt."""
    img = Image.new("RGB", (1280, 800), (5, 10, 15))
    draw = ImageDraw.Draw(img)

    # Sidebar
    draw.rectangle([0, 0, 240, 800], fill=(10, 21, 32))
    if os.path.exists(SOURCE_FILE):
        logo = Image.open(SOURCE_FILE).convert("RGBA").resize((36, 36), Image.LANCZOS)
        img.paste(logo, (24, 24), logo)
    draw.text((72, 30), "AETHERA", fill=(56, 189, 248))
    nav_items = [
        "Dashboard", "Absensi", "Papan Peringkat", "Persetujuan",
        "Tugas & Nilai", "Materi", "Mata Pelajaran",
        "Pengguna", "Chat", "Notifikasi", "Profil",
    ]
    for i, item in enumerate(nav_items):
        y = 90 + i * 38
        draw.text((24, y), item, fill=(180, 195, 210))

    # Top bar
    draw.rectangle([240, 0, 1280, 70], fill=(8, 14, 22))
    draw.text((265, 22), "Dashboard Kepala Sekolah", fill=(255, 255, 255))
    draw.text((1100, 24), "🔔  Bell • Profile", fill=(140, 160, 180))

    # KPI cards
    kpis = [
        ("Total Siswa", "486", (14, 165, 233)),
        ("Hadir Hari Ini", "452", (34, 197, 94)),
        ("Terlambat", "21", (251, 191, 36)),
        ("Disiplin Skor Rata-rata", "87.5", (168, 85, 247)),
    ]
    for i, (label, val, color) in enumerate(kpis):
        x = 270 + i * 245
        _draw_card(draw, x, 100, 220, 100, (10, 20, 30))
        draw.text((x + 16, y + 0), "", fill=color)  # placeholder
        draw.text((x + 16, 116), val, fill=color)
        draw.text((x + 16, 156), label, fill=(140, 160, 180))

    # Big chart panel
    _draw_card(draw, 270, 230, 620, 300, (10, 20, 30))
    draw.text((290, 250), "Tren Kehadiran Bulanan", fill=(255, 255, 255))
    bars = [120, 150, 180, 220, 180, 240, 210, 260, 230, 280, 250, 300]
    for idx, v in enumerate(bars):
        bx = 300 + idx * 47
        bh = int(v * 0.7)
        draw.rounded_rectangle(
            [bx, 510 - bh, bx + 30, 510], radius=6, fill=(14, 165, 233)
        )

    # Leaderboard panel
    _draw_card(draw, 920, 230, 320, 300, (10, 20, 30))
    draw.text((940, 250), "Top 5 Kelas", fill=(255, 255, 255))
    rows = [
        ("11 IPA 1", "92.3"),
        ("10 IPA 2", "89.1"),
        ("12 IPS 1", "86.4"),
        ("11 IPS 2", "84.7"),
        ("10 TKJ 1", "81.2"),
    ]
    for i, (cls, score) in enumerate(rows):
        y = 290 + i * 40
        draw.text((950, y), f"#{i + 1}", fill=(56, 189, 248))
        draw.text((990, y), cls, fill=(220, 230, 240))
        draw.text((1180, y), score, fill=(56, 189, 248))

    # Bottom row — recap cards
    for i, (title, body) in enumerate(
        [
            ("Live Sync", "Kiosk aktif · 3 kamera"),
            ("Persetujuan", "2 KTS menunggu kepsek"),
            ("Notifikasi", "12 broadcast minggu ini"),
        ]
    ):
        x = 270 + i * 320
        _draw_card(draw, x, 560, 295, 180, (10, 20, 30))
        draw.text((x + 16, 580), title, fill=(56, 189, 248))
        draw.text((x + 16, 615), body, fill=(180, 195, 210))

    img.save(os.path.join(OUTPUT_DIR, "screenshot-wide.png"), "PNG", optimize=True)
    print("  · screenshot-wide.png (1280x800)")


if __name__ == "__main__":
    print("🎨 Generate PWA icons + screenshots...")
    print(f"📁 Output: {OUTPUT_DIR}")
    print()

    if not os.path.exists(SOURCE_FILE):
        print(f"❌ File tidak ditemukan: {SOURCE_FILE}")
        print("   Simpan logo kamu sebagai 'logo-source.png' di folder ini dulu.")
        raise SystemExit(1)

    try:
        generate_standard()
        generate_maskable()
        generate_monochrome()
        create_screenshot_mobile()
        create_screenshot_wide()
        print()
        print("🎉 Selesai!")
        print()
        print("Langkah selanjutnya:")
        print("  1. Upload ke VPS: deploy\\upload_to_vps.bat")
        print("  2. Hapus PWA lama di HP → install ulang dari browser")
    except ImportError:
        print("❌ Pillow belum terinstall. Jalankan: pip install Pillow")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

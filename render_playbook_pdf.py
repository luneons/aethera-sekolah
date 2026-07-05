# -*- coding: utf-8 -*-
"""Render sales_playbook.html jadi PDF A4 multi-halaman.

Jalankan: backend\\.venv\\Scripts\\python.exe render_playbook_pdf.py
Output  : Cara_Menjual_Aethera.pdf
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

HTML = Path("sales_playbook.html").resolve().as_uri()
OUT = "Cara_Menjual_Aethera.pdf"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto(HTML, wait_until="networkidle")
    page.wait_for_timeout(1200)  # tunggu font ke-load
    page.pdf(
        path=OUT,
        format="A4",
        print_background=True,
        prefer_css_page_size=True,
        margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
    )
    browser.close()

print("OK tersimpan:", OUT)

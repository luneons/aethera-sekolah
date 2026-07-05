# -*- coding: utf-8 -*-
"""Render elemen mockup dari ppt_elements.html jadi PNG per-elemen.

Tiap elemen <div data-shot="nama"> di-screenshot terpisah dengan
background transparan. Output: ppt_assets/el_<nama>.png
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

HTML = Path("ppt_elements.html").resolve().as_uri()
OUT = Path("ppt_assets")
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(device_scale_factor=3)  # 3x = sangat tajam
    page = ctx.new_page()
    page.goto(HTML, wait_until="networkidle")
    page.wait_for_timeout(1500)  # tunggu font ke-load

    shots = page.query_selector_all("[data-shot]")
    print(f"Menemukan {len(shots)} elemen")
    for el in shots:
        name = el.get_attribute("data-shot")
        path = OUT / f"el_{name}.png"
        el.screenshot(path=str(path), omit_background=True)
        print(f"  [OK] el_{name}.png")

    browser.close()

print("\nSelesai.")

"""Legacy seed — DEPRECATED.

Aplikasi ini sekarang fokus mode sekolah. Pakai `seed_simmico.py`
untuk data demo. Script ini di-keep untuk reference saja.
"""
import asyncio
import sys


async def run() -> None:
    print("Script ini deprecated. Pakai: python -m app.seed_simmico")
    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(run())

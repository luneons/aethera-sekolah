"""Simple in-memory IP-based rate limiter.

Keterbatasan:
- Per-process memory (kalau workers > 1, limit dihitung per worker, bukan global).
- Untuk production scale, ganti pakai Redis. Untuk MVP cukup.

Pakai sebagai FastAPI dependency:

    from app.services.rate_limiter import limit_kiosk

    @router.post("/checkin")
    async def checkin(request: Request, _: None = Depends(limit_kiosk), ...):
        ...
"""
from __future__ import annotations

import ipaddress
import time
from collections import defaultdict, deque
from typing import Callable, Deque, Dict

from fastapi import HTTPException, Request

# Trusted reverse proxy CIDR ranges.
# Hanya trust X-Forwarded-For kalau request datang dari salah satu IP ini.
_TRUSTED_PROXIES: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    ipaddress.ip_network("127.0.0.0/8"),    # localhost
    ipaddress.ip_network("10.0.0.0/8"),     # private class A
    ipaddress.ip_network("172.16.0.0/12"),  # private class B
    ipaddress.ip_network("192.168.0.0/16"), # private class C
    ipaddress.ip_network("::1/128"),        # IPv6 localhost
]


def _is_trusted_proxy(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
        return any(addr in net for net in _TRUSTED_PROXIES)
    except ValueError:
        return False


def _client_ip(request: Request) -> str:
    """Return real client IP.

    Hanya trust X-Forwarded-For kalau request datang dari trusted proxy
    (Nginx, load balancer internal). Kalau tidak, pakai request.client.host
    langsung — tidak bisa di-spoof.
    """
    direct_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and _is_trusted_proxy(direct_ip):
        return forwarded.split(",")[0].strip()
    return direct_ip


class _RollingWindowLimiter:
    """Token-bucket-style sliding window rate limiter."""

    def __init__(self, max_calls: int, window_seconds: int):
        self.max_calls = max_calls
        self.window = window_seconds
        self._buckets: Dict[str, Deque[float]] = defaultdict(deque)

    def check(self, key: str) -> tuple[bool, int]:
        """Return (allowed, retry_after_seconds)."""
        now = time.monotonic()
        bucket = self._buckets[key]

        # Trim old timestamps outside the window
        cutoff = now - self.window
        while bucket and bucket[0] < cutoff:
            bucket.popleft()

        if len(bucket) >= self.max_calls:
            retry_after = int(self.window - (now - bucket[0])) + 1
            return False, retry_after

        bucket.append(now)
        return True, 0


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # Take first IP (most likely original client)
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def make_limiter(max_calls: int, window_seconds: int, label: str = "request") -> Callable:
    """Factory: bikin FastAPI dependency function dengan limit tertentu."""
    limiter = _RollingWindowLimiter(max_calls, window_seconds)
    _ALL_LIMITERS.append(limiter)

    async def dependency(request: Request) -> None:
        ip = _client_ip(request)
        ok, retry = limiter.check(f"{label}:{ip}")
        if not ok:
            raise HTTPException(
                status_code=429,
                detail=f"Terlalu banyak {label}. Coba lagi dalam {retry} detik.",
                headers={"Retry-After": str(retry)},
            )

    return dependency


# Registry semua limiter yang dibuat — buat reset di test.
_ALL_LIMITERS: list[_RollingWindowLimiter] = []


def reset_all_limiters() -> None:
    """Clear all rate-limiter buckets. Dipakai di test fixture biar tidak ada residual."""
    for limiter in _ALL_LIMITERS:
        limiter._buckets.clear()


# Pre-built limiters for common cases
# Kiosk attendance: 30 calls/menit per IP (ada delay scan ~2s)
limit_kiosk = make_limiter(30, 60, "absensi")

# Face test: 20 calls/menit
limit_face_test = make_limiter(20, 60, "tes wajah")

# Generic public endpoint: 60/menit
limit_public = make_limiter(60, 60, "permintaan")

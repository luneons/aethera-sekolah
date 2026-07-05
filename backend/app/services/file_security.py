"""File upload security helpers.

Validate by content (magic bytes) bukan hanya by header.
Header `Content-Type` mudah dipalsukan client. Magic bytes lebih reliable.
"""
from __future__ import annotations

from typing import Optional


# Magic byte signatures untuk format umum
_SIGNATURES = {
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/webp": [b"RIFF"],  # diikuti "WEBP" di byte 8
    "image/gif": [b"GIF87a", b"GIF89a"],
    "application/pdf": [b"%PDF-"],
    "application/zip": [b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"],  # juga xlsx, docx, pptx
}

# xlsx, docx, pptx semua zip-based
_ZIP_BASED = {"application/vnd.openxmlformats-officedocument", "application/zip"}


def detect_mime(content: bytes) -> Optional[str]:
    """Tebak MIME dari magic bytes. Return None kalau gak kenal."""
    if not content:
        return None
    for mime, sigs in _SIGNATURES.items():
        if mime == "image/webp":
            # Special: RIFF + WEBP
            if content.startswith(b"RIFF") and len(content) >= 12 and content[8:12] == b"WEBP":
                return "image/webp"
            continue
        if any(content.startswith(s) for s in sigs):
            return mime
    return None


def validate_file(
    content: bytes,
    *,
    allowed_categories: list[str],
    max_size_bytes: int,
    declared_mime: Optional[str] = None,
) -> tuple[bool, Optional[str], Optional[str]]:
    """Validate file content. Return (ok, detected_mime, error_message).

    `allowed_categories` contoh: ["image", "pdf"], ["spreadsheet"], ["document"].
    """
    if not content:
        return False, None, "File kosong"
    if len(content) > max_size_bytes:
        return False, None, f"Ukuran file maksimal {max_size_bytes // 1024 // 1024}MB"

    detected = detect_mime(content)

    # Untuk Office files berbasis ZIP — kalau header mengaku xlsx/docx tapi byte ZIP, OK.
    if not detected and declared_mime:
        if any(declared_mime.startswith(p) for p in _ZIP_BASED):
            if content.startswith(b"PK"):
                detected = declared_mime

    if not detected:
        return False, None, "Format file tidak dikenali. Pastikan file tidak corrupt."

    cat_match = False
    for cat in allowed_categories:
        if cat == "image" and detected.startswith("image/"):
            cat_match = True
        elif cat == "pdf" and detected == "application/pdf":
            cat_match = True
        elif cat == "spreadsheet" and (
            detected.startswith("application/vnd.openxmlformats")
            or detected == "application/zip"
            or detected == "text/csv"
        ):
            cat_match = True
        elif cat == "document" and detected.startswith("application/vnd.openxmlformats"):
            cat_match = True
        elif cat == "any":
            cat_match = True

    if not cat_match:
        return False, detected, f"Tipe file {detected} tidak diizinkan untuk endpoint ini"

    return True, detected, None


def safe_filename(original: str, *, max_len: int = 80) -> str:
    """Sanitasi nama file untuk safe storage. Drop path traversal, special chars."""
    import re
    base = original.replace("\\", "/").split("/")[-1]
    base = re.sub(r"[^\w\-. ]", "_", base)
    if len(base) > max_len:
        ext = base.rsplit(".", 1)[-1] if "." in base else ""
        stem = base.rsplit(".", 1)[0] if "." in base else base
        base = stem[: max_len - len(ext) - 1] + ("." + ext if ext else "")
    return base or "untitled"

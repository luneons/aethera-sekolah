"""Test security helpers: AES embedding encryption, file validator."""
import numpy as np
import pytest


def test_face_embedding_aes_roundtrip():
    """Encrypt + decrypt embedding harus return vector identik."""
    from app.services.face_service import deserialize_embedding, serialize_embedding

    original = np.random.randn(512).astype(np.float32)
    blob = serialize_embedding(original)

    # Magic byte v2
    assert blob[0] == 0x02
    # Lebih panjang dari plaintext (karena ada nonce + tag overhead)
    assert len(blob) > len(original.tobytes())

    decrypted = deserialize_embedding(blob)
    assert np.array_equal(original, decrypted)


def test_file_validator_rejects_fake_extension():
    """Upload .png yang isinya text bukan PNG → harus reject."""
    from app.services.file_security import validate_file

    # File text tapi declared image/png
    fake = b"This is just a text file, not an image"
    ok, mime, err = validate_file(
        fake,
        allowed_categories=["image"],
        max_size_bytes=1024 * 1024,
        declared_mime="image/png",
    )
    assert ok is False
    assert err is not None


def test_file_validator_accepts_real_png():
    """File dengan PNG magic bytes harus pass."""
    from app.services.file_security import validate_file

    png_header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    ok, mime, err = validate_file(
        png_header,
        allowed_categories=["image"],
        max_size_bytes=1024 * 1024,
        declared_mime="image/png",
    )
    assert ok is True
    assert mime == "image/png"


def test_file_validator_rejects_oversized():
    from app.services.file_security import validate_file

    big = b"\x89PNG\r\n\x1a\n" + b"x" * 2_000_000  # 2MB
    ok, mime, err = validate_file(
        big,
        allowed_categories=["image"],
        max_size_bytes=1_000_000,  # 1MB limit
        declared_mime="image/png",
    )
    assert ok is False
    assert "maksimal" in (err or "").lower()


def test_safe_filename_strips_path_traversal():
    from app.services.file_security import safe_filename

    assert safe_filename("../../etc/passwd") == "passwd"
    assert safe_filename("good_name.jpg") == "good_name.jpg"
    assert "<" not in safe_filename("<script>alert(1)</script>.png")


def test_password_hashing_works():
    from app.security import hash_password, verify_password

    h = hash_password("rahasia123")
    assert h != "rahasia123"
    assert verify_password("rahasia123", h) is True
    assert verify_password("salah", h) is False


def test_jwt_create_and_decode():
    from app.security import create_access_token, decode_token

    token = create_access_token(42)
    user_id = decode_token(token, "access")
    assert user_id == 42


def test_jwt_wrong_type_raises():
    from fastapi import HTTPException
    from app.security import create_access_token, decode_token

    token = create_access_token(42)
    with pytest.raises(HTTPException) as exc_info:
        decode_token(token, "refresh")
    assert exc_info.value.status_code == 401

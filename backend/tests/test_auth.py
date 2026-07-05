"""Test login flow + brute-force protection + 2FA + logout revocation."""
import pytest


async def test_login_success_with_correct_credentials(client, seed_kepsek):
    r = await client.post(
        "/v1/auth/login",
        json={"email": "kepsek@test.id", "password": "password123"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["requires_2fa"] is False
    assert body["data"]["access_token"]
    assert body["data"]["refresh_token"]


async def test_login_wrong_password_returns_401(client, seed_kepsek):
    r = await client.post(
        "/v1/auth/login",
        json={"email": "kepsek@test.id", "password": "wrong"},
    )
    assert r.status_code == 401


async def test_login_locks_account_after_5_failed_attempts(client, seed_kepsek):
    # 5 failed attempts → kunci. Attempt ke-5 sudah harus 429.
    for i in range(4):
        r = await client.post(
            "/v1/auth/login",
            json={"email": "kepsek@test.id", "password": "wrong"},
        )
        assert r.status_code == 401, f"Attempt {i+1} should be 401"

    # Attempt ke-5 trigger lockout
    r = await client.post(
        "/v1/auth/login",
        json={"email": "kepsek@test.id", "password": "wrong"},
    )
    assert r.status_code == 429

    # Bahkan password BENAR pun gagal karena terkunci
    r = await client.post(
        "/v1/auth/login",
        json={"email": "kepsek@test.id", "password": "password123"},
    )
    assert r.status_code == 429


async def test_me_returns_user_info_with_valid_token(client, seed_kepsek):
    login = await client.post(
        "/v1/auth/login",
        json={"email": "kepsek@test.id", "password": "password123"},
    )
    token = login.json()["data"]["access_token"]
    r = await client.get(
        "/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["data"]["email"] == "kepsek@test.id"


async def test_logout_revokes_token(client, seed_kepsek):
    login = await client.post(
        "/v1/auth/login",
        json={"email": "kepsek@test.id", "password": "password123"},
    )
    token = login.json()["data"]["access_token"]

    # Token works
    r1 = await client.get(
        "/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r1.status_code == 200

    # Logout
    r_logout = await client.post(
        "/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r_logout.status_code == 200

    # Same token sekarang harus reject
    r2 = await client.get(
        "/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 401

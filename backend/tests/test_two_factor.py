"""Test 2FA TOTP flow."""
import pyotp
import pytest


async def _login_token(client, email: str, password: str) -> str:
    r = await client.post(
        "/v1/auth/login",
        json={"email": email, "password": password},
    )
    body = r.json()
    if r.status_code != 200 or not body.get("data"):
        raise AssertionError(f"login failed: {r.status_code} {body}")
    return body["data"]["access_token"]


async def test_2fa_setup_init_generates_secret(client, seed_kepsek):
    token = await _login_token(client, "kepsek@test.id", "password123")
    r = await client.post(
        "/v1/2fa/setup-init",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "secret" in body["data"]
    assert "qr_uri" in body["data"]
    assert body["data"]["qr_uri"].startswith("otpauth://")


async def test_2fa_full_flow_enable_then_login(client, seed_kepsek):
    token = await _login_token(client, "kepsek@test.id", "password123")
    headers = {"Authorization": f"Bearer {token}"}

    # Init
    r = await client.post("/v1/2fa/setup-init", headers=headers)
    assert r.status_code == 200
    secret = r.json()["data"]["secret"]

    # Verify dengan code beneran
    code = pyotp.TOTP(secret).now()
    r2 = await client.post(
        "/v1/2fa/setup-verify",
        json={"code": code},
        headers=headers,
    )
    assert r2.status_code == 200
    assert r2.json()["data"]["enabled"] is True
    recovery = r2.json()["data"]["recovery_codes"]
    assert len(recovery) == 10

    # Status check
    r3 = await client.get("/v1/2fa/status", headers=headers)
    assert r3.json()["data"]["enabled"] is True

    # Login sekarang harus return challenge token (bukan access)
    login = await client.post(
        "/v1/auth/login",
        json={"email": "kepsek@test.id", "password": "password123"},
    )
    assert login.status_code == 200
    assert login.json()["data"]["requires_2fa"] is True
    challenge = login.json()["data"]["challenge_token"]
    assert challenge

    # Submit TOTP code untuk dapat access token
    code2 = pyotp.TOTP(secret).now()
    r_2fa = await client.post(
        "/v1/auth/login-2fa",
        json={"challenge_token": challenge, "code": code2, "use_recovery": False},
    )
    assert r_2fa.status_code == 200
    assert r_2fa.json()["data"]["access_token"]


async def test_2fa_recovery_code_works(client, seed_kepsek):
    token = await _login_token(client, "kepsek@test.id", "password123")
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.post("/v1/2fa/setup-init", headers=headers)
    secret = r.json()["data"]["secret"]
    r2 = await client.post(
        "/v1/2fa/setup-verify",
        json={"code": pyotp.TOTP(secret).now()},
        headers=headers,
    )
    recovery = r2.json()["data"]["recovery_codes"]

    # Login dengan recovery code, bukan TOTP
    login = await client.post(
        "/v1/auth/login",
        json={"email": "kepsek@test.id", "password": "password123"},
    )
    challenge = login.json()["data"]["challenge_token"]

    r_2fa = await client.post(
        "/v1/auth/login-2fa",
        json={
            "challenge_token": challenge,
            "code": recovery[0],
            "use_recovery": True,
        },
    )
    assert r_2fa.status_code == 200

    # Code yang sama tidak bisa dipakai dua kali
    login2 = await client.post(
        "/v1/auth/login",
        json={"email": "kepsek@test.id", "password": "password123"},
    )
    challenge2 = login2.json()["data"]["challenge_token"]
    r_fail = await client.post(
        "/v1/auth/login-2fa",
        json={
            "challenge_token": challenge2,
            "code": recovery[0],
            "use_recovery": True,
        },
    )
    assert r_fail.status_code == 401

"""Smoke tests: app boots dan endpoint dasar OK."""
import pytest


async def test_health_check(client):
    r = await client.get("/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["status"] == "ok"


async def test_root_returns_app_info(client):
    r = await client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert "app" in body
    assert body["status"] == "online"


async def test_login_with_invalid_email_returns_401(client):
    r = await client.post(
        "/v1/auth/login",
        json={"email": "tidak-ada@test.id", "password": "wrong"},
    )
    assert r.status_code == 401


async def test_protected_endpoint_without_token_returns_401(client):
    r = await client.get("/v1/auth/me")
    assert r.status_code == 401

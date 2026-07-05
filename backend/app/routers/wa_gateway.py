"""WA Gateway process management + proxy — start/stop/proxy from web."""
import os
import signal
import subprocess
import sys
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Request

from app.models import User
from app.schemas import Envelope
from app.security import require_roles

router = APIRouter(prefix="/wa-gateway", tags=["WA Gateway"])

# Path to wa-gateway folder (relative to backend/)
WA_GATEWAY_DIR = Path(__file__).parent.parent.parent.parent / "wa-gateway"
WA_GATEWAY_URL = "http://localhost:3001"

# Track the subprocess
_wa_process: subprocess.Popen | None = None


def _is_running() -> bool:
    """Check if the WA gateway process is still running."""
    global _wa_process
    if _wa_process is None:
        return False
    poll = _wa_process.poll()
    if poll is not None:
        _wa_process = None
        return False
    return True


@router.get("/process-status", response_model=Envelope[dict])
async def wa_process_status(
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
):
    """Check if the WA gateway Node.js process is running."""
    running = _is_running()
    return Envelope(data={
        "running": running,
        "pid": _wa_process.pid if running else None,
        "gateway_dir": str(WA_GATEWAY_DIR),
        "exists": WA_GATEWAY_DIR.exists(),
    })


@router.post("/start", response_model=Envelope[dict])
async def start_wa_gateway(
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
):
    """Start the WA gateway Node.js process."""
    global _wa_process

    if _is_running():
        return Envelope(data={"running": True, "pid": _wa_process.pid}, message="Sudah berjalan")

    if not WA_GATEWAY_DIR.exists():
        return Envelope(
            success=False,
            data={"running": False},
            message=f"Folder wa-gateway tidak ditemukan di {WA_GATEWAY_DIR}",
        )

    node_modules = WA_GATEWAY_DIR / "node_modules"
    if not node_modules.exists():
        return Envelope(
            success=False,
            data={"running": False},
            message="node_modules belum ada. Jalankan 'npm install' di folder wa-gateway/ dulu.",
        )

    try:
        node_path = "/usr/bin/node"
        import shutil
        node_path = shutil.which("node") or "/usr/bin/node"

        if sys.platform == "win32":
            _wa_process = subprocess.Popen(
                ["node", "src/index.js"],
                cwd=str(WA_GATEWAY_DIR),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
        else:
            _wa_process = subprocess.Popen(
                [node_path, "src/index.js"],
                cwd=str(WA_GATEWAY_DIR),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        return Envelope(
            data={"running": True, "pid": _wa_process.pid},
            message="WA Gateway berhasil dijalankan",
        )
    except FileNotFoundError:
        return Envelope(
            success=False,
            data={"running": False},
            message="Node.js tidak ditemukan. Pastikan Node.js terinstall.",
        )
    except Exception as e:
        return Envelope(
            success=False,
            data={"running": False},
            message=f"Gagal menjalankan: {str(e)}",
        )


@router.post("/stop", response_model=Envelope[dict])
async def stop_wa_gateway(
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
):
    """Stop the WA gateway Node.js process."""
    global _wa_process

    if not _is_running():
        return Envelope(data={"running": False}, message="Tidak ada proses yang berjalan")

    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(_wa_process.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            os.killpg(os.getpgid(_wa_process.pid), signal.SIGTERM)

        _wa_process = None
        return Envelope(data={"running": False}, message="WA Gateway dihentikan")
    except Exception as e:
        _wa_process = None
        return Envelope(data={"running": False}, message=f"Dihentikan: {e}")


# --- Proxy endpoints to WA Gateway (so frontend doesn't need direct access) ---


@router.get("/status")
async def proxy_status(
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
):
    """Proxy GET /status to WA Gateway."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{WA_GATEWAY_URL}/status")
            return r.json()
    except httpx.ConnectError:
        return {"success": True, "data": None}
    except Exception:
        return {"success": True, "data": None}


@router.post("/connect")
async def proxy_connect(
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
):
    """Proxy POST /connect to WA Gateway."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(f"{WA_GATEWAY_URL}/connect")
            return r.json()
    except httpx.ConnectError:
        return {"success": False, "error": "WA Gateway tidak aktif"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/disconnect")
async def proxy_disconnect(
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
):
    """Proxy POST /disconnect to WA Gateway."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(f"{WA_GATEWAY_URL}/disconnect")
            return r.json()
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/logout")
async def proxy_logout(
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
):
    """Proxy POST /logout to WA Gateway."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(f"{WA_GATEWAY_URL}/logout")
            return r.json()
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/send-test")
async def proxy_send_test(
    request: Request,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
):
    """Proxy POST /send-now to WA Gateway for testing."""
    body = await request.json()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(f"{WA_GATEWAY_URL}/send-now", json=body)
            return r.json()
    except httpx.ConnectError:
        return {"success": False, "error": "WA Gateway tidak aktif"}
    except Exception as e:
        return {"success": False, "error": str(e)}

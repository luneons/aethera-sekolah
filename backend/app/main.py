"""FastAPI application entry."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.routers import (
    admissions,
    ai_insight,
    announcements,
    attendance,
    attendance_mode,
    audit,
    auth,
    billing,
    chat,
    counseling,
    discipline,
    ekskul,
    events,
    face,
    imports as bulk_imports,
    inventory,
    leave,
    letters,
    library,
    lms,
    notifications,
    organization,
    parent_admin,
    parent_portal,
    quiz,
    rapor,
    reports,
    reports_extended,
    roles,
    schedule,
    subject_attendance,
    timetable,
    two_factor,
    uks,
    users,
    wa_gateway,
)
from pathlib import Path


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Preload ArcFace models so first request doesn't timeout
    # Skip kalau onnxruntime/opencv tidak terinstall (Railway free tier)
    try:
        import onnxruntime  # noqa: F401
        import cv2  # noqa: F401
        from app.services.face_service import _get_detector, _get_recognizer
        _get_detector()
        _get_recognizer()
    except ImportError:
        import logging
        logging.getLogger(__name__).warning(
            "onnxruntime/opencv tidak ditemukan — fitur face recognition dinonaktifkan."
        )
    # Start scheduler untuk weekly digest
    from app.services.scheduler import start_scheduler, stop_scheduler
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Aethera — Platform Manajemen Sekolah Modern (Absensi pengenalan wajah, Disiplin, LMS, Komunikasi)",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth guard untuk static files sensitif ───────────────────────────────────
# /snapshots (foto wajah), /proofs (surat izin), /letters-files (surat keterangan)
# harus dilindungi — tidak boleh diakses tanpa token valid.
# /photos (foto profil) dan /lessons (materi pelajaran) boleh semi-public.

_PROTECTED_PREFIXES = ("/snapshots/", "/proofs/", "/letters-files/")


@app.middleware("http")
async def protect_sensitive_static(request: Request, call_next):
    path = request.url.path
    if any(path.startswith(p) for p in _PROTECTED_PREFIXES):
        from app.security import decode_token
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.removeprefix("Bearer ").strip() if auth_header.startswith("Bearer ") else None
        if not token:
            # Coba dari query param ?token=... (untuk img src di browser)
            token = request.query_params.get("token")
        if not token:
            return Response(status_code=401, content="Unauthorized")
        try:
            decode_token(token, "access")
        except Exception:
            return Response(status_code=401, content="Unauthorized")
    return await call_next(request)

# Snapshots served as static files (dev convenience)
app.mount(
    "/snapshots",
    StaticFiles(directory=str(settings.snapshot_path), check_dir=False),
    name="snapshots",
)

# Profile photos
_photos_dir = Path(settings.SNAPSHOT_DIR).parent / "photos"
_photos_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/photos",
    StaticFiles(directory=str(_photos_dir), check_dir=False),
    name="photos",
)

# Lesson materials
_lessons_dir = Path(settings.SNAPSHOT_DIR).parent / "lessons"
_lessons_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/lessons",
    StaticFiles(directory=str(_lessons_dir), check_dir=False),
    name="lessons",
)

# Leave proof files (medical letters, izin scans, dst)
_proofs_dir = Path(settings.SNAPSHOT_DIR).parent / "proofs"
_proofs_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/proofs",
    StaticFiles(directory=str(_proofs_dir), check_dir=False),
    name="proofs",
)

# Letter PDF (auto-generated surat keterangan, dll)
_letters_dir = Path(settings.SNAPSHOT_DIR).parent / "letters"
_letters_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/letters-files",
    StaticFiles(directory=str(_letters_dir), check_dir=False),
    name="letters_files",
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        body = {"success": False, "error": detail}
    else:
        body = {
            "success": False,
            "error": {"code": f"HTTP_{exc.status_code}", "message": str(detail)},
        }
    return JSONResponse(status_code=exc.status_code, content=body)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Validasi input gagal",
                "details": {"errors": exc.errors()},
            },
        },
    )


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": "1.0.0",
        "status": "online",
        "docs": "/docs",
    }


@app.get("/v1/health")
async def health():
    return {"success": True, "data": {"status": "ok"}}


# Mount versioned routers
v1_routers = [auth, users, face, attendance, reports, organization, wa_gateway, discipline]
for r in v1_routers:
    app.include_router(r.router, prefix="/v1")

# Role-specific routers (multiple routers in one module)
app.include_router(roles.exec_router, prefix="/v1")
app.include_router(roles.classroom_router, prefix="/v1")
app.include_router(roles.bk_router, prefix="/v1")
app.include_router(roles.digest_router, prefix="/v1")

# LMS routers
app.include_router(lms.subjects_router, prefix="/v1")
app.include_router(lms.teaching_router, prefix="/v1")
app.include_router(lms.materials_router, prefix="/v1")
app.include_router(lms.assignments_router, prefix="/v1")
app.include_router(lms.student_router, prefix="/v1")
app.include_router(lms.gradebook_router, prefix="/v1")
app.include_router(chat.router, prefix="/v1")
app.include_router(notifications.router, prefix="/v1")
app.include_router(quiz.router, prefix="/v1")
app.include_router(leave.router, prefix="/v1")
app.include_router(parent_portal.router, prefix="/v1")
app.include_router(parent_admin.router, prefix="/v1")
app.include_router(billing.router, prefix="/v1")
app.include_router(bulk_imports.router, prefix="/v1")
app.include_router(letters.router, prefix="/v1")
app.include_router(timetable.router, prefix="/v1")
app.include_router(ekskul.router, prefix="/v1")
app.include_router(counseling.router, prefix="/v1")
app.include_router(library.router, prefix="/v1")
app.include_router(events.router, prefix="/v1")
app.include_router(ai_insight.router, prefix="/v1")
app.include_router(announcements.router, prefix="/v1")
app.include_router(rapor.router, prefix="/v1")
app.include_router(two_factor.router, prefix="/v1")
app.include_router(admissions.router, prefix="/v1")
app.include_router(subject_attendance.router, prefix="/v1")
app.include_router(uks.router, prefix="/v1")
app.include_router(inventory.router, prefix="/v1")
app.include_router(audit.router, prefix="/v1")
app.include_router(reports_extended.router, prefix="/v1")
app.include_router(schedule.router, prefix="/v1")
app.include_router(attendance_mode.router, prefix="/v1")
app.include_router(attendance_mode.qr_router, prefix="/v1")

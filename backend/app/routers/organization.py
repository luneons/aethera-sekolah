"""Organization endpoints — departments, schedules, holidays."""
from datetime import date, time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Department, Holiday, OrganizationFaceSetting, OrganizationGeofenceSetting,
    OrganizationWhatsappSetting, SchoolClass, User, WorkSchedule,
)
from app.schemas import (
    DepartmentCreate, DepartmentOut, Envelope, FaceSensitivitySettings,
    FaceSensitivitySettingsOut, GeofenceSettings, GeofenceSettingsOut,
    SchoolClassCreate, SchoolClassOut,
)
from app.security import get_current_user, require_roles
from app.services.face_settings_service import DEFAULT_FACE_SETTINGS, to_face_settings_dict


router = APIRouter(prefix="/org", tags=["Organization"])


def _geofence_out(
    org_id: int,
    setting: Optional[OrganizationGeofenceSetting],
) -> GeofenceSettingsOut:
    if not setting:
        return GeofenceSettingsOut(org_id=org_id)
    return GeofenceSettingsOut(
        id=setting.id,
        org_id=setting.org_id,
        location_name=setting.location_name,
        enabled=setting.enabled,
        latitude=setting.latitude,
        longitude=setting.longitude,
        radius_meters=setting.radius_meters,
        max_accuracy_meters=setting.max_accuracy_meters,
        updated_at=setting.updated_at,
    )


def _face_settings_out(
    org_id: int,
    setting: Optional[OrganizationFaceSetting],
) -> FaceSensitivitySettingsOut:
    values = to_face_settings_dict(setting)
    return FaceSensitivitySettingsOut(
        id=setting.id if setting else None,
        org_id=org_id,
        updated_at=setting.updated_at if setting else None,
        **values,
    )


@router.get("/geofence", response_model=Envelope[GeofenceSettingsOut])
async def get_geofence_settings(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    setting = (
        await db.execute(
            select(OrganizationGeofenceSetting).where(
                OrganizationGeofenceSetting.org_id == current.org_id
            )
        )
    ).scalar_one_or_none()
    return Envelope(data=_geofence_out(current.org_id, setting))


@router.put("/geofence", response_model=Envelope[GeofenceSettingsOut])
async def update_geofence_settings(
    payload: GeofenceSettings,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.enabled and (payload.latitude is None or payload.longitude is None):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Latitude dan longitude wajib diisi saat geofence aktif",
        )

    setting = (
        await db.execute(
            select(OrganizationGeofenceSetting).where(
                OrganizationGeofenceSetting.org_id == current.org_id
            )
        )
    ).scalar_one_or_none()

    if not setting:
        setting = OrganizationGeofenceSetting(org_id=current.org_id)
        db.add(setting)

    setting.location_name = payload.location_name.strip()
    setting.enabled = payload.enabled
    setting.latitude = payload.latitude
    setting.longitude = payload.longitude
    setting.radius_meters = payload.radius_meters
    setting.max_accuracy_meters = payload.max_accuracy_meters

    await db.commit()
    await db.refresh(setting)
    return Envelope(data=_geofence_out(current.org_id, setting), message="Pengaturan geofence disimpan")


@router.get("/face-settings", response_model=Envelope[FaceSensitivitySettingsOut])
async def get_face_settings(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    setting = (
        await db.execute(
            select(OrganizationFaceSetting).where(
                OrganizationFaceSetting.org_id == current.org_id
            )
        )
    ).scalar_one_or_none()
    return Envelope(data=_face_settings_out(current.org_id, setting))


@router.put("/face-settings", response_model=Envelope[FaceSensitivitySettingsOut])
async def update_face_settings(
    payload: FaceSensitivitySettings,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.min_brightness >= payload.max_brightness:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Brightness minimum harus lebih kecil dari brightness maksimum",
        )

    setting = (
        await db.execute(
            select(OrganizationFaceSetting).where(
                OrganizationFaceSetting.org_id == current.org_id
            )
        )
    ).scalar_one_or_none()

    if not setting:
        setting = OrganizationFaceSetting(org_id=current.org_id)
        db.add(setting)

    data = {**DEFAULT_FACE_SETTINGS, **payload.model_dump()}
    for key, value in data.items():
        setattr(setting, key, value)

    await db.commit()
    await db.refresh(setting)
    return Envelope(data=_face_settings_out(current.org_id, setting), message="Pengaturan wajah disimpan")


@router.get("/departments", response_model=Envelope[list[DepartmentOut]])
async def list_departments(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(Department).where(Department.org_id == current.org_id).order_by(Department.name)
        )
    ).scalars().all()
    return Envelope(data=[DepartmentOut.model_validate(r) for r in rows])


@router.post("/departments", response_model=Envelope[DepartmentOut], status_code=201)
async def create_department(
    payload: DepartmentCreate,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    dept = Department(
        org_id=current.org_id,
        name=payload.name,
        description=payload.description,
        parent_id=payload.parent_id,
    )
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return Envelope(data=DepartmentOut.model_validate(dept), message="Departemen ditambahkan")


@router.put("/departments/{dept_id}", response_model=Envelope[DepartmentOut])
async def update_department(
    dept_id: int,
    payload: DepartmentCreate,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    dept = (
        await db.execute(
            select(Department).where(
                Department.id == dept_id, Department.org_id == current.org_id
            )
        )
    ).scalar_one_or_none()
    if not dept:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Departemen tidak ditemukan")
    dept.name = payload.name
    dept.description = payload.description
    await db.commit()
    await db.refresh(dept)
    return Envelope(data=DepartmentOut.model_validate(dept), message="Departemen diperbarui")


@router.delete("/departments/{dept_id}", response_model=Envelope[None])
async def delete_department(
    dept_id: int,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    dept = (
        await db.execute(
            select(Department).where(
                Department.id == dept_id, Department.org_id == current.org_id
            )
        )
    ).scalar_one_or_none()
    if not dept:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Departemen tidak ditemukan")
    await db.delete(dept)
    await db.commit()
    return Envelope(data=None, message="Departemen dihapus")


# --- School Classes (Mode Sekolah) ------------------------------------------


@router.get("/school-classes", response_model=Envelope[list[SchoolClassOut]])
async def list_school_classes(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Daftar kelas untuk mode sekolah."""
    rows = (
        await db.execute(
            select(SchoolClass)
            .where(SchoolClass.org_id == current.org_id)
            .order_by(SchoolClass.grade, SchoolClass.name)
        )
    ).scalars().all()
    return Envelope(data=[SchoolClassOut.model_validate(r) for r in rows])


@router.post("/school-classes", response_model=Envelope[SchoolClassOut], status_code=201)
async def create_school_class(
    payload: SchoolClassCreate,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Tambah kelas baru (mode sekolah)."""
    kelas = SchoolClass(
        org_id=current.org_id,
        name=payload.name,
        grade=payload.grade,
        major=payload.major,
        homeroom_teacher=payload.homeroom_teacher,
        description=payload.description,
    )
    db.add(kelas)
    await db.commit()
    await db.refresh(kelas)
    return Envelope(data=SchoolClassOut.model_validate(kelas), message="Kelas ditambahkan")


@router.delete("/school-classes/{class_id}", response_model=Envelope[None])
async def delete_school_class(
    class_id: int,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Hapus kelas (mode sekolah)."""
    kelas = (
        await db.execute(
            select(SchoolClass).where(
                SchoolClass.id == class_id,
                SchoolClass.org_id == current.org_id,
            )
        )
    ).scalar_one_or_none()
    if not kelas:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kelas tidak ditemukan")
    await db.delete(kelas)
    await db.commit()
    return Envelope(data=None, message="Kelas dihapus")


@router.put("/school-classes/{class_id}", response_model=Envelope[SchoolClassOut])
async def update_school_class(
    class_id: int,
    payload: SchoolClassCreate,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update kelas (mode sekolah)."""
    kelas = (
        await db.execute(
            select(SchoolClass).where(
                SchoolClass.id == class_id,
                SchoolClass.org_id == current.org_id,
            )
        )
    ).scalar_one_or_none()
    if not kelas:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kelas tidak ditemukan")

    kelas.name = payload.name
    kelas.grade = payload.grade
    kelas.major = payload.major
    kelas.homeroom_teacher = payload.homeroom_teacher
    kelas.description = payload.description

    await db.commit()
    await db.refresh(kelas)
    return Envelope(data=SchoolClassOut.model_validate(kelas), message="Kelas diperbarui")


# --- Schedules --------------------------------------------------------------


class ScheduleIn(BaseModel):
    name: str
    check_in_start: time
    check_in_end: time
    check_out_start: time
    grace_period: int = 0
    work_days: Optional[str] = "Mon,Tue,Wed,Thu,Fri"


class ScheduleOut(ScheduleIn):
    id: int


@router.get("/schedules", response_model=Envelope[list[ScheduleOut]])
async def list_schedules(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(WorkSchedule).where(WorkSchedule.org_id == current.org_id)
        )
    ).scalars().all()
    return Envelope(
        data=[
            ScheduleOut(
                id=r.id, name=r.name,
                check_in_start=r.check_in_start, check_in_end=r.check_in_end,
                check_out_start=r.check_out_start,
                grace_period=r.grace_period or 0, work_days=r.work_days or "",
            )
            for r in rows
        ]
    )


@router.post("/schedules", response_model=Envelope[ScheduleOut], status_code=201)
async def create_schedule(
    payload: ScheduleIn,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    sched = WorkSchedule(org_id=current.org_id, **payload.model_dump())
    db.add(sched)
    await db.commit()
    await db.refresh(sched)
    return Envelope(
        data=ScheduleOut(
            id=sched.id, name=sched.name,
            check_in_start=sched.check_in_start, check_in_end=sched.check_in_end,
            check_out_start=sched.check_out_start,
            grace_period=sched.grace_period or 0, work_days=sched.work_days or "",
        )
    )


# --- Holidays ---------------------------------------------------------------


class HolidayIn(BaseModel):
    name: str
    date: date
    is_national: bool = False


class HolidayOut(HolidayIn):
    id: int


@router.get("/holidays", response_model=Envelope[list[HolidayOut]])
async def list_holidays(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(Holiday).where(
                (Holiday.org_id == current.org_id) | (Holiday.org_id.is_(None))
            ).order_by(Holiday.date)
        )
    ).scalars().all()
    return Envelope(
        data=[HolidayOut(id=r.id, name=r.name, date=r.date, is_national=r.is_national) for r in rows]
    )


@router.post("/holidays", response_model=Envelope[HolidayOut], status_code=201)
async def create_holiday(
    payload: HolidayIn,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    h = Holiday(
        org_id=None if payload.is_national else current.org_id,
        name=payload.name, date=payload.date, is_national=payload.is_national,
    )
    db.add(h)
    await db.commit()
    await db.refresh(h)
    return Envelope(data=HolidayOut(id=h.id, name=h.name, date=h.date, is_national=h.is_national))


@router.delete("/holidays/{holiday_id}", response_model=Envelope[None])
async def delete_holiday(
    holiday_id: int,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    h = (
        await db.execute(
            select(Holiday).where(
                Holiday.id == holiday_id,
                (Holiday.org_id == current.org_id) | (Holiday.org_id.is_(None)),
            )
        )
    ).scalar_one_or_none()
    if not h:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hari libur tidak ditemukan")
    await db.delete(h)
    await db.commit()
    return Envelope(data=None, message="Hari libur dihapus")


# --- WhatsApp Notification Settings ----------------------------------------


class WhatsappSettingsIn(BaseModel):
    enabled: bool = False
    api_url: Optional[str] = None
    api_token: Optional[str] = None
    message_template: Optional[str] = None
    notify_checkin: bool = True
    notify_checkout: bool = False
    notify_absent: bool = True


class WhatsappSettingsOut(BaseModel):
    id: Optional[int] = None
    org_id: int
    enabled: bool = False
    api_url: Optional[str] = None
    api_token: Optional[str] = None
    message_template: str = ""
    notify_checkin: bool = True
    notify_checkout: bool = False
    notify_absent: bool = True
    updated_at: Optional[str] = None


@router.get("/whatsapp-settings", response_model=Envelope[WhatsappSettingsOut])
async def get_whatsapp_settings(
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    setting = (
        await db.execute(
            select(OrganizationWhatsappSetting).where(
                OrganizationWhatsappSetting.org_id == current.org_id
            )
        )
    ).scalar_one_or_none()

    if not setting:
        return Envelope(data=WhatsappSettingsOut(org_id=current.org_id))

    return Envelope(data=WhatsappSettingsOut(
        id=setting.id,
        org_id=setting.org_id,
        enabled=setting.enabled,
        api_url=setting.api_url,
        api_token=setting.api_token,
        message_template=setting.message_template or "",
        notify_checkin=setting.notify_checkin,
        notify_checkout=setting.notify_checkout,
        notify_absent=setting.notify_absent,
        updated_at=setting.updated_at.isoformat() if setting.updated_at else None,
    ))


@router.put("/whatsapp-settings", response_model=Envelope[WhatsappSettingsOut])
async def update_whatsapp_settings(
    payload: WhatsappSettingsIn,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.enabled and not payload.api_url:
        # Only require API URL if it's not the default local gateway
        pass  # Local gateway uses default URL, no validation needed

    setting = (
        await db.execute(
            select(OrganizationWhatsappSetting).where(
                OrganizationWhatsappSetting.org_id == current.org_id
            )
        )
    ).scalar_one_or_none()

    if not setting:
        setting = OrganizationWhatsappSetting(org_id=current.org_id)
        db.add(setting)

    setting.enabled = payload.enabled
    setting.api_url = payload.api_url
    setting.api_token = payload.api_token
    if payload.message_template:
        setting.message_template = payload.message_template
    setting.notify_checkin = payload.notify_checkin
    setting.notify_checkout = payload.notify_checkout
    setting.notify_absent = payload.notify_absent

    await db.commit()
    await db.refresh(setting)

    return Envelope(
        data=WhatsappSettingsOut(
            id=setting.id,
            org_id=setting.org_id,
            enabled=setting.enabled,
            api_url=setting.api_url,
            api_token=setting.api_token,
            message_template=setting.message_template or "",
            notify_checkin=setting.notify_checkin,
            notify_checkout=setting.notify_checkout,
            notify_absent=setting.notify_absent,
            updated_at=setting.updated_at.isoformat() if setting.updated_at else None,
        ),
        message="Pengaturan WhatsApp disimpan",
    )


# Organization Mode Management
class OrganizationModeUpdate(BaseModel):
    organization_mode: str  # "school" or "office"
    apply_defaults: bool = True  # Apply default settings for the mode


@router.get("/mode", response_model=Envelope[dict])
async def get_organization_mode(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get current organization mode and terminology."""
    from app.models import Organization
    from app.terminology import get_all_terms
    
    org = await db.get(Organization, current.org_id)
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    
    mode = org.organization_mode or "school"
    terms = get_all_terms(mode)
    
    return Envelope(
        data={
            "organization_mode": mode,
            "terminology": terms,
        },
        message=f"Organization mode: {mode}",
    )


@router.put("/mode", response_model=Envelope[dict])
async def update_organization_mode(
    payload: OrganizationModeUpdate,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Mode switching dinonaktifkan — aplikasi ini fokus mode sekolah.

    Endpoint dipertahankan untuk backward-compat agar UI lama tidak
    crash, tapi mengembalikan error 410 GONE untuk request yang nyata.
    """
    raise HTTPException(
        status.HTTP_410_GONE,
        "Mode switching dinonaktifkan. Aplikasi ini khusus mode sekolah.",
    )

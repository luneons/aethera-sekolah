"""
Terminology mapping based on organization mode (school vs office).

This module provides context-aware terminology to make the UI/UX
more relevant for different types of organizations.
"""

from typing import Dict, Any

# Terminology mapping
TERMINOLOGY = {
    "school": {
        # People
        "employee": "siswa",
        "employees": "siswa",
        "Employee": "Siswa",
        "Employees": "Siswa",
        "employee_id": "NIS",
        "Employee ID": "NIS (Nomor Induk Siswa)",
        "staff": "guru/staff",
        "Staff": "Guru/Staff",
        
        # Departments
        "department": "kelas",
        "departments": "kelas",
        "Department": "Kelas",
        "Departments": "Kelas",
        
        # Attendance
        "check-in": "masuk sekolah",
        "check-out": "pulang sekolah",
        "Check-in": "Masuk Sekolah",
        "Check-out": "Pulang Sekolah",
        "attendance": "kehadiran",
        "Attendance": "Kehadiran",
        "present": "hadir",
        "Present": "Hadir",
        "absent": "tidak hadir/bolos",
        "Absent": "Tidak Hadir",
        "late": "terlambat",
        "Late": "Terlambat",
        
        # Location
        "office": "sekolah",
        "Office": "Sekolah",
        "workplace": "sekolah",
        "Workplace": "Sekolah",
        
        # Time
        "work_schedule": "jadwal sekolah",
        "Work Schedule": "Jadwal Sekolah",
        "working_hours": "jam sekolah",
        "Working Hours": "Jam Sekolah",
        "work_duration": "durasi di sekolah",
        "Work Duration": "Durasi di Sekolah",
        
        # Notifications
        "parent_phone": "nomor HP wali/orang tua",
        "Parent Phone": "Nomor HP Wali/Orang Tua",
        "guardian": "wali/orang tua",
        "Guardian": "Wali/Orang Tua",
        
        # Reports
        "payroll": "laporan kehadiran",
        "Payroll": "Laporan Kehadiran",
        "hr": "admin sekolah",
        "HR": "Admin Sekolah",
        
        # Messages
        "employee_enrolled": "Siswa berhasil didaftarkan",
        "employee_updated": "Data siswa berhasil diperbarui",
        "employee_deleted": "Siswa berhasil dihapus",
        "checkin_success": "Siswa berhasil masuk sekolah",
        "checkout_success": "Siswa berhasil pulang sekolah",
        "parent_notified": "Wali/orang tua telah diberitahu via WhatsApp",
        
        # WhatsApp Template Default
        "wa_template": (
            "{salam}, Bapak/Ibu wali dari *{nama}*.\n\n"
            "Kami informasikan bahwa anak Anda telah *{aksi}* pada:\n"
            "📅 {tanggal}\n"
            "🕐 {waktu}\n"
            "📍 {lokasi}\n\n"
            "Status: *{status}*\n\n"
            "{penutup}\n"
            "— {organisasi}"
        ),
    },
    
    "office": {
        # People
        "employee": "karyawan",
        "employees": "karyawan",
        "Employee": "Karyawan",
        "Employees": "Karyawan",
        "employee_id": "NIK",
        "Employee ID": "NIK (Nomor Induk Karyawan)",
        "staff": "staff",
        "Staff": "Staff",
        
        # Departments
        "department": "departemen",
        "departments": "departemen",
        "Department": "Departemen",
        "Departments": "Departemen",
        
        # Attendance
        "check-in": "check-in",
        "check-out": "check-out",
        "Check-in": "Check-in",
        "Check-out": "Check-out",
        "attendance": "kehadiran",
        "Attendance": "Kehadiran",
        "present": "hadir",
        "Present": "Hadir",
        "absent": "tidak hadir",
        "Absent": "Tidak Hadir",
        "late": "terlambat",
        "Late": "Terlambat",
        
        # Location
        "office": "kantor",
        "Office": "Kantor",
        "workplace": "tempat kerja",
        "Workplace": "Tempat Kerja",
        
        # Time
        "work_schedule": "jadwal kerja",
        "Work Schedule": "Jadwal Kerja",
        "working_hours": "jam kerja",
        "Working Hours": "Jam Kerja",
        "work_duration": "durasi kerja",
        "Work Duration": "Durasi Kerja",
        
        # Notifications
        "parent_phone": "nomor HP keluarga",
        "Parent Phone": "Nomor HP Keluarga",
        "guardian": "keluarga",
        "Guardian": "Keluarga",
        
        # Reports
        "payroll": "payroll",
        "Payroll": "Payroll",
        "hr": "HR",
        "HR": "HR",
        
        # Messages
        "employee_enrolled": "Karyawan berhasil didaftarkan",
        "employee_updated": "Data karyawan berhasil diperbarui",
        "employee_deleted": "Karyawan berhasil dihapus",
        "checkin_success": "Check-in berhasil",
        "checkout_success": "Check-out berhasil",
        "parent_notified": "Keluarga telah diberitahu via WhatsApp",
        
        # WhatsApp Template Default
        "wa_template": (
            "{salam},\n\n"
            "Kami informasikan bahwa *{nama}* telah *{aksi}* pada:\n"
            "📅 {tanggal}\n"
            "🕐 {waktu}\n"
            "📍 {lokasi}\n\n"
            "Status: *{status}*\n\n"
            "{penutup}\n"
            "— {organisasi}"
        ),
    },
}


def get_term(mode: str, key: str, default: str = None) -> str:
    """
    Get terminology based on organization mode.
    
    Args:
        mode: "school" or "office"
        key: terminology key (e.g., "employee", "Employee", "check-in")
        default: default value if key not found
    
    Returns:
        Translated term or default value
    
    Example:
        >>> get_term("school", "employee")
        "siswa"
        >>> get_term("office", "employee")
        "karyawan"
        >>> get_term("school", "Employee")
        "Siswa"
    """
    if mode not in TERMINOLOGY:
        mode = "office"  # fallback to office mode
    
    return TERMINOLOGY[mode].get(key, default or key)


def get_all_terms(mode: str) -> Dict[str, str]:
    """
    Get all terminology for a specific mode.
    
    Args:
        mode: "school" or "office"
    
    Returns:
        Dictionary of all terms for the mode
    """
    if mode not in TERMINOLOGY:
        mode = "office"
    
    return TERMINOLOGY[mode].copy()


def translate_dict(mode: str, data: Dict[str, Any], keys_to_translate: list[str]) -> Dict[str, Any]:
    """
    Translate specific keys in a dictionary based on mode.
    
    Args:
        mode: "school" or "office"
        data: dictionary to translate
        keys_to_translate: list of keys to translate
    
    Returns:
        Translated dictionary
    
    Example:
        >>> data = {"message": "Employee enrolled successfully"}
        >>> translate_dict("school", data, ["message"])
        {"message": "Siswa berhasil didaftarkan"}
    """
    result = data.copy()
    for key in keys_to_translate:
        if key in result and isinstance(result[key], str):
            # Try to find matching term
            for term_key, term_value in TERMINOLOGY[mode].items():
                if term_key in result[key]:
                    result[key] = result[key].replace(term_key, term_value)
    
    return result


# Default settings based on mode
DEFAULT_SETTINGS = {
    "school": {
        "geofence": {
            "location_name": "Sekolah",
            "enabled": True,
            "radius_meters": 200,  # Sekolah biasanya area lebih besar
            "max_accuracy_meters": 150,
        },
        "face": {
            "match_threshold": 0.45,
            "min_quality": 0.4,
            "min_enrollment_frames": 3,
            "liveness_enabled": True,
        },
        "whatsapp": {
            "enabled": True,  # Sekolah biasanya butuh notif ke orang tua
            "notify_checkin": True,
            "notify_checkout": True,
            "notify_absent": True,
        },
        "work_schedule": {
            "name": "Jadwal Sekolah Reguler",
            "check_in_start": "06:30:00",
            "check_in_end": "07:30:00",
            "check_out_start": "14:00:00",
            "grace_period": 15,  # 15 menit toleransi keterlambatan
            "work_days": "1,2,3,4,5",  # Senin-Jumat
        },
    },
    
    "office": {
        "geofence": {
            "location_name": "Kantor",
            "enabled": False,  # Office mungkin ada WFH
            "radius_meters": 150,
            "max_accuracy_meters": 150,
        },
        "face": {
            "match_threshold": 0.45,
            "min_quality": 0.4,
            "min_enrollment_frames": 3,
            "liveness_enabled": True,
        },
        "whatsapp": {
            "enabled": False,  # Office biasanya tidak perlu notif ke keluarga
            "notify_checkin": False,
            "notify_checkout": False,
            "notify_absent": False,
        },
        "work_schedule": {
            "name": "Jadwal Kerja Reguler",
            "check_in_start": "07:00:00",
            "check_in_end": "09:00:00",
            "check_out_start": "16:00:00",
            "grace_period": 10,  # 10 menit toleransi keterlambatan
            "work_days": "1,2,3,4,5",  # Senin-Jumat
        },
    },
}


def get_default_settings(mode: str) -> Dict[str, Any]:
    """
    Get default settings based on organization mode.
    
    Args:
        mode: "school" or "office"
    
    Returns:
        Dictionary of default settings
    """
    if mode not in DEFAULT_SETTINGS:
        mode = "office"
    
    return DEFAULT_SETTINGS[mode].copy()

/**
 * Terminology system - mirror of backend/app/terminology.py
 * Provides context-aware terms based on organization mode (school/office)
 */

export type OrgMode = 'school' | 'office';

export interface Terminology {
  // People
  employee: string;
  employees: string;
  Employee: string;
  Employees: string;
  employee_id: string;
  employee_id_label: string;
  employee_id_placeholder: string;
  employee_id_hint: string;
  
  // Departments
  department: string;
  departments: string;
  Department: string;
  Departments: string;
  department_label: string;
  department_placeholder: string;
  
  // Attendance
  checkin: string;
  checkout: string;
  Checkin: string;
  Checkout: string;
  attendance: string;
  Attendance: string;
  
  // Location
  office: string;
  Office: string;
  workplace: string;
  Workplace: string;
  
  // Time
  work_schedule: string;
  Work_schedule: string;
  working_hours: string;
  Working_hours: string;
  work_duration: string;
  Work_duration: string;
  
  // Notifications
  parent_phone: string;
  Parent_phone: string;
  parent_phone_label: string;
  parent_phone_hint: string;
  parent_phone_required: boolean;
  guardian: string;
  Guardian: string;
  
  // Reports
  payroll: string;
  Payroll: string;
  hr: string;
  HR: string;
  
  // Roles
  role_employee: string;
  role_admin: string;
  role_hr: string;
  role_super_admin: string;
  
  // Pages
  page_employees_title: string;
  page_employees_subtitle: string;
  page_attendance_title: string;
  page_attendance_subtitle: string;
  page_organization_subtitle: string;
  
  // Navigation
  nav_employees: string;
  nav_attendance: string;
  nav_organization: string;
  
  // Date
  join_date_label: string;
  
  // Action verbs (past tense)
  action_checkin: string;
  action_checkout: string;
  
  // Mode metadata
  mode_label: string;
  mode_emoji: string;
  
  // Other
  enroll: string;
  Enroll: string;
}

export const TERMINOLOGY: Record<OrgMode, Terminology> = {
  school: {
    // People
    employee: 'siswa',
    employees: 'siswa',
    Employee: 'Siswa',
    Employees: 'Siswa',
    employee_id: 'NIS',
    employee_id_label: 'NIS (Nomor Induk Siswa)',
    employee_id_placeholder: 'Contoh: 2024001',
    employee_id_hint: 'Nomor Induk Siswa',
    
    // Departments
    department: 'kelas',
    departments: 'kelas',
    Department: 'Kelas',
    Departments: 'Kelas',
    department_label: 'Kelas',
    department_placeholder: 'Contoh: 10 IPA 1',
    
    // Attendance
    checkin: 'masuk sekolah',
    checkout: 'pulang sekolah',
    Checkin: 'Masuk Sekolah',
    Checkout: 'Pulang Sekolah',
    attendance: 'kehadiran',
    Attendance: 'Kehadiran',
    
    // Location
    office: 'sekolah',
    Office: 'Sekolah',
    workplace: 'sekolah',
    Workplace: 'Sekolah',
    
    // Time
    work_schedule: 'jadwal sekolah',
    Work_schedule: 'Jadwal Sekolah',
    working_hours: 'jam sekolah',
    Working_hours: 'Jam Sekolah',
    work_duration: 'durasi di sekolah',
    Work_duration: 'Durasi di Sekolah',
    
    // Notifications
    parent_phone: 'HP orang tua/wali',
    Parent_phone: 'HP Orang Tua/Wali',
    parent_phone_label: 'HP Orang Tua/Wali',
    parent_phone_hint: 'Wajib diisi untuk notifikasi kehadiran ke orang tua',
    parent_phone_required: true,
    guardian: 'orang tua/wali',
    Guardian: 'Orang Tua/Wali',
    
    // Reports
    payroll: 'laporan kehadiran',
    Payroll: 'Laporan Kehadiran',
    hr: 'admin sekolah',
    HR: 'Admin Sekolah',
    
    // Roles
    role_employee: 'Siswa',
    role_admin: 'Guru/Wali Kelas',
    role_hr: 'Admin Sekolah',
    role_super_admin: 'Kepala Sekolah',
    
    // Pages
    page_employees_title: 'Siswa',
    page_employees_subtitle: 'Kelola data siswa, NIS, kelas, dan enrollment wajah',
    page_attendance_title: 'Kehadiran Siswa',
    page_attendance_subtitle: 'Pantau kehadiran siswa dan riwayat masuk/pulang sekolah',
    page_organization_subtitle: 'Kelola kelas, kalender libur, dan lokasi sekolah',
    
    // Navigation
    nav_employees: 'Siswa',
    nav_attendance: 'Kehadiran',
    nav_organization: 'Sekolah',
    
    // Date
    join_date_label: 'Tanggal Masuk Sekolah',
    
    // Action verbs
    action_checkin: 'masuk sekolah',
    action_checkout: 'pulang sekolah',
    
    // Mode metadata
    mode_label: 'Mode Sekolah',
    mode_emoji: '🎓',
    
    // Other
    enroll: 'daftarkan',
    Enroll: 'Daftarkan',
  },
  
  office: {
    // People
    employee: 'karyawan',
    employees: 'karyawan',
    Employee: 'Karyawan',
    Employees: 'Karyawan',
    employee_id: 'NIK',
    employee_id_label: 'NIK (Nomor Induk Karyawan)',
    employee_id_placeholder: 'Contoh: EMP001',
    employee_id_hint: 'Nomor Induk Karyawan',
    
    // Departments
    department: 'departemen',
    departments: 'departemen',
    Department: 'Departemen',
    Departments: 'Departemen',
    department_label: 'Departemen',
    department_placeholder: 'Contoh: IT, Finance, HR',
    
    // Attendance
    checkin: 'check-in',
    checkout: 'check-out',
    Checkin: 'Check-in',
    Checkout: 'Check-out',
    attendance: 'kehadiran',
    Attendance: 'Kehadiran',
    
    // Location
    office: 'kantor',
    Office: 'Kantor',
    workplace: 'tempat kerja',
    Workplace: 'Tempat Kerja',
    
    // Time
    work_schedule: 'jadwal kerja',
    Work_schedule: 'Jadwal Kerja',
    working_hours: 'jam kerja',
    Working_hours: 'Jam Kerja',
    work_duration: 'durasi kerja',
    Work_duration: 'Durasi Kerja',
    
    // Notifications
    parent_phone: 'kontak keluarga',
    Parent_phone: 'Kontak Keluarga',
    parent_phone_label: 'Kontak Keluarga (Opsional)',
    parent_phone_hint: 'Nomor kontak keluarga untuk keadaan darurat',
    parent_phone_required: false,
    guardian: 'keluarga',
    Guardian: 'Keluarga',
    
    // Reports
    payroll: 'payroll',
    Payroll: 'Payroll',
    hr: 'HR',
    HR: 'HR',
    
    // Roles
    role_employee: 'Karyawan',
    role_admin: 'Admin',
    role_hr: 'HR',
    role_super_admin: 'Super Admin',
    
    // Pages
    page_employees_title: 'Karyawan',
    page_employees_subtitle: 'Kelola data karyawan, NIK, departemen, dan enrollment wajah',
    page_attendance_title: 'Kehadiran',
    page_attendance_subtitle: 'Pantau kehadiran karyawan dan riwayat check-in/out',
    page_organization_subtitle: 'Kelola departemen, kalender libur, dan lokasi kantor',
    
    // Navigation
    nav_employees: 'Karyawan',
    nav_attendance: 'Kehadiran',
    nav_organization: 'Organisasi',
    
    // Date
    join_date_label: 'Tanggal Bergabung',
    
    // Action verbs
    action_checkin: 'check-in',
    action_checkout: 'check-out',
    
    // Mode metadata
    mode_label: 'Mode Kantor',
    mode_emoji: '🏢',
    
    // Other
    enroll: 'daftarkan',
    Enroll: 'Daftarkan',
  },
};

/**
 * Get terminology for a specific mode.
 * Falls back to office mode if mode is invalid.
 */
export function getTerminology(mode: OrgMode | string | undefined): Terminology {
  if (mode === 'school') return TERMINOLOGY.school;
  return TERMINOLOGY.office;
}

/**
 * Translate a role string into mode-aware label.
 */
export function getRoleLabel(role: string, mode: OrgMode | string | undefined): string {
  const t = getTerminology(mode);
  switch (role) {
    case 'employee':
      return t.role_employee;
    case 'admin':
      return t.role_admin;
    case 'hr':
      return t.role_hr;
    case 'super_admin':
      return t.role_super_admin;
    default:
      return role;
  }
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Filter,
  GraduationCap,
  KeyRound,
  Pencil,
  Plus,
  ScanFace,
  School,
  Search,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserX,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import api, { getErrorMessage, type Envelope } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FaceEnrollModal } from '@/components/employees/FaceEnrollModal';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOrgMode } from '@/stores/useOrgMode';
import { getRoleLabel } from '@/lib/terminology';
import { cn } from '@/lib/utils';

interface Department {
  id: number;
  name: string;
}

interface SchoolClass {
  id: number;
  name: string;
  grade: string | null;
  major: string | null;
  homeroom_teacher: string | null;
}

interface Employee {
  id: number;
  employee_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  parent_phone: string | null;
  parent_name: string | null;
  photo_url: string | null;
  role: string;
  status: string;
  department: Department | null;
  school_class: SchoolClass | null;
  has_face_enrolled: boolean;
}

interface NewUserForm {
  employee_id: string;
  full_name: string;
  email: string;
  password: string;
  phone: string;
  parent_phone: string;
  parent_name: string;
  department_id: string;
  school_class_id: string;
  role: string;
}

const emptyForm: NewUserForm = {
  employee_id: '',
  full_name: '',
  email: '',
  password: '',
  phone: '',
  parent_phone: '',
  parent_name: '',
  department_id: '',
  school_class_id: '',
  role: 'employee',
};

type RoleFilter = 'all' | 'employee' | 'admin' | 'hr' | 'super_admin';

interface FilterTab {
  key: RoleFilter;
  label: string;
  icon: LucideIcon;
}

/**
 * Filter tab options per role yang login.
 *
 * - super_admin : lihat & filter semua kategori
 * - admin       : default siswa (kelasnya, auto-scoped backend), bisa lihat guru/BK juga
 * - hr          : default siswa, fokus utama BK
 */
function buildFilterTabs(role: string | undefined): FilterTab[] {
  const all: FilterTab = { key: 'all', label: 'Semua', icon: Users };
  const siswa: FilterTab = { key: 'employee', label: 'Siswa', icon: GraduationCap };
  const wali: FilterTab = { key: 'admin', label: 'Wali Kelas', icon: School };
  const bk: FilterTab = { key: 'hr', label: 'Guru BK', icon: Stethoscope };
  const kepsek: FilterTab = { key: 'super_admin', label: 'Kepsek', icon: ShieldCheck };

  if (role === 'super_admin') return [all, siswa, wali, bk, kepsek];
  if (role === 'hr') return [siswa, wali, bk];
  if (role === 'admin') return [siswa, wali, bk];
  return [all];
}

function defaultFilterFor(role: string | undefined): RoleFilter {
  if (role === 'super_admin') return 'all';
  return 'employee';
}

export default function EmployeesPage() {
  const qc = useQueryClient();
  const { mode, t, isSchool } = useOrgMode();
  const currentUser = useAuthStore((s) => s.user);
  const myRole = currentUser?.role;
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryRole = searchParams.get('role') as RoleFilter | null;

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState<NewUserForm>(emptyForm);
  const [enrollTarget, setEnrollTarget] = useState<Employee | null>(null);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    parent_phone: '',
    parent_name: '',
    department_id: '',
    school_class_id: '',
    role: '',
    status: '',
  });
  const [resetPwTarget, setResetPwTarget] = useState<Employee | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');

  const filterTabs = useMemo(() => buildFilterTabs(myRole), [myRole]);

  // Set filter dari query string ?role=... atau default sesuai role yang login
  useEffect(() => {
    if (queryRole && ['all', 'employee', 'admin', 'hr', 'super_admin'].includes(queryRole)) {
      // Pastikan role yang diminta query memang valid untuk user saat ini
      const allowed = filterTabs.some((tab) => tab.key === queryRole);
      setRoleFilter(allowed ? queryRole : defaultFilterFor(myRole));
    } else {
      setRoleFilter(defaultFilterFor(myRole));
    }
  }, [myRole, queryRole, filterTabs]);

  // Wali kelas: kalau filter siswa = scope ke kelasnya (auto via backend).
  // Kalau filter selain siswa = harus minta show_all=true biar guru lain ke-fetch.
  const showAll = myRole === 'admin' && roleFilter !== 'employee';

  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees', search, showAll],
    queryFn: async () => {
      const r = await api.get<Envelope<Employee[]>>('/users', {
        params: {
          q: search || undefined,
          per_page: 100,
          show_all: showAll || undefined,
        },
      });
      return r.data.data ?? [];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const r = await api.get<Envelope<Department[]>>('/org/departments');
      return r.data.data ?? [];
    },
  });

  const { data: schoolClasses } = useQuery({
    queryKey: ['school-classes'],
    queryFn: async () => {
      const r = await api.get<Envelope<SchoolClass[]>>('/org/school-classes');
      return r.data.data ?? [];
    },
    enabled: isSchool,
  });

  // Filter client-side berdasarkan role tab
  const filtered = useMemo(() => {
    if (!employees) return [];
    if (roleFilter === 'all') return employees;
    return employees.filter((e) => e.role === roleFilter);
  }, [employees, roleFilter]);

  // Counter per role tab
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, employee: 0, admin: 0, hr: 0, super_admin: 0 };
    employees?.forEach((e) => {
      c.all += 1;
      c[e.role] = (c[e.role] ?? 0) + 1;
    });
    return c;
  }, [employees]);

  const createMut = useMutation({
    mutationFn: async (payload: NewUserForm) => {
      const body = isSchool
        ? {
            employee_id: payload.employee_id,
            full_name: payload.full_name,
            email: payload.email,
            password: payload.password,
            phone: payload.phone || null,
            parent_phone: payload.parent_phone || null,
            parent_name: payload.parent_name || null,
            school_class_id: payload.school_class_id ? Number(payload.school_class_id) : null,
            department_id: null,
            role: payload.role,
          }
        : {
            employee_id: payload.employee_id,
            full_name: payload.full_name,
            email: payload.email,
            password: payload.password,
            phone: payload.phone || null,
            parent_phone: payload.parent_phone || null,
            parent_name: null,
            department_id: payload.department_id ? Number(payload.department_id) : null,
            school_class_id: null,
            role: payload.role,
          };
      await api.post('/users', body);
    },
    onSuccess: () => {
      toast.success(`${t.Employee} berhasil ditambahkan`);
      qc.invalidateQueries({ queryKey: ['employees'] });
      setOpenCreate(false);
      setForm(emptyForm);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteFaceMut = useMutation({
    mutationFn: async (userId: number) => {
      await api.delete(`/face/enroll/${userId}`);
    },
    onSuccess: () => {
      toast.success('Data wajah dihapus');
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const editMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, any> }) => {
      await api.patch(`/users/${id}`, data);
    },
    onSuccess: () => {
      toast.success(`Data ${t.employee} diperbarui`);
      qc.invalidateQueries({ queryKey: ['employees'] });
      setEditTarget(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deactivateMut = useMutation({
    mutationFn: async (userId: number) => {
      await api.delete(`/users/${userId}`);
    },
    onSuccess: () => {
      toast.success(`${t.Employee} dinonaktifkan`);
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const resetPwMut = useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      await api.post(`/users/${id}/reset-password`, { new_password: password });
    },
    onSuccess: () => {
      toast.success('Password berhasil direset');
      setResetPwTarget(null);
      setResetPwValue('');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const openEdit = (emp: Employee) => {
    setEditTarget(emp);
    setEditForm({
      full_name: emp.full_name,
      email: emp.email || '',
      phone: emp.phone || '',
      parent_phone: emp.parent_phone || '',
      parent_name: emp.parent_name || '',
      department_id: emp.department?.id ? String(emp.department.id) : '',
      school_class_id: emp.school_class?.id ? String(emp.school_class.id) : '',
      role: emp.role,
      status: emp.status,
    });
  };

  // Heading & subtitle dinamis sesuai role + filter
  const pageHeading = (() => {
    if (roleFilter === 'all') return 'Pengguna Sekolah';
    if (roleFilter === 'employee') return 'Daftar Siswa';
    if (roleFilter === 'admin') return 'Daftar Wali Kelas';
    if (roleFilter === 'hr') return 'Daftar Guru BK';
    if (roleFilter === 'super_admin') return 'Kepala Sekolah';
    return t.page_employees_title;
  })();

  const canCreate = myRole === 'super_admin' || (myRole === 'admin' && roleFilter === 'employee') || myRole === 'hr';

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-display-md font-bold">{pageHeading}</h1>
          <p className="font-body text-text-muted mt-1 text-sm sm:text-base">
            {t.page_employees_subtitle}
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={() => {
              // Default role saat tambah: ikuti tab aktif (kecuali "all" → siswa)
              setForm({
                ...emptyForm,
                role: roleFilter === 'all' ? 'employee' : roleFilter,
              });
              setOpenCreate(true);
            }}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Tambah {roleFilter === 'admin' ? 'Wali Kelas' : roleFilter === 'hr' ? 'Guru BK' : t.Employee}
          </Button>
        )}
      </div>

      {/* Filter tabs per role */}
      {filterTabs.length > 1 && (
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-4 h-4 text-text-muted shrink-0" />
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = roleFilter === tab.key;
            const count = counts[tab.key] ?? 0;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setRoleFilter(tab.key);
                  // Sync ke URL supaya bisa di-bookmark dan match dropdown sidebar
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('role', tab.key);
                  router.replace(`/employees?${params.toString()}`, { scroll: false });
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-display font-semibold transition-all',
                  isActive
                    ? 'role-accent-bg-soft role-accent-text role-accent-border shadow-glow-sm'
                    : 'border-surface-border text-text-muted hover:text-text-secondary hover:bg-surface-raised'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                <span
                  className={cn(
                    'font-mono text-2xs px-1.5 py-0.5 rounded-full',
                    isActive ? 'bg-surface-base/60' : 'bg-surface-base/40'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Card padding="md">
        <Input
          placeholder={`Cari nama atau ${t.employee_id}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
        />
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-muted border-b border-surface-border">
              <tr>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">
                  {roleFilter === 'employee' ? t.Employee : 'Pengguna'}
                </th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">
                  {roleFilter === 'admin' ? 'Wali Kelas' : t.Department}
                </th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">Role</th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">Status</th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">Wajah</th>
                <th className="text-right px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-text-muted">
                    Memuat...
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-text-muted">
                    Tidak ada {filterTabs.find((t) => t.key === roleFilter)?.label.toLowerCase() ?? 'data'}
                  </td>
                </tr>
              )}
              {filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={emp.full_name} src={emp.photo_url} size="sm" />
                      <div>
                        <p className="font-body font-medium text-sm">{emp.full_name}</p>
                        <p className="font-mono text-xs text-text-muted">{emp.employee_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {emp.role === 'employee'
                      ? emp.school_class?.name ?? '-'
                      : emp.role === 'admin'
                        ? `Wali kelas ${emp.school_class?.name ?? '—'}`
                        : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-2xs uppercase tracking-widest text-text-muted">
                      {getRoleLabel(emp.role, mode)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={emp.status === 'active' ? 'present' : 'absent'} />
                  </td>
                  <td className="px-4 py-3">
                    {emp.has_face_enrolled ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <ShieldCheck className="w-4 h-4" />
                        Terdaftar
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">Belum daftar</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(emp)}
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<ScanFace className="w-4 h-4" />}
                        onClick={() => setEnrollTarget(emp)}
                        title="Daftar Wajah"
                      >
                        Wajah
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setResetPwTarget(emp); setResetPwValue(''); }}
                        title="Reset Password"
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      {emp.has_face_enrolled && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Hapus data wajah ${emp.full_name}?`)) {
                              deleteFaceMut.mutate(emp.id);
                            }
                          }}
                          title="Hapus Data Wajah"
                        >
                          <Trash2 className="w-4 h-4 text-danger" />
                        </Button>
                      )}
                      {emp.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Nonaktifkan ${emp.full_name}? Mereka tidak bisa login lagi.`)) {
                              deactivateMut.mutate(emp.id);
                            }
                          }}
                          title="Nonaktifkan"
                        >
                          <UserX className="w-4 h-4 text-danger" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title={`Tambah ${t.Employee} Baru`}
        description={`Lengkapi data berikut untuk membuat akun ${t.employee}`}
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Validation for school mode: parent_phone required (untuk siswa)
            if (isSchool && form.role === 'employee' && !form.parent_phone.trim()) {
              toast.error('HP Orang Tua/Wali wajib diisi untuk siswa');
              return;
            }
            createMut.mutate(form);
          }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <Input
            label={t.employee_id_label}
            value={form.employee_id}
            onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            placeholder={t.employee_id_placeholder}
            required
          />
          <Input
            label={`Nama Lengkap`}
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={6}
          />
          <Input
            label={isSchool ? 'HP (Opsional)' : 'Telepon'}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          {form.role === 'employee' && (
            <Input
              label={t.parent_phone_label}
              value={form.parent_phone}
              onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
              placeholder="628xxxxxxxxxx"
              hint={t.parent_phone_hint}
              required={t.parent_phone_required}
            />
          )}
          {isSchool && form.role === 'employee' && (
            <Input
              label="Nama Orang Tua/Wali"
              value={form.parent_name}
              onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
              placeholder="Contoh: Bapak Ahmad Santoso"
            />
          )}
          {form.role === 'employee' && (
            <div className="space-y-1.5">
              <label className="block font-body text-sm font-medium text-text-secondary">{t.department_label}</label>
              <select
                className="w-full bg-surface-raised border border-surface-border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
                value={isSchool ? form.school_class_id : form.department_id}
                onChange={(e) => isSchool
                  ? setForm({ ...form, school_class_id: e.target.value })
                  : setForm({ ...form, department_id: e.target.value })
                }
              >
                <option value="">— pilih —</option>
                {isSchool
                  ? schoolClasses?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.homeroom_teacher ? ` (${c.homeroom_teacher})` : ''}
                      </option>
                    ))
                  : departments?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))
                }
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block font-body text-sm font-medium text-text-secondary">Role</label>
            <select
              className="w-full bg-surface-raised border border-surface-border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              disabled={myRole !== 'super_admin'}
            >
              <option value="employee">Siswa</option>
              <option value="admin">Wali Kelas / Guru</option>
              <option value="hr">Guru BK</option>
              {myRole === 'super_admin' && <option value="super_admin">Kepala Sekolah</option>}
            </select>
            {myRole !== 'super_admin' && (
              <p className="font-body text-2xs text-text-muted">
                Hanya kepala sekolah yang bisa mengubah role.
              </p>
            )}
          </div>
          <div className="sm:col-span-2 flex justify-end gap-3 pt-2 border-t border-surface-border">
            <Button type="button" variant="ghost" onClick={() => setOpenCreate(false)}>
              Batal
            </Button>
            <Button type="submit" isLoading={createMut.isPending}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      <FaceEnrollModal
        open={!!enrollTarget}
        onClose={() => setEnrollTarget(null)}
        userId={enrollTarget?.id ?? null}
        userName={enrollTarget?.full_name}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['employees'] })}
      />

      {/* Reset Password Modal */}
      <Modal
        open={!!resetPwTarget}
        onClose={() => { setResetPwTarget(null); setResetPwValue(''); }}
        title={`Reset Password — ${resetPwTarget?.full_name ?? ''}`}
        description={`${t.employee_id}: ${resetPwTarget?.employee_id ?? ''}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!resetPwTarget) return;
            if (resetPwValue.length < 6) {
              toast.error('Password minimal 6 karakter');
              return;
            }
            resetPwMut.mutate({ id: resetPwTarget.id, password: resetPwValue });
          }}
          className="space-y-4"
        >
          <Input
            label="Password Baru"
            type="password"
            value={resetPwValue}
            onChange={(e) => setResetPwValue(e.target.value)}
            placeholder="Minimal 6 karakter"
            required
            minLength={6}
            hint="Password lama akan langsung diganti"
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-surface-border">
            <Button type="button" variant="ghost" onClick={() => { setResetPwTarget(null); setResetPwValue(''); }}>
              Batal
            </Button>
            <Button type="submit" isLoading={resetPwMut.isPending}>
              Reset Password
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit ${getRoleLabel(editTarget?.role ?? 'employee', mode)}`}
        description={editTarget?.employee_id}
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editTarget) return;
            // Validation for school mode: parent_phone required (siswa only)
            if (isSchool && editForm.role === 'employee' && !editForm.parent_phone.trim()) {
              toast.error('HP Orang Tua/Wali wajib diisi untuk siswa');
              return;
            }
            editMut.mutate({
              id: editTarget.id,
              data: isSchool
                ? {
                    full_name: editForm.full_name,
                    email: editForm.email || null,
                    phone: editForm.phone || null,
                    parent_phone: editForm.parent_phone || null,
                    parent_name: editForm.parent_name || null,
                    school_class_id: editForm.school_class_id ? Number(editForm.school_class_id) : null,
                    department_id: null,
                    role: editForm.role,
                    status: editForm.status,
                  }
                : {
                    full_name: editForm.full_name,
                    email: editForm.email || null,
                    phone: editForm.phone || null,
                    parent_phone: editForm.parent_phone || null,
                    parent_name: null,
                    department_id: editForm.department_id ? Number(editForm.department_id) : null,
                    school_class_id: null,
                    role: editForm.role,
                    status: editForm.status,
                  },
            });
          }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <Input
            label={`Nama Lengkap`}
            value={editForm.full_name}
            onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
          />
          <Input
            label={isSchool ? 'HP (Opsional)' : 'Telepon'}
            value={editForm.phone}
            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
          />
          {editForm.role === 'employee' && (
            <Input
              label={t.parent_phone_label}
              value={editForm.parent_phone}
              onChange={(e) => setEditForm({ ...editForm, parent_phone: e.target.value })}
              placeholder="628xxxxxxxxxx"
              hint={t.parent_phone_hint}
              required={t.parent_phone_required}
            />
          )}
          {isSchool && editForm.role === 'employee' && (
            <Input
              label="Nama Orang Tua/Wali"
              value={editForm.parent_name}
              onChange={(e) => setEditForm({ ...editForm, parent_name: e.target.value })}
              placeholder="Contoh: Bapak Ahmad Santoso"
            />
          )}
          {editForm.role === 'employee' && (
            <div className="space-y-1.5">
              <label className="block font-body text-sm font-medium text-text-secondary">{t.department_label}</label>
              <select
                className="w-full bg-surface-raised border border-surface-border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
                value={isSchool ? editForm.school_class_id : editForm.department_id}
                onChange={(e) => isSchool
                  ? setEditForm({ ...editForm, school_class_id: e.target.value })
                  : setEditForm({ ...editForm, department_id: e.target.value })
                }
              >
                <option value="">— pilih —</option>
                {isSchool
                  ? schoolClasses?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.homeroom_teacher ? ` (${c.homeroom_teacher})` : ''}
                      </option>
                    ))
                  : departments?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))
                }
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block font-body text-sm font-medium text-text-secondary">Role</label>
            <select
              className="w-full bg-surface-raised border border-surface-border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              disabled={myRole !== 'super_admin'}
            >
              <option value="employee">Siswa</option>
              <option value="admin">Wali Kelas / Guru</option>
              <option value="hr">Guru BK</option>
              {myRole === 'super_admin' && <option value="super_admin">Kepala Sekolah</option>}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block font-body text-sm font-medium text-text-secondary">Status</label>
            <select
              className="w-full bg-surface-raised border border-surface-border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
            >
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex justify-end gap-3 pt-2 border-t border-surface-border">
            <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
              Batal
            </Button>
            <Button type="submit" isLoading={editMut.isPending}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CalendarDays, Link2, Link2Off, LocateFixed, MapPin, MessageCircle, Pencil, Phone, Plus, QrCode, RefreshCw, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api, { getErrorMessage, type Envelope } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatDate } from '@/lib/utils';

interface Department {
  id: number;
  name: string;
  description: string | null;
}

interface Holiday {
  id: number;
  name: string;
  date: string;
  is_national: boolean;
}

interface GeofenceSettings {
  id: number | null;
  org_id: number;
  location_name: string;
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  max_accuracy_meters: number;
  updated_at: string | null;
}

interface FaceSensitivitySettings {
  id: number | null;
  org_id: number;
  match_threshold: number;
  duplicate_threshold: number;
  min_quality: number;
  min_enrollment_frames: number;
  blur_threshold: number;
  min_brightness: number;
  max_brightness: number;
  min_variance: number;
  min_center_variance: number;
  min_rgb_spread: number;
  min_skin_ratio: number;
  liveness_enabled: boolean;
  liveness_min_delta: number;
  updated_at: string | null;
}

const defaultFaceForm = {
  match_threshold: '0.78',
  duplicate_threshold: '0.90',
  min_quality: '0.5',
  min_enrollment_frames: '3',
  blur_threshold: '50',
  min_brightness: '0.18',
  max_brightness: '0.92',
  min_variance: '220',
  min_center_variance: '120',
  min_rgb_spread: '8',
  min_skin_ratio: '0.045',
  liveness_enabled: true,
  liveness_min_delta: '0.6',
};

export default function OrganizationPage() {
  const qc = useQueryClient();
  const [openDept, setOpenDept] = useState(false);
  const [openHoliday, setOpenHoliday] = useState(false);
  const [openEditDept, setOpenEditDept] = useState(false);
  const [editDeptTarget, setEditDeptTarget] = useState<any>(null);
  const [editDeptForm, setEditDeptForm] = useState({ name: '', description: '' });
  const [openAddClass, setOpenAddClass] = useState(false);
  const [openEditClass, setOpenEditClass] = useState(false);
  const [editClassTarget, setEditClassTarget] = useState<any>(null);
  const [classForm, setClassForm] = useState({ name: '', grade: '', major: '', homeroom_teacher: '', description: '' });
  const [editClassForm, setEditClassForm] = useState({ name: '', grade: '', major: '', homeroom_teacher: '', description: '' });
  const [deptForm, setDeptForm] = useState({ name: '', description: '' });
  const [holForm, setHolForm] = useState({ name: '', date: '', is_national: false });
  const [geoForm, setGeoForm] = useState({
    location_name: 'Sekolah',
    enabled: false,
    latitude: '',
    longitude: '',
    radius_meters: '150',
    max_accuracy_meters: '150',
  });
  const [faceForm, setFaceForm] = useState(defaultFaceForm);
  const [waForm, setWaForm] = useState({
    enabled: false,
    api_url: '',
    api_token: '',
    message_template: '',
    notify_checkin: true,
    notify_checkout: false,
    notify_absent: true,
  });

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const r = await api.get<Envelope<Department[]>>('/org/departments');
      return r.data.data ?? [];
    },
  });

  const holidays = useQuery({
    queryKey: ['holidays'],
    queryFn: async () => {
      const r = await api.get<Envelope<Holiday[]>>('/org/holidays');
      return r.data.data ?? [];
    },
  });

  const geofence = useQuery({
    queryKey: ['geofence-settings'],
    queryFn: async () => {
      const r = await api.get<Envelope<GeofenceSettings>>('/org/geofence');
      return r.data.data;
    },
  });

  const faceSettings = useQuery({
    queryKey: ['face-settings'],
    queryFn: async () => {
      const r = await api.get<Envelope<FaceSensitivitySettings>>('/org/face-settings');
      return r.data.data;
    },
  });

  const waSettings = useQuery({
    queryKey: ['whatsapp-settings'],
    queryFn: async () => {
      const r = await api.get<Envelope<any>>('/org/whatsapp-settings');
      return r.data.data;
    },
  });

  const orgMode = useQuery({
    queryKey: ['org-mode'],
    queryFn: async () => {
      const r = await api.get<Envelope<any>>('/org/mode');
      return r.data.data;
    },
  });

  const isSchoolMode = true; // App ini fokus mode sekolah

  const schoolClasses = useQuery({
    queryKey: ['school-classes'],
    queryFn: async () => {
      const r = await api.get<Envelope<any[]>>('/org/school-classes');
      return r.data.data ?? [];
    },
  });

  useEffect(() => {
    const data = geofence.data;
    if (!data) return;
    setGeoForm({
      location_name: data.location_name || 'Sekolah',
      enabled: data.enabled,
      latitude: data.latitude == null ? '' : String(data.latitude),
      longitude: data.longitude == null ? '' : String(data.longitude),
      radius_meters: String(data.radius_meters),
      max_accuracy_meters: String(data.max_accuracy_meters),
    });
  }, [geofence.data]);

  useEffect(() => {
    const data = faceSettings.data;
    if (!data) return;
    setFaceForm({
      match_threshold: String(data.match_threshold),
      duplicate_threshold: String(data.duplicate_threshold),
      min_quality: String(data.min_quality),
      min_enrollment_frames: String(data.min_enrollment_frames),
      blur_threshold: String(data.blur_threshold),
      min_brightness: String(data.min_brightness),
      max_brightness: String(data.max_brightness),
      min_variance: String(data.min_variance),
      min_center_variance: String(data.min_center_variance),
      min_rgb_spread: String(data.min_rgb_spread),
      min_skin_ratio: String(data.min_skin_ratio),
      liveness_enabled: data.liveness_enabled,
      liveness_min_delta: String(data.liveness_min_delta),
    });
  }, [faceSettings.data]);

  useEffect(() => {
    const data = waSettings.data;
    if (!data) return;
    setWaForm({
      enabled: data.enabled ?? false,
      api_url: data.api_url || '',
      api_token: data.api_token || '',
      message_template: data.message_template || '',
      notify_checkin: data.notify_checkin ?? true,
      notify_checkout: data.notify_checkout ?? false,
      notify_absent: data.notify_absent ?? true,
    });
  }, [waSettings.data]);

  const createDept = useMutation({
    mutationFn: async () => {
      await api.post('/org/departments', deptForm);
    },
    onSuccess: () => {
      toast.success('Kelas ditambahkan');
      qc.invalidateQueries({ queryKey: ['departments'] });
      setOpenDept(false);
      setDeptForm({ name: '', description: '' });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateDept = useMutation({
    mutationFn: async (data: { id: number; form: typeof editDeptForm }) => {
      await api.put(`/org/departments/${data.id}`, data.form);
    },
    onSuccess: () => {
      toast.success('Departemen diperbarui');
      qc.invalidateQueries({ queryKey: ['departments'] });
      setOpenEditDept(false);
      setEditDeptTarget(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteDept = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/org/departments/${id}`);
    },
    onSuccess: () => {
      toast.success('Departemen dihapus');
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openEditDeptModal = (d: any) => {
    setEditDeptTarget(d);
    setEditDeptForm({ name: d.name || '', description: d.description || '' });
    setOpenEditDept(true);
  };

  const createClass = useMutation({
    mutationFn: async () => {
      await api.post('/org/school-classes', {
        name: classForm.name,
        grade: classForm.grade || null,
        major: classForm.major || null,
        homeroom_teacher: classForm.homeroom_teacher || null,
        description: classForm.description || null,
      });
    },
    onSuccess: () => {
      toast.success('Kelas ditambahkan');
      qc.invalidateQueries({ queryKey: ['school-classes'] });
      setOpenAddClass(false);
      setClassForm({ name: '', grade: '', major: '', homeroom_teacher: '', description: '' });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateClass = useMutation({
    mutationFn: async (data: { id: number; form: typeof editClassForm }) => {
      await api.put(`/org/school-classes/${data.id}`, {
        name: data.form.name,
        grade: data.form.grade || null,
        major: data.form.major || null,
        homeroom_teacher: data.form.homeroom_teacher || null,
        description: data.form.description || null,
      });
    },
    onSuccess: () => {
      toast.success('Kelas berhasil diperbarui');
      qc.invalidateQueries({ queryKey: ['school-classes'] });
      setOpenEditClass(false);
      setEditClassTarget(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteClass = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/org/school-classes/${id}`);
    },
    onSuccess: () => {
      toast.success('Kelas dihapus');
      qc.invalidateQueries({ queryKey: ['school-classes'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openEditClassModal = (c: any) => {
    setEditClassTarget(c);
    setEditClassForm({
      name: c.name || '',
      grade: c.grade || '',
      major: c.major || '',
      homeroom_teacher: c.homeroom_teacher || '',
      description: c.description || '',
    });
    setOpenEditClass(true);
  };

  const createHoliday = useMutation({
    mutationFn: async () => {
      await api.post('/org/holidays', holForm);
    },
    onSuccess: () => {
      toast.success('Hari libur ditambahkan');
      qc.invalidateQueries({ queryKey: ['holidays'] });
      setOpenHoliday(false);
      setHolForm({ name: '', date: '', is_national: false });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/org/holidays/${id}`);
    },
    onSuccess: () => {
      toast.success('Hari libur dihapus');
      qc.invalidateQueries({ queryKey: ['holidays'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const saveGeofence = useMutation({
    mutationFn: async () => {
      await api.put('/org/geofence', {
        location_name: geoForm.location_name.trim() || 'Sekolah',
        enabled: geoForm.enabled,
        latitude: geoForm.latitude === '' ? null : Number(geoForm.latitude),
        longitude: geoForm.longitude === '' ? null : Number(geoForm.longitude),
        radius_meters: Number(geoForm.radius_meters),
        max_accuracy_meters: Number(geoForm.max_accuracy_meters),
      });
    },
    onSuccess: () => {
      toast.success('Pengaturan lokasi disimpan');
      qc.invalidateQueries({ queryKey: ['geofence-settings'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const saveFaceSettings = useMutation({
    mutationFn: async () => {
      await api.put('/org/face-settings', {
        match_threshold: Number(faceForm.match_threshold),
        duplicate_threshold: Number(faceForm.duplicate_threshold),
        min_quality: Number(faceForm.min_quality),
        min_enrollment_frames: Number(faceForm.min_enrollment_frames),
        blur_threshold: Number(faceForm.blur_threshold),
        min_brightness: Number(faceForm.min_brightness),
        max_brightness: Number(faceForm.max_brightness),
        min_variance: Number(faceForm.min_variance),
        min_center_variance: Number(faceForm.min_center_variance),
        min_rgb_spread: Number(faceForm.min_rgb_spread),
        min_skin_ratio: Number(faceForm.min_skin_ratio),
        liveness_enabled: faceForm.liveness_enabled,
        liveness_min_delta: Number(faceForm.liveness_min_delta),
      });
    },
    onSuccess: () => {
      toast.success('Pengaturan wajah disimpan');
      qc.invalidateQueries({ queryKey: ['face-settings'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const saveWaSettings = useMutation({
    mutationFn: async () => {
      await api.put('/org/whatsapp-settings', waForm);
    },
    onSuccess: () => {
      toast.success('Pengaturan WhatsApp disimpan');
      qc.invalidateQueries({ queryKey: ['whatsapp-settings'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Browser tidak mendukung geolocation');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoForm((prev) => ({
          ...prev,
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
        }));
        toast.success(`Lokasi diambil, akurasi ${Math.round(position.coords.accuracy)}m`);
      },
      () => toast.error('Gagal mengambil lokasi perangkat. Pastikan izin lokasi aktif.'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-md font-bold">Sekolah</h1>
        <p className="font-body text-text-muted mt-1">Kelola kelas, kalender libur, dan lokasi sekolah</p>
      </div>

      <Card padding="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveGeofence.mutate();
          }}
          className="space-y-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary-500/10">
                <MapPin className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg">Lokasi Absensi BYOD</h3>
                <p className="text-sm text-text-muted">
                  Atur titik sekolah dan toleransi jarak untuk scan wajah.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:items-end gap-2">
              <span
                className={`w-fit text-2xs font-mono uppercase tracking-widest px-2 py-1 rounded-full border ${
                  geoForm.enabled
                    ? 'text-success bg-success/10 border-success/30'
                    : 'text-danger bg-danger/10 border-danger/30'
                }`}
              >
                {geoForm.enabled ? 'Geofence Aktif' : 'Geofence Nonaktif'}
              </span>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={geoForm.enabled}
                  onChange={(e) => setGeoForm({ ...geoForm, enabled: e.target.checked })}
                  className="rounded border-surface-border bg-surface-raised text-primary-500 focus:ring-primary-500/30"
                />
                Aktifkan geofence
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Input
              label="Nama Lokasi"
              value={geoForm.location_name}
              onChange={(e) => setGeoForm({ ...geoForm, location_name: e.target.value })}
              placeholder="Sekolah / Kampus Utama"
              required
            />
            <Input
              label="Latitude"
              type="text"
              inputMode="decimal"
              value={geoForm.latitude}
              onChange={(e) => setGeoForm({ ...geoForm, latitude: e.target.value })}
              placeholder="-6.200000"
              required={geoForm.enabled}
            />
            <Input
              label="Longitude"
              type="text"
              inputMode="decimal"
              value={geoForm.longitude}
              onChange={(e) => setGeoForm({ ...geoForm, longitude: e.target.value })}
              placeholder="106.816666"
              required={geoForm.enabled}
            />
            <Input
              label="Radius Diizinkan (meter)"
              type="number"
              min={10}
              max={10000}
              value={geoForm.radius_meters}
              onChange={(e) => setGeoForm({ ...geoForm, radius_meters: e.target.value })}
              hint="Contoh: 150-300m untuk area sekolah."
              required
            />
            <Input
              label="Maks. Akurasi GPS (meter)"
              type="number"
              min={10}
              max={5000}
              value={geoForm.max_accuracy_meters}
              onChange={(e) => setGeoForm({ ...geoForm, max_accuracy_meters: e.target.value })}
              hint="Tolak scan jika GPS terlalu tidak akurat."
              required
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end border-t border-surface-border pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={useCurrentLocation}
              leftIcon={<LocateFixed className="w-4 h-4" />}
            >
              Pakai Lokasi Perangkat Ini
            </Button>
            <Button type="submit" isLoading={saveGeofence.isPending} leftIcon={<Save className="w-4 h-4" />}>
              Simpan Lokasi
            </Button>
          </div>
        </form>
      </Card>

      <Card padding="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveFaceSettings.mutate();
          }}
          className="space-y-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-accent-500/10">
                <SlidersHorizontal className="w-5 h-5 text-accent-400" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg">Sensitivitas Wajah</h3>
                <p className="text-sm text-text-muted">
                  Atur toleransi scan, enrollment, duplikasi wajah, dan liveness.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={faceForm.liveness_enabled}
                onChange={(e) => setFaceForm({ ...faceForm, liveness_enabled: e.target.checked })}
                className="rounded border-surface-border bg-surface-raised text-primary-500 focus:ring-primary-500/30"
              />
              Liveness check aktif
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Input
              label="Match Threshold"
              type="number"
              min={0.3}
              max={0.99}
              step={0.01}
              value={faceForm.match_threshold}
              onChange={(e) => setFaceForm({ ...faceForm, match_threshold: e.target.value })}
              hint="Turunkan jika scan sering gagal."
              required
            />
            <Input
              label="Duplicate Threshold"
              type="number"
              min={0.3}
              max={0.99}
              step={0.01}
              value={faceForm.duplicate_threshold}
              onChange={(e) => setFaceForm({ ...faceForm, duplicate_threshold: e.target.value })}
              hint="Naikkan jika beda orang sering dianggap sama."
              required
            />
            <Input
              label="Min. Kualitas"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={faceForm.min_quality}
              onChange={(e) => setFaceForm({ ...faceForm, min_quality: e.target.value })}
              hint="Turunkan jika foto valid sering ditolak."
              required
            />
            <Input
              label="Min. Foto Enrollment"
              type="number"
              min={1}
              max={12}
              step={1}
              value={faceForm.min_enrollment_frames}
              onChange={(e) => setFaceForm({ ...faceForm, min_enrollment_frames: e.target.value })}
              hint="Jumlah foto valid minimum."
              required
            />
            <Input
              label="Ambang Blur"
              type="number"
              min={0}
              max={500}
              step={1}
              value={faceForm.blur_threshold}
              onChange={(e) => setFaceForm({ ...faceForm, blur_threshold: e.target.value })}
              hint="Turunkan jika kamera sering dianggap blur."
              required
            />
            <Input
              label="Brightness Min."
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={faceForm.min_brightness}
              onChange={(e) => setFaceForm({ ...faceForm, min_brightness: e.target.value })}
              required
            />
            <Input
              label="Brightness Maks."
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={faceForm.max_brightness}
              onChange={(e) => setFaceForm({ ...faceForm, max_brightness: e.target.value })}
              required
            />
            <Input
              label="Liveness Delta"
              type="number"
              min={0}
              max={20}
              step={0.1}
              value={faceForm.liveness_min_delta}
              onChange={(e) => setFaceForm({ ...faceForm, liveness_min_delta: e.target.value })}
              hint="Turunkan jika frame gerak kecil ditolak."
              disabled={!faceForm.liveness_enabled}
              required
            />
            <Input
              label="Variasi Global"
              type="number"
              min={0}
              max={2000}
              step={1}
              value={faceForm.min_variance}
              onChange={(e) => setFaceForm({ ...faceForm, min_variance: e.target.value })}
              required
            />
            <Input
              label="Variasi Tengah"
              type="number"
              min={0}
              max={2000}
              step={1}
              value={faceForm.min_center_variance}
              onChange={(e) => setFaceForm({ ...faceForm, min_center_variance: e.target.value })}
              required
            />
            <Input
              label="RGB Spread"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={faceForm.min_rgb_spread}
              onChange={(e) => setFaceForm({ ...faceForm, min_rgb_spread: e.target.value })}
              required
            />
            <Input
              label="Skin Ratio"
              type="number"
              min={0}
              max={1}
              step={0.005}
              value={faceForm.min_skin_ratio}
              onChange={(e) => setFaceForm({ ...faceForm, min_skin_ratio: e.target.value })}
              hint="Turunkan jika wajah valid tidak terdeteksi."
              required
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:justify-between border-t border-surface-border pt-4">
            <p className="text-xs text-text-muted max-w-2xl">
              Rekomendasi cepat: turunkan Match Threshold ke 0.70-0.74 kalau scan sering ditolak;
              naikkan Duplicate Threshold ke 0.88-0.94 kalau beda orang dianggap sama.
            </p>
            <Button type="submit" isLoading={saveFaceSettings.isPending} leftIcon={<Save className="w-4 h-4" />}>
              Simpan Sensitivitas
            </Button>
          </div>
        </form>
      </Card>

      {/* WhatsApp Notification Settings */}
      <Card padding="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveWaSettings.mutate();
          }}
          className="space-y-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-success/10">
                <MessageCircle className="w-5 h-5 text-success" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg">Notifikasi WhatsApp</h3>
                <p className="text-sm text-text-muted">
                  Kirim pesan otomatis ke orang tua/wali saat anak melakukan absensi.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:items-end gap-2">
              <span
                className={`w-fit text-2xs font-mono uppercase tracking-widest px-2 py-1 rounded-full border ${
                  waForm.enabled
                    ? 'text-success bg-success/10 border-success/30'
                    : 'text-text-muted bg-surface-muted border-surface-border'
                }`}
              >
                {waForm.enabled ? 'Aktif' : 'Nonaktif'}
              </span>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={waForm.enabled}
                  onChange={(e) => setWaForm({ ...waForm, enabled: e.target.checked })}
                  className="rounded border-surface-border bg-surface-raised text-primary-500 focus:ring-primary-500/30"
                />
                Aktifkan notifikasi WA
              </label>
            </div>
          </div>

          {/* WA Gateway Connection Panel */}
          <WAGatewayPanel />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="API URL"
              value={waForm.api_url}
              onChange={(e) => setWaForm({ ...waForm, api_url: e.target.value })}
              placeholder="http://localhost:3001/send"
              hint="Kosongkan untuk gateway lokal (default). Isi jika pakai external API."
            />
            <Input
              label="API Token"
              type="password"
              value={waForm.api_token}
              onChange={(e) => setWaForm({ ...waForm, api_token: e.target.value })}
              placeholder="Kosongkan untuk gateway lokal"
            />
          </div>

          <div>
            <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
              Template Pesan
            </label>
            <textarea
              className="w-full bg-surface-raised border border-surface-border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none min-h-[120px] font-mono text-xs"
              value={waForm.message_template}
              onChange={(e) => setWaForm({ ...waForm, message_template: e.target.value })}
              placeholder={'Variabel: {salam}, {nama}, {aksi}, {tanggal}, {waktu}, {lokasi}, {status}, {organisasi}, {penutup}'}
            />
            <p className="text-xs text-text-muted mt-1">
              Variabel: {'{salam}'} (random greeting), {'{nama}'}, {'{aksi}'}, {'{tanggal}'}, {'{waktu}'}, {'{lokasi}'}, {'{status}'}, {'{organisasi}'}, {'{penutup}'} (random closing)
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={waForm.notify_checkin}
                onChange={(e) => setWaForm({ ...waForm, notify_checkin: e.target.checked })}
                className="rounded border-surface-border bg-surface-raised text-primary-500 focus:ring-primary-500/30"
              />
              Notif saat Check-in
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={waForm.notify_checkout}
                onChange={(e) => setWaForm({ ...waForm, notify_checkout: e.target.checked })}
                className="rounded border-surface-border bg-surface-raised text-primary-500 focus:ring-primary-500/30"
              />
              Notif saat Check-out
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={waForm.notify_absent}
                onChange={(e) => setWaForm({ ...waForm, notify_absent: e.target.checked })}
                className="rounded border-surface-border bg-surface-raised text-primary-500 focus:ring-primary-500/30"
              />
              Notif saat Tidak Hadir
            </label>
          </div>

          <div className="flex justify-end border-t border-surface-border pt-4">
            <Button type="submit" isLoading={saveWaSettings.isPending} leftIcon={<Save className="w-4 h-4" />}>
              Simpan WhatsApp
            </Button>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* School Classes section - only in school mode */}
        {isSchoolMode && (
          <Card padding="lg" className="lg:col-span-2">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-primary-500/10">
                  <Building2 className="w-5 h-5 text-primary-400" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-lg">Daftar Kelas</h3>
                  <p className="text-sm text-text-muted">{schoolClasses.data?.length ?? 0} kelas terdaftar</p>
                </div>
              </div>
              <Button size="sm" onClick={() => setOpenAddClass(true)} leftIcon={<Plus className="w-4 h-4" />}>
                Tambah Kelas
              </Button>
            </div>
            {schoolClasses.data?.length === 0 ? (
              <p className="text-center text-text-muted py-6">Belum ada kelas. Tambahkan kelas terlebih dahulu.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {schoolClasses.data?.map((c: any) => (
                  <div key={c.id} className="p-3 rounded-lg border border-surface-border bg-surface-muted/50 hover:border-primary-500/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-body font-semibold text-sm">{c.name}</p>
                        {c.homeroom_teacher && (
                          <p className="text-xs text-text-muted mt-0.5">Wali: {c.homeroom_teacher}</p>
                        )}
                        {(c.grade || c.major) && (
                          <p className="text-xs text-text-muted">
                            {[c.grade && `Tingkat ${c.grade}`, c.major].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      {/* Action buttons — always visible */}
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => openEditClassModal(c)}
                          className="p-1.5 rounded-md text-text-muted hover:text-primary-400 hover:bg-primary-500/10 transition-colors"
                          title="Edit kelas"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Hapus kelas "${c.name}"? Siswa yang terdaftar di kelas ini tidak akan terhapus.`)) {
                              deleteClass.mutate(c.id);
                            }
                          }}
                          className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Hapus kelas"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Departments section - only in office mode */}
        {!isSchoolMode && (
        <Card padding="lg">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary-500/10">
                <Building2 className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg">Departemen</h3>
                <p className="text-sm text-text-muted">
                  {departments.data?.length ?? 0} departemen
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => setOpenDept(true)} leftIcon={<Plus className="w-4 h-4" />}>
              Tambah
            </Button>
          </div>
          <ul className="divide-y divide-surface-border">
            {departments.data?.map((d) => (
              <li key={d.id} className="py-3 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-body font-medium">{d.name}</p>
                  {d.description && <p className="text-sm text-text-muted mt-0.5">{d.description}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => openEditDeptModal(d)}
                    className="p-1.5 rounded-md text-text-muted hover:text-primary-400 hover:bg-primary-500/10 transition-colors"
                    title="Edit departemen"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Hapus departemen "${d.name}"?`)) {
                        deleteDept.mutate(d.id);
                      }
                    }}
                    className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    title="Hapus departemen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
            {departments.data?.length === 0 && (
              <li className="py-6 text-center text-text-muted">
                Belum ada departemen
              </li>
            )}
          </ul>
        </Card>
        )}

        <Card padding="lg">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-accent-500/10">
                <CalendarDays className="w-5 h-5 text-accent-400" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg">Hari Libur</h3>
                <p className="text-sm text-text-muted">{holidays.data?.length ?? 0} hari libur</p>
              </div>
            </div>
            <Button size="sm" onClick={() => setOpenHoliday(true)} leftIcon={<Plus className="w-4 h-4" />}>
              Tambah
            </Button>
          </div>
          <ul className="divide-y divide-surface-border">
            {holidays.data?.map((h) => (
              <li key={h.id} className="py-3 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-body font-medium">{h.name}</p>
                  <p className="font-mono text-xs text-text-muted">{formatDate(h.date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {h.is_national && (
                    <span className="text-2xs font-mono uppercase tracking-widest text-accent-400 bg-accent-500/10 px-2 py-1 rounded-full border border-accent-500/30">
                      Nasional
                    </span>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Hapus hari libur "${h.name}"?`)) {
                        deleteHoliday.mutate(h.id);
                      }
                    }}
                    className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    title="Hapus hari libur"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
            {holidays.data?.length === 0 && (
              <li className="py-6 text-center text-text-muted">Belum ada hari libur</li>
            )}
          </ul>
        </Card>
      </div>

      <Modal
        open={openDept}
        onClose={() => setOpenDept(false)}
        title="Tambah Kelas"
      >        <form
          onSubmit={(e) => {
            e.preventDefault();
            createDept.mutate();
          }}
          className="space-y-4"
        >
          <Input
            label="Nama"
            value={deptForm.name}
            onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
            required
          />
          <Input
            label="Deskripsi"
            value={deptForm.description}
            onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-surface-border">
            <Button type="button" variant="ghost" onClick={() => setOpenDept(false)}>
              Batal
            </Button>
            <Button type="submit" isLoading={createDept.isPending}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Department Modal */}
      <Modal
        open={openEditDept}
        onClose={() => setOpenEditDept(false)}
        title={`Edit Departemen — ${editDeptTarget?.name ?? ''}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editDeptTarget) return;
            updateDept.mutate({ id: editDeptTarget.id, form: editDeptForm });
          }}
          className="space-y-4"
        >
          <Input
            label="Nama"
            value={editDeptForm.name}
            onChange={(e) => setEditDeptForm({ ...editDeptForm, name: e.target.value })}
            required
          />
          <Input
            label="Deskripsi"
            value={editDeptForm.description}
            onChange={(e) => setEditDeptForm({ ...editDeptForm, description: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-surface-border">
            <Button type="button" variant="ghost" onClick={() => setOpenEditDept(false)}>
              Batal
            </Button>
            <Button type="submit" isLoading={updateDept.isPending}>
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={openHoliday} onClose={() => setOpenHoliday(false)} title="Tambah Hari Libur">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createHoliday.mutate();
          }}
          className="space-y-4"
        >
          <Input
            label="Nama"
            value={holForm.name}
            onChange={(e) => setHolForm({ ...holForm, name: e.target.value })}
            required
          />
          <Input
            label="Tanggal"
            type="date"
            value={holForm.date}
            onChange={(e) => setHolForm({ ...holForm, date: e.target.value })}
            required
          />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={holForm.is_national}
              onChange={(e) => setHolForm({ ...holForm, is_national: e.target.checked })}
              className="rounded border-surface-border bg-surface-raised text-primary-500 focus:ring-primary-500/30"
            />
            Hari libur nasional
          </label>
          <div className="flex justify-end gap-3 pt-2 border-t border-surface-border">
            <Button type="button" variant="ghost" onClick={() => setOpenHoliday(false)}>
              Batal
            </Button>
            <Button type="submit" isLoading={createHoliday.isPending}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add School Class Modal */}
      <Modal open={openAddClass} onClose={() => setOpenAddClass(false)} title="Tambah Kelas Baru">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createClass.mutate();
          }}
          className="space-y-4"
        >
          <Input
            label="Nama Kelas"
            value={classForm.name}
            onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
            placeholder="Contoh: 10 IPA 1"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Tingkat"
              value={classForm.grade}
              onChange={(e) => setClassForm({ ...classForm, grade: e.target.value })}
              placeholder="Contoh: 10, 11, 12"
            />
            <Input
              label="Jurusan"
              value={classForm.major}
              onChange={(e) => setClassForm({ ...classForm, major: e.target.value })}
              placeholder="Contoh: IPA, IPS, Bahasa"
            />
          </div>
          <Input
            label="Wali Kelas"
            value={classForm.homeroom_teacher}
            onChange={(e) => setClassForm({ ...classForm, homeroom_teacher: e.target.value })}
            placeholder="Contoh: Budi Santoso, S.Pd"
          />
          <Input
            label="Keterangan"
            value={classForm.description}
            onChange={(e) => setClassForm({ ...classForm, description: e.target.value })}
            placeholder="Opsional"
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-surface-border">
            <Button type="button" variant="ghost" onClick={() => setOpenAddClass(false)}>
              Batal
            </Button>
            <Button type="submit" isLoading={createClass.isPending}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit School Class Modal */}
      <Modal open={openEditClass} onClose={() => setOpenEditClass(false)} title={`Edit Kelas — ${editClassTarget?.name ?? ''}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editClassTarget) return;
            updateClass.mutate({ id: editClassTarget.id, form: editClassForm });
          }}
          className="space-y-4"
        >
          <Input
            label="Nama Kelas"
            value={editClassForm.name}
            onChange={(e) => setEditClassForm({ ...editClassForm, name: e.target.value })}
            placeholder="Contoh: 10 IPA 1"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Tingkat"
              value={editClassForm.grade}
              onChange={(e) => setEditClassForm({ ...editClassForm, grade: e.target.value })}
              placeholder="Contoh: 10, 11, 12"
            />
            <Input
              label="Jurusan"
              value={editClassForm.major}
              onChange={(e) => setEditClassForm({ ...editClassForm, major: e.target.value })}
              placeholder="Contoh: IPA, IPS, Bahasa"
            />
          </div>
          <Input
            label="Wali Kelas"
            value={editClassForm.homeroom_teacher}
            onChange={(e) => setEditClassForm({ ...editClassForm, homeroom_teacher: e.target.value })}
            placeholder="Contoh: Budi Santoso, S.Pd"
          />
          <Input
            label="Keterangan"
            value={editClassForm.description}
            onChange={(e) => setEditClassForm({ ...editClassForm, description: e.target.value })}
            placeholder="Opsional"
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-surface-border">
            <Button type="button" variant="ghost" onClick={() => setOpenEditClass(false)}>
              Batal
            </Button>
            <Button type="submit" isLoading={updateClass.isPending}>
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}

function WAGatewayPanel() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [processRunning, setProcessRunning] = useState<boolean | null>(null);
  const [startingProcess, setStartingProcess] = useState(false);

  const [testPhone, setTestPhone] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/wa-gateway/status');
      const data = (res.data as any)?.data;
      setStatus(data);
      setProcessRunning(data !== null);
    } catch {
      setStatus(null);
      setProcessRunning(false);
    }
  }, []);

  const checkProcess = useCallback(async () => {
    try {
      const res = await api.get<Envelope<{ running: boolean }>>('/wa-gateway/process-status');
      setProcessRunning(res.data.data?.running ?? false);
    } catch {
    }
  }, []);

  // Poll status every 3s when connecting (waiting for QR scan)
  useEffect(() => {
    fetchStatus();
    checkProcess();
    if (!polling) return;
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [fetchStatus, checkProcess, polling]);

  // Start polling when connecting
  useEffect(() => {
    if (status?.connection_state === 'connecting') {
      setPolling(true);
    } else {
      setPolling(false);
    }
  }, [status?.connection_state]);

  const handleStartProcess = async () => {
    setStartingProcess(true);
    try {
      const res = await api.post<Envelope<{ running: boolean }>>('/wa-gateway/start');
      if (res.data.data?.running) {
        toast.success(res.data.message || 'WA Gateway dijalankan');
        // Wait a bit for the process to start listening
        setTimeout(fetchStatus, 2000);
      } else {
        toast.error(res.data.message || 'Gagal menjalankan');
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setStartingProcess(false);
    }
  };

  const handleStopProcess = async () => {
    try {
      await api.post('/wa-gateway/stop');
      toast.success('WA Gateway dihentikan');
      setStatus(null);
      setProcessRunning(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      await api.post('/wa-gateway/connect');
      setPolling(true);
      setTimeout(fetchStatus, 1000);
    } catch {
      toast.error('Gagal terhubung ke WA Gateway.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await api.post('/wa-gateway/disconnect');
      setTimeout(fetchStatus, 500);
    } catch {
      toast.error('Gagal disconnect');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm('Logout akan menghapus session. Perlu scan QR ulang. Lanjutkan?')) return;
    setLoading(true);
    try {
      await api.post('/wa-gateway/logout');
      setTimeout(fetchStatus, 500);
    } catch {
      toast.error('Gagal logout');
    } finally {
      setLoading(false);
    }
  };

  const handleTestSend = async () => {
    if (!testPhone.trim()) {
      toast.error('Masukkan nomor WA tujuan');
      return;
    }
    setSendingTest(true);
    try {
      const res = await api.post('/wa-gateway/send-test', {
        target: testPhone.trim(),
        message: `✅ *Test Aethera WA Gateway*\n\nPesan ini dikirim otomatis untuk memastikan koneksi WhatsApp berfungsi.\n\n🕐 ${new Date().toLocaleString('id-ID')}\n\nJika Anda menerima pesan ini, berarti notifikasi absensi sudah siap digunakan.`,
      });
      const data = res.data as any;
      if (data.success) {
        toast.success('Pesan test terkirim! Cek WA kamu.');
      } else {
        toast.error(data.error || 'Gagal kirim');
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSendingTest(false);
    }
  };

  const isGatewayOffline = status === null;
  const isConnected = status?.connection_state === 'connected';
  const isConnecting = status?.connection_state === 'connecting';
  const hasQR = status?.qr;

  return (
    <div className="rounded-lg border border-surface-border bg-surface-base/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-success" />
          <span className="font-mono text-xs uppercase tracking-widest text-text-muted">WA Gateway</span>
        </div>
        <button
          onClick={() => { fetchStatus(); checkProcess(); }}
          className="p-1 rounded text-text-muted hover:text-primary-400 transition-colors"
          title="Refresh status"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {isGatewayOffline ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-danger" />
            <p className="text-sm text-text-muted">Gateway tidak aktif</p>
          </div>
          <Button
            size="sm"
            onClick={handleStartProcess}
            isLoading={startingProcess}
            disabled={startingProcess}
            leftIcon={<Link2 className="w-3.5 h-3.5" />}
          >
            Jalankan WA Gateway
          </Button>
          <p className="text-xs text-text-muted">
            Klik untuk menjalankan service WA Gateway otomatis dari web.
          </p>
        </div>
      ) : isConnected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-success animate-status-blink" />
            <div>
              <p className="text-sm font-medium text-success">Terhubung</p>
              <p className="text-xs text-text-muted">
                {status.name} ({status.phone})
              </p>
            </div>
          </div>
          {status.queue_size > 0 && (
            <p className="text-xs text-text-muted">
              📨 {status.queue_size} pesan dalam antrian
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleDisconnect}
              disabled={loading}
              leftIcon={<Link2Off className="w-3.5 h-3.5" />}
            >
              Disconnect
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleLogout}
              disabled={loading}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Logout
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleStopProcess}
              className="text-danger hover:text-danger"
            >
              Stop Service
            </Button>
          </div>
          {/* Test Send */}
          <div className="flex gap-2 items-end pt-2 border-t border-surface-border">
            <div className="flex-1">
              <label className="block text-xs text-text-muted mb-1">Test kirim ke nomor:</label>
              <input
                type="text"
                inputMode="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="08xxxxxxxxxx"
                className="w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <Button
              size="sm"
              onClick={handleTestSend}
              disabled={sendingTest || !testPhone.trim()}
              isLoading={sendingTest}
            >
              Kirim Test
            </Button>
          </div>
        </div>
      ) : isConnecting && hasQR ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-primary-400 animate-pulse" />
            <p className="text-sm text-primary-400">Scan QR code dengan WhatsApp</p>
          </div>
          <div className="flex justify-center bg-white rounded-lg p-4">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(status.qr)}`}
              alt="WhatsApp QR Code"
              className="w-[200px] h-[200px]"
            />
          </div>
          <p className="text-xs text-text-muted text-center">
            Buka WhatsApp → Menu → Perangkat Tertaut → Tautkan Perangkat
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-400" />
            <p className="text-sm text-text-muted">
              {status?.last_error ? `Terputus: ${status.last_error}` : 'Service aktif, WA belum terhubung'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={loading}
              isLoading={loading}
              leftIcon={<Link2 className="w-3.5 h-3.5" />}
            >
              Hubungkan WhatsApp
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleStopProcess}
              className="text-danger hover:text-danger"
            >
              Stop Service
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

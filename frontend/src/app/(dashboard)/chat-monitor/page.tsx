'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Eye,
  Flag,
  MessageCircle,
  Shield,
  Trash2,
  UserX,
  VolumeX,
  Volume2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import {
  deleteMessage,
  fetchFlaggedMessages,
  fetchMonitor,
  fetchMutedUsers,
  muteUser,
  purgeChatMessages,
  unmuteUser,
  type PurgeResult,
} from '@/lib/chatApi';
import { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn, formatDate, formatDateTime } from '@/lib/utils';

/**
 * Halaman moderasi chat — hanya untuk kepsek & BK.
 * Fitur: lihat semua percakapan, pesan ter-flag, mute/unmute siswa.
 */
export default function ChatMonitorPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isKepsek = currentUser?.role === 'super_admin';
  const [tab, setTab] = useState<'flagged' | 'monitor' | 'muted' | 'purge'>('flagged');
  const [muteOpen, setMuteOpen] = useState(false);
  const [muteForm, setMuteForm] = useState({ userId: 0, userName: '', reason: '', hours: '' });
  const [purgeForm, setPurgeForm] = useState({ days: '90', password: '' });
  const [purgePreview, setPurgePreview] = useState<PurgeResult | null>(null);

  const { data: flagged = [], isLoading: loadingFlagged } = useQuery({
    queryKey: ['chat-flagged'],
    queryFn: fetchFlaggedMessages,
    enabled: tab === 'flagged',
    refetchInterval: 30_000,
  });

  const { data: monitor = [], isLoading: loadingMonitor } = useQuery({
    queryKey: ['chat-monitor'],
    queryFn: () => fetchMonitor(),
    enabled: tab === 'monitor',
    refetchInterval: 30_000,
  });

  const { data: muted = [] } = useQuery({
    queryKey: ['chat-muted'],
    queryFn: fetchMutedUsers,
    enabled: tab === 'muted',
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMessage(id),
    onSuccess: () => {
      toast.success('Pesan dihapus');
      queryClient.invalidateQueries({ queryKey: ['chat-flagged'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const muteMutation = useMutation({
    mutationFn: () =>
      muteUser(
        muteForm.userId,
        muteForm.reason || undefined,
        muteForm.hours ? Number(muteForm.hours) : undefined
      ),
    onSuccess: () => {
      toast.success(`${muteForm.userName} di-mute dari chat`);
      setMuteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['chat-muted'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const unmuteMutation = useMutation({
    mutationFn: (userId: number) => unmuteUser(userId),
    onSuccess: () => {
      toast.success('Mute dicabut');
      queryClient.invalidateQueries({ queryKey: ['chat-muted'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const purgePreviewMutation = useMutation({
    mutationFn: () =>
      purgeChatMessages(Number(purgeForm.days), purgeForm.password, true),
    onSuccess: (res) => {
      if (res.success && res.data) {
        setPurgePreview(res.data);
      } else {
        toast.error(res.message ?? 'Gagal preview');
      }
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const purgeExecuteMutation = useMutation({
    mutationFn: () =>
      purgeChatMessages(Number(purgeForm.days), purgeForm.password, false),
    onSuccess: (res) => {
      if (res.success && res.data) {
        toast.success(res.data.message);
        setPurgePreview(null);
        setPurgeForm({ days: '90', password: '' });
        queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
        queryClient.invalidateQueries({ queryKey: ['chat-monitor'] });
      } else {
        toast.error(res.message ?? 'Gagal purge');
      }
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const TABS = [
    { key: 'flagged' as const, label: 'Pesan Dilaporkan', icon: Flag, badge: flagged.length },
    { key: 'monitor' as const, label: 'Semua Percakapan', icon: Eye },
    { key: 'muted' as const, label: 'User Di-mute', icon: VolumeX, badge: muted.length },
    ...(isKepsek ? [{ key: 'purge' as const, label: 'Bersihkan DB', icon: Trash2 }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Moderasi
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Monitor Chat</h1>
        <p className="font-body text-text-muted mt-1">
          Pantau semua percakapan, tinjau laporan, dan kelola keamanan chat.
        </p>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-xl border border-surface-border bg-surface-raised p-1.5 flex-wrap gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-2 rounded-lg font-display font-semibold text-sm transition-all relative',
                isActive
                  ? 'role-accent-bg-soft role-accent-text'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-500 text-white font-mono text-2xs font-bold">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Pesan Dilaporkan */}
      {tab === 'flagged' && (
        <div className="space-y-3">
          {loadingFlagged ? (
            <p className="text-center font-body text-text-muted py-8">Memuat...</p>
          ) : flagged.length === 0 ? (
            <Card padding="lg" className="text-center">
              <Flag className="w-12 h-12 text-success mx-auto mb-3" />
              <p className="font-display font-semibold">Tidak ada laporan</p>
              <p className="font-body text-sm text-text-muted mt-1">
                Semua percakapan bersih dari laporan.
              </p>
            </Card>
          ) : (
            flagged.map((msg) => (
              <Card key={msg.id} padding="md" className="border-amber-500/30 bg-amber-500/5">
                <div className="flex items-start gap-3">
                  <Avatar name={msg.sender_name} src={msg.sender_photo ?? undefined} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <p className="font-display font-semibold text-sm">{msg.sender_name}</p>
                      <span className="font-mono text-2xs text-text-muted">
                        {formatDateTime(msg.created_at)}
                      </span>
                    </div>
                    <p className="font-body text-sm text-text-secondary bg-surface-base/60 rounded-lg px-3 py-2 border border-surface-border">
                      {msg.body}
                    </p>
                    {msg.is_flagged && (
                      <p className="font-mono text-2xs text-amber-400 mt-1 flex items-center gap-1">
                        <Flag className="w-3 h-3" /> Dilaporkan
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setMuteForm({ userId: msg.sender_id, userName: msg.sender_name, reason: '', hours: '24' });
                        setMuteOpen(true);
                      }}
                      title="Mute pengirim"
                    >
                      <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        if (confirm('Hapus pesan ini?')) deleteMutation.mutate(msg.id);
                      }}
                      title="Hapus pesan"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-danger" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Semua Percakapan */}
      {tab === 'monitor' && (
        <div className="space-y-2">
          {loadingMonitor ? (
            <p className="text-center font-body text-text-muted py-8">Memuat...</p>
          ) : monitor.length === 0 ? (
            <Card padding="lg" className="text-center">
              <MessageCircle className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="font-display font-semibold">Belum ada percakapan</p>
            </Card>
          ) : (
            monitor.map((room) => (
              <Card key={room.room_id} padding="md">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-body font-semibold text-sm">
                        {room.participant_a?.name ?? '—'}
                      </span>
                      <span className="font-mono text-2xs text-text-muted">↔</span>
                      <span className="font-body font-semibold text-sm">
                        {room.participant_b?.name ?? '—'}
                      </span>
                    </div>
                    {room.last_message && (
                      <p className="font-body text-xs text-text-secondary mt-1 truncate">
                        {room.last_message}
                      </p>
                    )}
                    {room.last_message_at && (
                      <p className="font-mono text-2xs text-text-muted mt-0.5">
                        {formatDateTime(room.last_message_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <span className="font-mono text-2xs text-text-muted px-2 py-1 rounded-full bg-surface-base border border-surface-border">
                      #{room.room_id}
                    </span>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* User Di-mute */}
      {tab === 'muted' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              leftIcon={<VolumeX className="w-4 h-4" />}
              onClick={() => {
                setMuteForm({ userId: 0, userName: '', reason: '', hours: '24' });
                setMuteOpen(true);
              }}
            >
              Mute User Baru
            </Button>
          </div>
          {muted.length === 0 ? (
            <Card padding="lg" className="text-center">
              <Volume2 className="w-12 h-12 text-success mx-auto mb-3" />
              <p className="font-display font-semibold">Tidak ada user yang di-mute</p>
            </Card>
          ) : (
            muted.map((m) => (
              <Card key={m.user_id} padding="md" className="border-amber-500/30">
                <div className="flex items-center gap-3">
                  <VolumeX className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-sm">{m.user_name}</p>
                    {m.reason && (
                      <p className="font-body text-xs text-text-secondary mt-0.5">
                        Alasan: {m.reason}
                      </p>
                    )}
                    <p className="font-mono text-2xs text-text-muted mt-0.5">
                      Sejak {formatDate(m.muted_at)}
                      {m.expires_at ? ` · Berakhir ${formatDate(m.expires_at)}` : ' · Permanen'}
                    </p>
                  </div>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => unmuteMutation.mutate(m.user_id)}
                    isLoading={unmuteMutation.isPending}
                    leftIcon={<Volume2 className="w-3.5 h-3.5" />}
                  >
                    Unmute
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Modal Mute */}      <Modal
        open={muteOpen}
        onClose={() => setMuteOpen(false)}
        title="Mute User dari Chat"
        description="User yang di-mute tidak bisa kirim pesan baru tapi masih bisa membaca."
      >
        <div className="space-y-4">
          {muteForm.userId === 0 && (
            <Input
              label="User ID"
              type="number"
              placeholder="Masukkan ID user"
              value={muteForm.userId || ''}
              onChange={(e) => setMuteForm({ ...muteForm, userId: Number(e.target.value) })}
            />
          )}
          {muteForm.userName && (
            <div className="p-3 rounded-lg bg-surface-base border border-surface-border">
              <p className="font-body text-sm font-semibold">{muteForm.userName}</p>
            </div>
          )}
          <Input
            label="Alasan (opsional)"
            placeholder="Contoh: kata kasar berulang"
            value={muteForm.reason}
            onChange={(e) => setMuteForm({ ...muteForm, reason: e.target.value })}
          />
          <Input
            label="Durasi (jam, kosong = permanen)"
            type="number"
            placeholder="Contoh: 24 (1 hari), 168 (1 minggu)"
            value={muteForm.hours}
            onChange={(e) => setMuteForm({ ...muteForm, hours: e.target.value })}
            hint="Kosongkan untuk mute permanen"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMuteOpen(false)}>Batal</Button>
            <Button
              isLoading={muteMutation.isPending}
              disabled={muteForm.userId === 0}
              onClick={() => muteMutation.mutate()}
              leftIcon={<VolumeX className="w-4 h-4" />}
            >
              Mute
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Flag,
  MessageCircle,
  Plus,
  Search,
  Send,
  Shield,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import {
  fetchArchivedRooms,
  fetchChatRooms,
  fetchContacts,
  fetchRoomMessages,
  archiveRoom,
  unarchiveRoom,
  deleteRoom,
  flagMessage,
  sendMessage,
  type ChatContact,
  type ChatMessage,
  type ChatRoom,
} from '@/lib/chatApi';
import { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn, formatTime } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Kepala Sekolah',
  admin: 'Wali Kelas',
  hr: 'Guru BK',
  employee: 'Siswa',
};

const ROLE_COLOR: Record<string, string> = {
  super_admin: 'text-violet-400',
  admin: 'text-cyan-400',
  hr: 'text-rose-400',
  employee: 'text-text-secondary',
};

export default function ChatPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const searchParams = useSearchParams();
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [activeOtherUser, setActiveOtherUser] = useState<{ id: number; name: string; role: string } | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [flagTarget, setFlagTarget] = useState<ChatMessage | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: rooms = [], isLoading: loadingRooms } = useQuery({
    queryKey: ['chat-rooms'],
    queryFn: fetchChatRooms,
    refetchInterval: 3_000,   // lebih agresif saat halaman chat terbuka
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ['chat-messages', activeRoomId],
    queryFn: () => fetchRoomMessages(activeRoomId!),
    enabled: !!activeRoomId,
    refetchInterval: 2_000,   // poll pesan tiap 2 detik saat room aktif
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['chat-contacts'],
    queryFn: fetchContacts,
    staleTime: 5 * 60_000,
  });

  const { data: archivedRooms = [] } = useQuery({
    queryKey: ['chat-archived'],
    queryFn: fetchArchivedRooms,
    staleTime: 30_000,
  });

  const archiveMutation = useMutation({
    mutationFn: (roomId: number) => archiveRoom(roomId),
    onSuccess: () => {
      toast.success('Obrolan disembunyikan');
      setActiveRoomId(null);
      setActiveOtherUser(null);
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['chat-archived'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const unarchiveMutation = useMutation({
    mutationFn: (roomId: number) => unarchiveRoom(roomId),
    onSuccess: () => {
      toast.success('Obrolan ditampilkan kembali');
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['chat-archived'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Hapus permanen — hanya untuk kepala sekolah (super_admin).
  const deleteRoomMutation = useMutation({
    mutationFn: (roomId: number) => deleteRoom(roomId),
    onSuccess: (res) => {
      toast.success(`Obrolan dihapus permanen (${res?.messages_deleted ?? 0} pesan)`);
      setActiveRoomId(null);
      setActiveOtherUser(null);
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['chat-archived'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!activeOtherUser || !messageInput.trim()) return;
      return sendMessage(activeOtherUser.id, messageInput.trim());
    },
    onSuccess: (res) => {
      if (!res) return;
      if (!res.success) {
        toast.error(res.message ?? 'Pesan tidak bisa dikirim');
        return;
      }
      setMessageInput('');
      queryClient.invalidateQueries({ queryKey: ['chat-messages', activeRoomId] });
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
      // Set room ID dari response kalau belum ada
      if (!activeRoomId && res.data?.room_id) {
        setActiveRoomId(res.data.room_id);
      }
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const flagMutation = useMutation({
    mutationFn: () => flagMessage(flagTarget!.id, flagReason),
    onSuccess: () => {
      toast.success('Pesan dilaporkan ke moderator');
      setFlagTarget(null);
      setFlagReason('');
      queryClient.invalidateQueries({ queryKey: ['chat-messages', activeRoomId] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Auto-scroll ke bawah saat pesan baru
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Auto-buka room dengan unread terbanyak saat pertama kali buka halaman
  useEffect(() => {
    if (rooms.length === 0) return;

    // Prioritas: query param ?room=ID atau ?with=user_id (dari notifikasi).
    // Jalan tiap kali URL berubah supaya klik notifikasi saat halaman sudah
    // terbuka tetap bisa pindah ke room target.
    const roomFromUrl = searchParams.get('room');
    if (roomFromUrl) {
      const r = rooms.find((x) => x.id === Number(roomFromUrl));
      if (r && r.id !== activeRoomId) {
        setActiveRoomId(r.id);
        setActiveOtherUser({
          id: r.other_user_id,
          name: r.other_user_name,
          role: r.other_user_role,
        });
      }
      return;
    }
    const withUser = searchParams.get('with');
    if (withUser) {
      const r = rooms.find((x) => x.other_user_id === Number(withUser));
      if (r && r.id !== activeRoomId) {
        setActiveRoomId(r.id);
        setActiveOtherUser({
          id: r.other_user_id,
          name: r.other_user_name,
          role: r.other_user_role,
        });
      }
      return;
    }

    if (activeRoomId) return;
    const roomWithUnread = rooms.find((r) => r.unread_count > 0);
    if (roomWithUnread) {
      setActiveRoomId(roomWithUnread.id);
      setActiveOtherUser({
        id: roomWithUnread.other_user_id,
        name: roomWithUnread.other_user_name,
        role: roomWithUnread.other_user_role,
      });
    }
  }, [rooms, activeRoomId, searchParams]);

  const openRoom = (room: ChatRoom) => {
    setActiveRoomId(room.id);
    setActiveOtherUser({
      id: room.other_user_id,
      name: room.other_user_name,
      role: room.other_user_role,
    });
    setNewChatOpen(false);
  };

  const startNewChat = (contact: ChatContact) => {
    setActiveRoomId(null);
    setActiveOtherUser({ id: contact.id, name: contact.full_name, role: contact.role });
    setNewChatOpen(false);
    setMessageInput('');
    // Cek apakah sudah ada room dengan kontak ini
    const existing = rooms.find((r) => r.other_user_id === contact.id);
    if (existing) {
      setActiveRoomId(existing.id);
    }
  };

  const filteredContacts = contacts.filter((c) =>
    c.full_name.toLowerCase().includes(contactSearch.toLowerCase())
  );

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <MessageCircle className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Pesan
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Chat</h1>
        <p className="font-body text-sm text-text-muted mt-1">
          Komunikasi akademik yang aman & terawasi.
          {currentUser?.role === 'employee' && (
            <span className="ml-1 text-amber-400">
              Kamu hanya bisa chat dengan guru.
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Sidebar: daftar room */}
        <Card padding="none" className="flex flex-col overflow-hidden">
          <div className="p-3 border-b border-surface-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowArchived(false)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-display font-semibold transition-all',
                  !showArchived ? 'role-accent-bg-soft role-accent-text' : 'text-text-muted hover:text-text-secondary'
                )}
              >
                Aktif
              </button>
              <button
                type="button"
                onClick={() => setShowArchived(true)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-display font-semibold transition-all',
                  showArchived ? 'role-accent-bg-soft role-accent-text' : 'text-text-muted hover:text-text-secondary'
                )}
              >
                Arsip {archivedRooms.length > 0 && `(${archivedRooms.length})`}
              </button>
            </div>
            {!showArchived && (
              <Button
                size="xs"
                variant="outline"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setNewChatOpen(true)}
              >
                Baru
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingRooms ? (
              <p className="text-center font-body text-text-muted py-8 text-sm">Memuat...</p>
            ) : (showArchived ? archivedRooms : rooms).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 px-4 text-center">
                {showArchived ? (
                  <>
                    <Archive className="w-10 h-10 text-text-muted" />
                    <p className="font-body text-sm text-text-muted">Tidak ada obrolan di arsip.</p>
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-10 h-10 text-text-muted" />
                    <p className="font-body text-sm text-text-muted">
                      Belum ada percakapan. Klik "Baru" untuk mulai chat.
                    </p>
                  </>
                )}
              </div>
            ) : (
              (showArchived ? archivedRooms : rooms).map((room) => (
                <div key={room.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => {
                      if (showArchived) {
                        unarchiveMutation.mutate(room.id);
                        setShowArchived(false);
                      } else {
                        openRoom(room);
                      }
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-3 border-b border-surface-border/50 hover:bg-surface-raised transition-colors text-left',
                      activeRoomId === room.id && !showArchived && 'bg-surface-raised border-l-2 border-l-primary-500'
                    )}
                  >
                    <div className="relative shrink-0">
                      <Avatar
                        name={room.other_user_name}
                        src={room.other_user_photo ?? undefined}
                        size="sm"
                      />
                      {room.unread_count > 0 && !showArchived && (
                        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-500 text-white font-mono text-[9px] font-bold">
                          {room.unread_count > 9 ? '9+' : room.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1">
                        <p className="font-body font-semibold text-sm truncate">
                          {room.other_user_name}
                        </p>
                        {room.last_message_at && !showArchived && (
                          <span className="font-mono text-2xs text-text-muted shrink-0">
                            {formatTime(room.last_message_at)}
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-2xs text-text-muted truncate">
                        {showArchived ? (
                          <span className="text-amber-400 flex items-center gap-1">
                            <ArchiveRestore className="w-3 h-3" /> Klik untuk tampilkan kembali
                          </span>
                        ) : (
                          room.last_message ?? 'Belum ada pesan'
                        )}
                      </p>
                    </div>
                  </button>
                  {/* Tombol archive — muncul saat hover, hanya di tab aktif */}
                  {!showArchived && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Sembunyikan obrolan ini dari daftar?')) {
                          archiveMutation.mutate(room.id);
                        }
                      }}
                      className={cn(
                        'absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md text-text-muted hover:text-amber-400 hover:bg-amber-500/10',
                        currentUser?.role === 'super_admin' ? 'right-9' : 'right-2'
                      )}
                      title="Sembunyikan obrolan"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {/* Tombol hapus permanen — hanya kepala sekolah */}
                  {currentUser?.role === 'super_admin' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const otherName = room.other_user_name;
                        if (
                          confirm(
                            `Hapus PERMANEN seluruh obrolan dengan ${otherName}?\n\n` +
                              'Tindakan ini menghapus semua pesan dari database dan tidak bisa dibatalkan.'
                          )
                        ) {
                          if (confirm('Konfirmasi terakhir: pesan akan hilang selamanya.')) {
                            deleteRoomMutation.mutate(room.id);
                          }
                        }
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md text-text-muted hover:text-rose-400 hover:bg-rose-500/10"
                      title="Hapus permanen (kepala sekolah)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Main: chat room */}
        <Card padding="none" className="lg:col-span-2 flex flex-col overflow-hidden">
          {!activeOtherUser ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
              <MessageCircle className="w-16 h-16 text-text-muted" />
              <p className="font-display font-semibold text-text-secondary">
                Pilih percakapan atau mulai yang baru
              </p>
              <Button
                variant="outline"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setNewChatOpen(true)}
              >
                Mulai Chat Baru
              </Button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface-muted/40">
                <Avatar name={activeOtherUser.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm">{activeOtherUser.name}</p>
                  <p className={cn('font-mono text-2xs', ROLE_COLOR[activeOtherUser.role] ?? 'text-text-muted')}>
                    {ROLE_LABEL[activeOtherUser.role] ?? activeOtherUser.role}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Sembunyikan obrolan ini dari daftar? Pesan tidak dihapus.')) {
                        archiveMutation.mutate(activeRoomId!);
                      }
                    }}
                    className="p-1.5 rounded-md text-text-muted hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    title="Sembunyikan obrolan"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                  {currentUser?.role === 'super_admin' && activeRoomId && (
                    <button
                      type="button"
                      onClick={() => {
                        const otherName = activeOtherUser?.name ?? 'pengguna ini';
                        if (
                          confirm(
                            `Hapus PERMANEN seluruh obrolan dengan ${otherName}?\n\n` +
                              'Tindakan ini menghapus semua pesan dari database dan TIDAK BISA dibatalkan.\n\n' +
                              'Lanjut?'
                          )
                        ) {
                          if (confirm('Yakin? Konfirmasi terakhir — pesan akan hilang selamanya.')) {
                            deleteRoomMutation.mutate(activeRoomId);
                          }
                        }
                      }}
                      disabled={deleteRoomMutation.isPending}
                      className="p-1.5 rounded-md text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                      title="Hapus permanen (kepala sekolah)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <Shield className="w-4 h-4 text-text-muted" />
                </div>
              </div>

              {/* Pesan */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                  <p className="text-center font-body text-text-muted py-8 text-sm">Memuat pesan...</p>
                ) : sortedMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                    <MessageCircle className="w-10 h-10 text-text-muted" />
                    <p className="font-body text-sm text-text-muted">
                      Belum ada pesan. Mulai percakapan!
                    </p>
                    <p className="font-mono text-2xs text-text-muted max-w-xs">
                      Semua pesan diawasi oleh admin sekolah untuk keamanan.
                    </p>
                  </div>
                ) : (
                  sortedMessages.map((msg) => {
                    const isMe = msg.sender_id === currentUser?.id;
                    return (
                      <div
                        key={msg.id}
                        className={cn('flex gap-2', isMe ? 'flex-row-reverse' : 'flex-row')}
                      >
                        {!isMe && (
                          <Avatar name={msg.sender_name} src={msg.sender_photo ?? undefined} size="xs" />
                        )}
                        <div className={cn('max-w-[70%] group', isMe ? 'items-end' : 'items-start')}>
                          <div
                            className={cn(
                              'rounded-2xl px-3 py-2 text-sm relative',
                              isMe
                                ? 'bg-primary-500/20 text-text-primary rounded-tr-sm'
                                : 'bg-surface-raised text-text-primary rounded-tl-sm',
                              msg.is_deleted && 'opacity-50 italic',
                              msg.is_flagged && 'border border-amber-500/40'
                            )}
                          >
                            {msg.is_flagged && (
                              <span className="inline-flex items-center gap-1 text-amber-400 font-mono text-2xs mb-1">
                                <Flag className="w-3 h-3" /> Ditandai untuk review
                              </span>
                            )}
                            <p className="font-body leading-relaxed whitespace-pre-wrap break-words">
                              {msg.body}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 px-1">
                            <span className="font-mono text-2xs text-text-muted">
                              {formatTime(msg.created_at)}
                            </span>
                            {!msg.is_deleted && !isMe && (
                              <button
                                type="button"
                                onClick={() => setFlagTarget(msg)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-text-muted hover:text-amber-400"
                                title="Laporkan pesan"
                              >
                                <Flag className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-surface-border bg-surface-muted/20">
                <div className="flex items-end gap-2">
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (messageInput.trim()) sendMutation.mutate();
                      }
                    }}
                    placeholder="Ketik pesan... (Enter untuk kirim, Shift+Enter untuk baris baru)"
                    rows={2}
                    maxLength={1000}
                    className="flex-1 font-body text-sm text-text-primary bg-surface-raised border border-surface-border rounded-xl px-3 py-2 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 resize-none"
                  />
                  <Button
                    size="icon"
                    isLoading={sendMutation.isPending}
                    disabled={!messageInput.trim()}
                    onClick={() => sendMutation.mutate()}
                    className="shrink-0 h-10 w-10"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-1.5 px-1">
                  <p className="font-mono text-2xs text-text-muted flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Chat diawasi admin sekolah
                  </p>
                  <span className={cn('font-mono text-2xs', messageInput.length > 900 ? 'text-amber-400' : 'text-text-muted')}>
                    {messageInput.length}/1000
                  </span>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Modal: Mulai chat baru */}
      <Modal open={newChatOpen} onClose={() => setNewChatOpen(false)} title="Mulai Chat Baru" size="md">
        <div className="space-y-3">
          <Input
            placeholder="Cari nama..."
            leftIcon={<Search className="w-4 h-4" />}
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
          />
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {filteredContacts.length === 0 ? (
              <p className="text-center font-body text-text-muted py-6 text-sm">
                {currentUser?.role === 'employee'
                  ? 'Tidak ada guru yang tersedia.'
                  : 'Tidak ada kontak ditemukan.'}
              </p>
            ) : (
              filteredContacts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => startNewChat(c)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-surface-raised transition-colors text-left"
                >
                  <Avatar name={c.full_name} src={c.photo_url ?? undefined} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-body font-medium text-sm">{c.full_name}</p>
                    <p className={cn('font-mono text-2xs', ROLE_COLOR[c.role] ?? 'text-text-muted')}>
                      {ROLE_LABEL[c.role] ?? c.role}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Modal: Flag pesan */}
      <Modal
        open={!!flagTarget}
        onClose={() => { setFlagTarget(null); setFlagReason(''); }}
        title="Laporkan Pesan"
        description="Pesan ini akan ditandai untuk ditinjau oleh moderator."
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-surface-base border border-surface-border">
            <p className="font-body text-sm text-text-secondary italic">
              "{flagTarget?.body}"
            </p>
          </div>
          <Input
            label="Alasan laporan"
            placeholder="Contoh: mengandung kata kasar, ancaman, dll"
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setFlagTarget(null); setFlagReason(''); }}>
              Batal
            </Button>
            <Button
              isLoading={flagMutation.isPending}
              disabled={flagReason.trim().length < 2}
              onClick={() => flagMutation.mutate()}
              leftIcon={<Flag className="w-4 h-4" />}
            >
              Laporkan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

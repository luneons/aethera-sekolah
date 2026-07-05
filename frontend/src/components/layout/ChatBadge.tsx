'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchChatRooms } from '@/lib/chatApi';
import { cn } from '@/lib/utils';

/**
 * Badge notifikasi chat — polling di background tiap 10 detik.
 * Dipasang di sidebar menu "Chat" supaya user tahu ada pesan baru
 * tanpa harus buka halaman chat dulu.
 */
export function ChatBadge({ className }: { className?: string }) {
  const { data: rooms = [] } = useQuery({
    queryKey: ['chat-rooms'],
    queryFn: fetchChatRooms,
    refetchInterval: 10_000,   // poll tiap 10 detik meski halaman chat tidak terbuka
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const totalUnread = rooms.reduce((sum, r) => sum + r.unread_count, 0);

  if (totalUnread === 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full',
        'bg-rose-500 text-white font-mono text-2xs font-bold',
        className
      )}
    >
      {totalUnread > 9 ? '9+' : totalUnread}
    </span>
  );
}

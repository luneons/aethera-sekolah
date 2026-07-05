'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Mail,
  Send,
  XCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  previewDigests,
  sendDigestNow,
  type DigestPreview,
} from '@/lib/disciplineApi';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<string, { label: string; tone: string }> = {
  super_admin: { label: 'Kepsek', tone: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  admin: { label: 'Wali Kelas', tone: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  hr: { label: 'Guru BK', tone: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

/**
 * Digest mingguan — preview & manual send.
 * Sebenarnya scheduler kirim otomatis tiap Senin 06:00, tapi
 * kepsek bisa preview konten kapan saja atau kirim ulang on-demand.
 */
export default function DigestPage() {
  const queryClient = useQueryClient();

  const { data: previews = [], isLoading } = useQuery({
    queryKey: ['digest-preview'],
    queryFn: previewDigests,
  });

  const sendMutation = useMutation({
    mutationFn: sendDigestNow,
    onSuccess: (res) => {
      const sent = res.data?.filter((r) => r.sent).length ?? 0;
      const total = res.data?.length ?? 0;
      if (sent === total && total > 0) {
        toast.success('Digest terkirim ke semua penerima', {
          description: `${sent}/${total} berhasil`,
        });
      } else if (sent > 0) {
        toast.warning(`${sent}/${total} digest terkirim`, {
          description: 'Beberapa gagal. Cek WA gateway atau nomor HP penerima.',
        });
      } else {
        toast.error('Tidak ada digest yang berhasil terkirim', {
          description: res.data?.[0]?.error ?? 'Pastikan WA gateway aktif.',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['digest-preview'] });
    },
    onError: (err) =>
      toast.error('Gagal mengirim', { description: getErrorMessage(err) }),
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Communications
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">
          Digest Mingguan
        </h1>
        <p className="font-body text-text-muted mt-1">
          Ringkasan otomatis dikirim tiap Senin 06:00 ke staff. Preview konten di sini, atau kirim ulang manual.
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          isLoading={sendMutation.isPending}
          onClick={() => sendMutation.mutate()}
          leftIcon={<Send className="w-4 h-4" />}
          disabled={previews.length === 0}
        >
          Kirim Sekarang ke {previews.length} Penerima
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center font-body text-text-muted py-12">
          Menyiapkan preview...
        </p>
      ) : previews.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Mail className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="font-display font-semibold">Belum ada digest yang bisa dikirim</p>
          <p className="font-body text-sm text-text-muted mt-1">
            Pastikan ada staff aktif (kepsek/wali kelas/BK) dan WA gateway sudah dinyalakan.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {previews.map((p, idx) => (
            <DigestCard key={idx} digest={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function DigestCard({ digest }: { digest: DigestPreview }) {
  const meta = ROLE_LABEL[digest.role] ?? { label: digest.role, tone: 'border-surface-border' };
  return (
    <Card padding="lg">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                'font-mono text-2xs uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border',
                meta.tone
              )}
            >
              {meta.label}
            </span>
            <span className="font-display font-semibold text-text-primary truncate">
              {digest.recipient_name}
            </span>
          </div>
          {digest.recipient_phone ? (
            <p className="font-mono text-2xs text-text-muted">
              <CheckCircle2 className="inline w-3 h-3 mr-1 text-success" />
              {digest.recipient_phone}
            </p>
          ) : (
            <p className="font-mono text-2xs text-rose-400">
              <XCircle className="inline w-3 h-3 mr-1" />
              Tidak ada nomor HP — pesan tidak akan terkirim
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-surface-border bg-surface-base/40 p-3">
        <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
          {digest.title}
        </p>
        <p className="font-body text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
          {digest.body}
        </p>
      </div>
    </Card>
  );
}

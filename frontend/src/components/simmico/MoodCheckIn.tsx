'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Heart } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { fetchMyMoodToday, postMood } from '@/lib/disciplineApi';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const MOODS = [
  { value: 5, emoji: '😄', label: 'Senang Sekali' },
  { value: 4, emoji: '🙂', label: 'Baik' },
  { value: 3, emoji: '😐', label: 'Biasa' },
  { value: 2, emoji: '😟', label: 'Kurang Baik' },
  { value: 1, emoji: '😢', label: 'Sedih' },
] as const;

/**
 * Mood check-in 1-tap. Privasi siswa terjaga — guru BK hanya
 * lihat agregat per kelas, bukan emoji individual.
 */
export function MoodCheckIn() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);

  const { data: existing } = useQuery({
    queryKey: ['my-mood-today'],
    queryFn: fetchMyMoodToday,
  });

  useEffect(() => {
    if (existing?.mood) {
      setSelected(existing.mood);
    }
  }, [existing?.mood]);

  const mutation = useMutation({
    mutationFn: (mood: number) => postMood(mood),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-mood-today'] });
      toast.success('Mood tercatat', {
        description: 'Privasi kamu aman — guru BK hanya lihat ringkasan kelas.',
      });
    },
    onError: (err) =>
      toast.error('Gagal menyimpan mood', { description: getErrorMessage(err) }),
  });

  const handleSelect = (mood: number) => {
    setSelected(mood);
    mutation.mutate(mood);
  };

  return (
    <Card padding="lg">
      <div className="flex items-center gap-2 mb-2">
        <Heart className="w-4 h-4 text-rose-400" />
        <h3 className="font-display font-semibold text-base">
          Bagaimana perasaanmu hari ini?
        </h3>
      </div>
      <p className="font-body text-sm text-text-muted mb-4">
        Ketuk emoji yang paling cocok. Hanya kamu yang lihat detailnya.
      </p>

      <div className="grid grid-cols-5 gap-2">
        {MOODS.map((m) => {
          const isSelected = selected === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => handleSelect(m.value)}
              disabled={mutation.isPending}
              className={cn(
                'relative rounded-xl border p-3 transition-all text-center group',
                isSelected
                  ? 'border-primary-500 bg-primary-500/15 shadow-glow-sm scale-105'
                  : 'border-surface-border bg-surface-base/40 hover:border-primary-500/40 hover:scale-105',
                mutation.isPending && 'opacity-60'
              )}
            >
              <span
                className={cn(
                  'block text-3xl sm:text-4xl transition-transform',
                  !isSelected && 'group-hover:scale-110'
                )}
              >
                {m.emoji}
              </span>
              <span className="block font-mono text-2xs uppercase tracking-widest text-text-muted mt-1 leading-tight">
                {m.label}
              </span>
            </button>
          );
        })}
      </div>

      {existing?.mood && (
        <p className="font-mono text-2xs text-text-muted text-center mt-3">
          ✓ Tercatat hari ini — kamu bisa update kapan saja
        </p>
      )}
    </Card>
  );
}

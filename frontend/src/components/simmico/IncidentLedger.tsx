'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { IncidentRecord } from '@/lib/disciplineApi';
import { cn, formatDate } from '@/lib/utils';

interface IncidentLedgerProps {
  incidents: IncidentRecord[];
}

type Tab = 'all' | 'penalty' | 'adjustment';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'penalty', label: 'Pelanggaran' },
  { key: 'adjustment', label: 'Penyesuaian' },
];

/**
 * "Double-entry" ledger untuk catatan disiplin siswa.
 * - Penalti (merah, kolom kiri) — mengurangi poin sikap, menambah jam.
 * - Adjustment (hijau, kolom kanan) — apresiasi atau pelunasan jam.
 */
export function IncidentLedger({ incidents }: IncidentLedgerProps) {
  const [tab, setTab] = useState<Tab>('all');

  const penalties = incidents.filter((i) => i.kind === 'penalty');
  const adjustments = incidents.filter((i) => i.kind === 'adjustment');

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg bg-surface-base border border-surface-border p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-1.5 text-sm font-display font-semibold rounded-md transition-all',
              tab === t.key
                ? 'bg-primary-500/15 text-primary-300 shadow-glow-sm'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(tab === 'all' || tab === 'penalty') && (
          <LedgerColumn
            title="Pelanggaran / Penalti"
            tone="danger"
            icon={<Minus className="w-4 h-4" />}
            items={penalties}
            empty="Tidak ada catatan pelanggaran."
          />
        )}
        {(tab === 'all' || tab === 'adjustment') && (
          <LedgerColumn
            title="Penyesuaian / Pelunasan"
            tone="success"
            icon={<Plus className="w-4 h-4" />}
            items={adjustments}
            empty="Belum ada penyesuaian / apresiasi."
          />
        )}
      </div>
    </div>
  );
}

function LedgerColumn({
  title,
  tone,
  icon,
  items,
  empty,
}: {
  title: string;
  tone: 'danger' | 'success';
  icon: React.ReactNode;
  items: IncidentRecord[];
  empty: string;
}) {
  const isDanger = tone === 'danger';
  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden',
        isDanger
          ? 'border-danger/30 bg-danger/5'
          : 'border-success/30 bg-success/5'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 border-b',
          isDanger
            ? 'border-danger/20 bg-danger/10 text-danger'
            : 'border-success/20 bg-success/10 text-success'
        )}
      >
        {icon}
        <p className="font-mono text-2xs uppercase tracking-widest font-bold">
          {title}
        </p>
        <span
          className={cn(
            'ml-auto font-mono text-2xs px-2 py-0.5 rounded-full border',
            isDanger
              ? 'border-danger/30 text-danger'
              : 'border-success/30 text-success'
          )}
        >
          {items.length} record
        </span>
      </div>
      <div className="divide-y divide-surface-border max-h-[480px] overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-center py-8 font-body text-text-muted text-sm">
            {empty}
          </p>
        ) : (
          items.map((it) => <LedgerRow key={it.id} record={it} isDanger={isDanger} />)
        )}
      </div>
    </div>
  );
}

function LedgerRow({
  record,
  isDanger,
}: {
  record: IncidentRecord;
  isDanger: boolean;
}) {
  const deltas: { label: string; value: string; pos: boolean }[] = [];

  if (record.attitude_delta !== 0) {
    deltas.push({
      label: 'Sikap',
      value: `${record.attitude_delta > 0 ? '+' : ''}${record.attitude_delta}`,
      pos: record.attitude_delta > 0,
    });
  }
  if (record.kersos_delta !== 0) {
    deltas.push({
      label: 'Kersos',
      value: `${record.kersos_delta > 0 ? '+' : ''}${record.kersos_delta}j`,
      pos: record.kersos_delta < 0, // negatif = lunasi (positif untuk siswa)
    });
  }
  if (record.lembur_delta !== 0) {
    deltas.push({
      label: 'Lembur',
      value: `${record.lembur_delta > 0 ? '+' : ''}${record.lembur_delta}j`,
      pos: record.lembur_delta < 0,
    });
  }
  if (record.appreciation_delta !== 0) {
    deltas.push({
      label: 'Apresiasi',
      value: `+${record.appreciation_delta}`,
      pos: true,
    });
  }

  return (
    <div className="px-4 py-3 hover:bg-surface-overlay/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-body text-sm font-medium text-text-primary truncate">
            {record.ref_name}
          </p>
          <p className="font-mono text-2xs text-text-muted mt-0.5">
            {record.ref_code} · {formatDate(record.date)} · {record.reporter ?? '—'}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 font-mono text-2xs px-2 py-0.5 rounded-full border',
            isDanger
              ? 'border-danger/30 text-danger bg-danger/10'
              : 'border-success/30 text-success bg-success/10'
          )}
        >
          {isDanger ? '−' : '+'}
        </span>
      </div>
      {deltas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {deltas.map((d, i) => (
            <span
              key={i}
              className={cn(
                'font-mono text-2xs px-2 py-0.5 rounded-full border',
                d.pos
                  ? 'border-success/30 text-success bg-success/5'
                  : 'border-danger/30 text-danger bg-danger/5'
              )}
            >
              {d.label} {d.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

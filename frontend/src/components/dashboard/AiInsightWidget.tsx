'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Brain,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { fetchSchoolInsight, type AiInsight } from '@/lib/aiInsightApi';
import { cn } from '@/lib/utils';

const SEVERITY_STYLE: Record<string, string> = {
  info: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
  warning: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  critical: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
};

export function AiInsightWidget() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ai-insight-school'],
    queryFn: () => fetchSchoolInsight(false),
  });
  const refreshMut = useMutation({
    mutationFn: () => fetchSchoolInsight(true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-insight-school'] });
    },
  });

  return (
    <div className="rounded-lg border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-violet-300" />
          <h3 className="font-display font-bold text-sm uppercase tracking-widest text-violet-300">
            AI Insight Sekolah
          </h3>
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
        </div>
        <button
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors disabled:opacity-50"
          title="Refresh insight"
        >
          {refreshMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Menganalisis data sekolah...
        </div>
      )}
      {isError && (
        <p className="text-rose-300 text-sm">
          Gagal memuat insight. Coba refresh.
        </p>
      )}

      {data && <InsightContent insight={data} />}
    </div>
  );
}

function InsightContent({ insight }: { insight: AiInsight }) {
  return (
    <>
      <span
        className={cn(
          'inline-block font-mono text-2xs uppercase px-2 py-0.5 rounded border',
          SEVERITY_STYLE[insight.severity] || SEVERITY_STYLE.info
        )}
      >
        {insight.severity === 'critical' && (
          <AlertTriangle className="w-3 h-3 inline mr-1" />
        )}
        {insight.severity}
      </span>
      <p className="text-sm text-text-primary leading-relaxed">{insight.summary}</p>
      {insight.items.length > 0 && (
        <ul className="space-y-1.5 mt-2">
          {insight.items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-text-secondary"
            >
              <span className="text-violet-400 mt-0.5">▸</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-2xs text-text-muted/60 font-mono">
        {new Date(insight.generated_at).toLocaleString('id-ID')}
        {insight.expires_at && ' • cache 6 jam'}
      </p>
    </>
  );
}

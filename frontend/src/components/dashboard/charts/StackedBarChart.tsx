'use client';

import { useEffect, useRef } from 'react';

interface StackedBarChartProps {
  data: {
    label: string;
    segments: { value: number; color: string; key: string }[];
  }[];
  height?: number;
  legend?: { label: string; color: string }[];
}

export function StackedBarChart({ data, height = 200, legend }: StackedBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const max = Math.max(
    ...data.map((d) => d.segments.reduce((s, seg) => s + seg.value, 0)),
    1
  );

  const dataKey = data
    .map((d) => d.segments.map((s) => s.value).join(','))
    .join('|');

  useEffect(() => {
    if (!containerRef.current) return;

    const id = window.setTimeout(() => {
      if (!containerRef.current) return;
      const bars = containerRef.current.querySelectorAll<HTMLDivElement>('.bar-wrapper');
      bars.forEach((bar, i) => {
        const target = bar.getAttribute('data-target') ?? '0%';
        bar.style.transition = 'none';
        bar.style.height = '0%';
        window.setTimeout(() => {
          bar.style.transition = 'height 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
          bar.style.height = target;
        }, i * 50 + 30);
      });
    }, 100);

    return () => window.clearTimeout(id);
  }, [dataKey]);

  if (data.length === 0) {
    return <p className="font-body text-sm text-text-muted text-center py-8">Belum ada data.</p>;
  }

  return (
    <div ref={containerRef} className="w-full">
      <div className="flex items-end gap-2 px-1" style={{ height }}>
        {data.map((row, i) => {
          const total = row.segments.reduce((s, seg) => s + seg.value, 0);
          const ratio = total / max;
          const targetH = `${Math.max(4, ratio * 100)}%`;

          return (
            <div key={row.label} className="flex-1 flex flex-col items-center justify-end min-w-0">
              <span className="font-mono text-[10px] text-text-muted mb-1">
                {total > 0 ? total : ''}
              </span>
              <div
                className="bar-wrapper w-full max-w-[40px] flex flex-col-reverse rounded-t-md overflow-hidden"
                data-target={targetH}
                style={{ height: 0 }}
              >
                {row.segments.map((seg) => {
                  const segRatio = total > 0 ? seg.value / total : 0;
                  return (
                    <div
                      key={seg.key}
                      style={{
                        height: `${segRatio * 100}%`,
                        minHeight: seg.value > 0 ? 2 : 0,
                        backgroundColor: seg.color,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 px-1 mt-2">
        {data.map((row, i) => (
          <div key={row.label} className="flex-1 text-center font-mono text-[10px] text-text-muted truncate">
            {row.label}
          </div>
        ))}
      </div>

      {legend && (
        <div className="flex flex-wrap items-center gap-3 mt-3 justify-center">
          {legend.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 font-mono text-[10px] text-text-muted">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

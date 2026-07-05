'use client';

import { useEffect, useRef } from 'react';

interface MiniBarChartProps {
  data: { label: string; count: number; color?: string }[];
  maxValue?: number;
  defaultColor?: string;
  showValues?: boolean;
  height?: number;
}

export function MiniBarChart({
  data,
  maxValue,
  defaultColor = '#00d4d4',
  showValues = true,
  height = 120,
}: MiniBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const max = maxValue ?? Math.max(...data.map((d) => d.count), 1);

  const dataKey = data.map((d) => `${d.label}:${d.count}`).join(',');

  useEffect(() => {
    if (!containerRef.current) return;

    // Delay sedikit supaya DOM sudah fully painted
    const id = window.setTimeout(() => {
      if (!containerRef.current) return;
      const bars = containerRef.current.querySelectorAll<HTMLDivElement>('.mini-bar');
      bars.forEach((bar, i) => {
        const target = bar.getAttribute('data-target') ?? '0px';
        const minH = bar.getAttribute('data-min') ?? '0px';
        // Reset dulu
        bar.style.transition = 'none';
        bar.style.height = '0px';
        bar.style.minHeight = '0px';
        // Animate setelah reset
        window.setTimeout(() => {
          bar.style.transition = 'height 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)';
          bar.style.height = target;
          bar.style.minHeight = minH;
        }, i * 40 + 30);
      });
    }, 100);

    return () => window.clearTimeout(id);
  }, [dataKey]);

  if (data.length === 0) {
    return <p className="font-body text-sm text-text-muted text-center py-8">Belum ada data.</p>;
  }

  return (
    <div ref={containerRef} className="w-full">
      <div className="flex items-end gap-1.5 px-1" style={{ height }}>
        {data.map((d, i) => {
          const ratio = max > 0 ? d.count / max : 0;
          const targetH = `${Math.max(4, ratio * height)}px`;
          const color = d.color ?? defaultColor;

          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
              {showValues && (
                <span className="font-mono text-[10px] text-text-muted">
                  {d.count > 0 ? d.count : ''}
                </span>
              )}
              <div
                className="mini-bar w-full rounded-t-md"
                data-target={targetH}
                data-min={d.count > 0 ? '4px' : '0px'}
                style={{
                  height: 0,
                  background: `linear-gradient(180deg, ${color} 0%, ${color}99 100%)`,
                }}
                title={`${d.label}: ${d.count}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 px-1 mt-2">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center font-mono text-[10px] text-text-muted truncate">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

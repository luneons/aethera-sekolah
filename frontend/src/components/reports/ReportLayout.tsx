'use client';

import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
  category?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function ReportLayout({
  title,
  description,
  icon: Icon,
  category,
  actions,
  children,
}: Props) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/reports"
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary-400 mb-2"
          >
            <ArrowLeft className="w-3 h-3" />
            Kembali ke Pusat Laporan
          </Link>
          {category && (
            <div className="flex items-center gap-2 mb-1">
              {Icon && <Icon className="w-4 h-4 role-accent-text" />}
              <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
                {category}
              </span>
            </div>
          )}
          <h1 className="font-display text-2xl sm:text-display-md font-bold">{title}</h1>
          {description && (
            <p className="font-body text-text-muted mt-1">{description}</p>
          )}
        </div>
        {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

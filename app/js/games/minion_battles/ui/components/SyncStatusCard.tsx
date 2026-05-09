import React from 'react';

type SyncStatusTone = 'success' | 'warning';

interface SyncStatusCardProps {
    title: string;
    summary: string;
    tone: SyncStatusTone;
    details?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}

export default function SyncStatusCard({
    title,
    summary,
    tone,
    details = null,
    actions = null,
    className = '',
}: SyncStatusCardProps) {
    const palette =
        tone === 'success'
            ? {
                  border: 'border-emerald-500/55',
                  bg: 'bg-emerald-950/90',
                  title: 'text-emerald-200/95',
                  summary: 'text-emerald-100',
                  detail: 'text-emerald-100/85',
              }
            : {
                  border: 'border-amber-500/55',
                  bg: 'bg-amber-950/95',
                  title: 'text-amber-200/95',
                  summary: 'text-amber-100',
                  detail: 'text-amber-100/90',
              };

    return (
        <div className={`rounded-md border px-2.5 py-2 shadow-lg ${palette.border} ${palette.bg} ${className}`}>
            <div className={`text-[11px] font-semibold uppercase tracking-wide ${palette.title}`}>{title}</div>
            <div className={`mt-0.5 text-[10px] leading-snug ${palette.summary}`}>{summary}</div>
            {details ? <div className={`mt-1 text-[10px] leading-snug ${palette.detail}`}>{details}</div> : null}
            {actions ? <div className="mt-1.5">{actions}</div> : null}
        </div>
    );
}

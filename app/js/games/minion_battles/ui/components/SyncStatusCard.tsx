import React from 'react';

export type SyncStatusTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

interface SyncStatusCardProps {
    title: string;
    summary: string;
    tone: SyncStatusTone;
    details?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
    /** When true, shows a small spinner beside the text block (e.g. resync in progress). */
    busy?: boolean;
}

export default function SyncStatusCard({
    title,
    summary,
    tone,
    details = null,
    actions = null,
    className = '',
    busy = false,
}: SyncStatusCardProps) {
    const palette =
        tone === 'success'
            ? {
                  border: 'border-emerald-500/55',
                  bg: 'bg-emerald-950/90',
                  title: 'text-emerald-200/95',
                  summary: 'text-emerald-100',
                  detail: 'text-emerald-100/85',
                  spinner: 'border-emerald-300/85 border-t-transparent',
              }
            : tone === 'info'
              ? {
                    border: 'border-sky-500/50',
                    bg: 'bg-sky-950/92',
                    title: 'text-sky-200/95',
                    summary: 'text-sky-100',
                    detail: 'text-sky-100/88',
                    spinner: 'border-sky-300/85 border-t-transparent',
                }
              : tone === 'danger'
                ? {
                      border: 'border-red-500/55',
                      bg: 'bg-red-950/92',
                      title: 'text-red-200/95',
                      summary: 'text-red-100',
                      detail: 'text-red-100/88',
                      spinner: 'border-red-300/85 border-t-transparent',
                  }
                : tone === 'neutral'
                  ? {
                        border: 'border-slate-500/45',
                        bg: 'bg-slate-950/90',
                        title: 'text-slate-200/95',
                        summary: 'text-slate-100',
                        detail: 'text-slate-100/85',
                        spinner: 'border-slate-300/80 border-t-transparent',
                    }
                  : {
                        border: 'border-amber-500/55',
                        bg: 'bg-amber-950/95',
                        title: 'text-amber-200/95',
                        summary: 'text-amber-100',
                        detail: 'text-amber-100/90',
                        spinner: 'border-amber-300/85 border-t-transparent',
                    };

    return (
        <div className={`rounded-md border px-2.5 py-2 shadow-lg ${palette.border} ${palette.bg} ${className}`}>
            <div className="flex items-start gap-2">
                {busy ? (
                    <div
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 ${palette.spinner}`}
                        aria-hidden
                    />
                ) : null}
                <div className="min-w-0 flex-1">
                    <div className={`text-[11px] font-semibold uppercase tracking-wide ${palette.title}`}>{title}</div>
                    <div className={`mt-0.5 text-[10px] leading-snug ${palette.summary}`}>{summary}</div>
                    {details ? (
                        <div className={`mt-1 text-[10px] leading-snug ${palette.detail}`}>{details}</div>
                    ) : null}
                    {actions ? <div className="mt-1.5">{actions}</div> : null}
                </div>
            </div>
        </div>
    );
}

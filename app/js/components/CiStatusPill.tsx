/**
 * Admin-only CI status indicator for the global title bar.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { CiStatus } from '../ci/ciStatus';
import { getCiPillTooltip, getCiPillVariant } from '../ci/ciStatus';

const CI_STATUS_POLL_MS = 60_000;

const PILL_COLOR_CLASS: Record<ReturnType<typeof getCiPillVariant>, string> = {
    waiting: 'bg-gray-500',
    pass: 'bg-success',
    fail: 'bg-danger',
};

export default function CiStatusPill() {
    const [status, setStatus] = useState<CiStatus | null>(null);
    const [tooltipOpen, setTooltipOpen] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/ci-status', { credentials: 'include' });
            if (!response.ok) {
                setStatus(null);
                return;
            }
            const payload = (await response.json()) as { success?: boolean; ci?: CiStatus | null };
            setStatus(payload.success ? (payload.ci ?? null) : null);
        } catch {
            setStatus(null);
        }
    }, []);

    useEffect(() => {
        void fetchStatus();
        const id = window.setInterval(() => {
            void fetchStatus();
        }, CI_STATUS_POLL_MS);
        return () => window.clearInterval(id);
    }, [fetchStatus]);

    const variant = getCiPillVariant(status);
    const tooltip = getCiPillTooltip(status);

    return (
        <div
            className="relative pointer-events-auto -translate-x-2 translate-y-2"
            onMouseEnter={() => setTooltipOpen(true)}
            onMouseLeave={() => setTooltipOpen(false)}
        >
            <span
                className={`inline-block h-6 w-6 rounded-full border border-border-custom shadow-sm ${PILL_COLOR_CLASS[variant]}`}
                aria-label={tooltip.replace(/\n/g, ', ')}
            />
            {tooltipOpen ? (
                <div
                    className="absolute right-0 top-[calc(100%+8px)] z-[300] min-w-[24rem] max-w-[36rem] -translate-x-2 translate-y-2 whitespace-pre-line rounded border border-border-custom bg-dark-900 px-6 py-4 text-sm leading-snug text-gray-100 shadow-lg"
                    role="tooltip"
                >
                    {tooltip}
                </div>
            ) : null}
        </div>
    );
}

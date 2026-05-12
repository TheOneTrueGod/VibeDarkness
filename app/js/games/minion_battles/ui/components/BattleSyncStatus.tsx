import React from 'react';

type SyncStatus = 'synced' | 'waiting_for_host' | 'resyncing' | 'failed' | 'synced_pending_ack';

interface BattleSyncStatusProps {
    isHost: boolean;
    isPaused: boolean;
    syncStatus: SyncStatus;
    syncDetails?: string | null;
    fallingBehindHost: boolean;
    ticksBehindHost: number;
    /** Non-host stall waiting on host heartbeat / tick parity (wall clock). */
    hostAnchorWaitElapsedMs?: number;
    onRequestBattleReload?: () => void;
    /** After desync recovery when `syncStatus` is `synced_pending_ack`. */
    onAcknowledgeRecoveryContinue?: () => void;
}

interface BannerSpec {
    id: string;
    text: string;
    className: string;
}

export default function BattleSyncStatus({
    isHost,
    isPaused,
    syncStatus,
    syncDetails = null,
    fallingBehindHost,
    ticksBehindHost,
    hostAnchorWaitElapsedMs = 0,
    onRequestBattleReload,
    onAcknowledgeRecoveryContinue,
}: BattleSyncStatusProps) {
    const banners: BannerSpec[] = [];
    const stallSec =
        typeof hostAnchorWaitElapsedMs === 'number' && hostAnchorWaitElapsedMs >= 1000
            ? Math.floor(hostAnchorWaitElapsedMs / 1000)
            : 0;

    if (!isHost && fallingBehindHost) {
        banners.push({
            id: 'behind-host',
            text: `Catching up to host... (${ticksBehindHost} ticks behind)`,
            className: 'bg-amber-900/85 text-amber-100',
        });
    }

    if (syncStatus === 'resyncing') {
        banners.push({
            id: 'resyncing',
            text: 'Resyncing battle...',
            className: 'bg-blue-900/80 text-blue-100',
        });
    } else if (syncStatus === 'synced_pending_ack') {
        banners.push({
            id: 'synced-pending-ack',
            text: 'Battle resynced — continue when ready',
            className: 'bg-emerald-950/90 text-emerald-100',
        });
    } else if (syncStatus === 'failed') {
        banners.push({
            id: 'failed',
            text: 'Battle sync failed',
            className: 'bg-red-900/85 text-red-100',
        });
    } else if (!isHost && syncStatus !== 'synced' && isPaused) {
        banners.push({
            id: 'waiting',
            text:
                stallSec > 0
                    ? `Waiting for host... (${stallSec}s)`
                    : 'Waiting for host sync...',
            className:
                stallSec >= 20 ? 'border border-red-500/80 bg-red-950/80 text-red-100' : 'bg-dark-900/80 text-gray-200',
        });
    }

    if (syncDetails != null && syncDetails.trim() !== '') {
        banners.push({
            id: 'sync-details',
            text: syncDetails,
            className: 'bg-blue-950/85 text-blue-100',
        });
    }

    if (banners.length === 0) {
        return null;
    }

    return (
        <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[26rem] flex-col gap-2">
            {banners.map((banner) => (
                <div key={banner.id} className={`rounded px-2 py-1 text-xs ${banner.className}`}>
                    {banner.text}
                </div>
            ))}
            {syncStatus === 'synced_pending_ack' && typeof onAcknowledgeRecoveryContinue === 'function' && (
                <div className="pointer-events-auto">
                    <button
                        type="button"
                        onClick={onAcknowledgeRecoveryContinue}
                        className="rounded bg-emerald-800 px-2 py-1 text-xs text-emerald-50 hover:bg-emerald-700"
                    >
                        Continue
                    </button>
                </div>
            )}
            {!isHost && stallSec >= 5 && typeof onRequestBattleReload === 'function' && (
                <div className="pointer-events-auto">
                    <button
                        type="button"
                        onClick={onRequestBattleReload}
                        className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-100 hover:bg-slate-700"
                    >
                        Reload battle sync
                    </button>
                </div>
            )}
        </div>
    );
}

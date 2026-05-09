import React from 'react';

type SyncStatus = 'synced' | 'waiting_for_host' | 'resyncing' | 'failed';

interface BattleSyncStatusProps {
    isHost: boolean;
    isPaused: boolean;
    syncStatus: SyncStatus;
    fallingBehindHost: boolean;
    ticksBehindHost: number;
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
    fallingBehindHost,
    ticksBehindHost,
}: BattleSyncStatusProps) {
    const banners: BannerSpec[] = [];

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
    } else if (syncStatus === 'failed') {
        banners.push({
            id: 'failed',
            text: 'Battle sync failed',
            className: 'bg-red-900/85 text-red-100',
        });
    } else if (!isHost && syncStatus !== 'synced' && isPaused) {
        banners.push({
            id: 'waiting',
            text: 'Waiting for host sync...',
            className: 'bg-dark-900/80 text-gray-200',
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
        </div>
    );
}

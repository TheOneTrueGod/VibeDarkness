import React from 'react';

/**
 * Bottom-centre non-host cue when the host stalls on our last proven-aligned tick — see `BattleNet` `host-anchor-wait`.
 */
export default function BattleHostAnchorBanner(props: {
    phase: 'idle' | 'waiting_ui' | 'forcing_resync';
}) {
    if (props.phase === 'idle') {
        return null;
    }
    if (props.phase === 'forcing_resync') {
        return (
            <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
                <div className="flex items-center gap-2 rounded-full bg-blue-950/90 px-4 py-2 text-xs text-blue-100 shadow-lg">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-transparent" />
                    <span>Resyncing battle...</span>
                </div>
            </div>
        );
    }
    return (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
            <div className="rounded-full bg-dark-900/90 px-4 py-2 text-xs text-gray-200 shadow-lg ring-1 ring-dark-700">
                Waiting for host...
            </div>
        </div>
    );
}

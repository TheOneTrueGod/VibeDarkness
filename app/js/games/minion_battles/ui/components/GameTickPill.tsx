import React, { useEffect, useReducer } from 'react';
import { readGameTicksFromSyncBridge } from './battleSyncDebugPropsFromBridge';

type SyncDebugWindow = {
    __minionBattlesSyncDebug?: Record<string, unknown>;
};

export type ItsPlayaheadTicks = {
    savedLocalTick: number;
    playaheadTick: number;
};

export interface GameTickPillProps {
    /** When ITS playahead is active, supplies mark tick + live engine tick for display. */
    getItsTicks?: () => ItsPlayaheadTicks | null;
}

function formatTick(value: number | null): string {
    return value != null ? String(value) : '—';
}

const TICK_VALUE_COLUMN_CLASS = 'min-w-[4ch] tabular-nums whitespace-nowrap';

/** Compact local vs server tick readout for the battle canvas (debug toggle). */
export default function GameTickPill({ getItsTicks }: GameTickPillProps) {
    const [, forceRerender] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
        const id = window.setInterval(() => forceRerender(), 100);
        return () => window.clearInterval(id);
    }, []);

    const bridge = (window as unknown as SyncDebugWindow).__minionBattlesSyncDebug ?? null;
    const { localTick: bridgeLocalTick, serverTick } = readGameTicksFromSyncBridge(bridge);
    const itsTicks = getItsTicks?.() ?? null;
    const localTick = itsTicks != null ? itsTicks.savedLocalTick : bridgeLocalTick;
    const playaheadTick = itsTicks != null ? itsTicks.playaheadTick : null;

    const rows: Array<{ label: string; value: number | null }> = [
        { label: 'Local:', value: localTick },
        { label: 'Server:', value: serverTick },
        { label: 'Playahead:', value: playaheadTick },
    ];

    return (
        <div
            className="rounded border border-border-custom bg-black/75 px-2.5 py-1.5 font-mono text-[10px] leading-snug text-white shadow-sm"
            aria-label={`Local tick ${formatTick(localTick)}, server tick ${formatTick(serverTick)}, playahead tick ${formatTick(playaheadTick)}`}
        >
            <table className="ml-auto text-right">
                <tbody>
                    {rows.map(({ label, value }) => (
                        <tr key={label}>
                            <td className="pr-2 whitespace-nowrap">{label}</td>
                            <td className={TICK_VALUE_COLUMN_CLASS}>{formatTick(value)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

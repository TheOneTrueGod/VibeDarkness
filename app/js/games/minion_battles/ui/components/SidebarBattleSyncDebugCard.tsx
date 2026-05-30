import React, { useEffect, useReducer } from 'react';
import BattleSyncStatus from './BattleSyncStatus';
import { battleSyncDebugPropsFromBridge } from './battleSyncDebugPropsFromBridge';

type SyncDebugWindow = {
    __minionBattlesSyncDebug?: Record<string, unknown>;
};

/**
 * Live debug-variant sync status card (same model as Debug Console → Heartbeat tab), for the lobby sidebar.
 */
export default function SidebarBattleSyncDebugCard() {
    const [, forceRerender] = useReducer((x: number, _action: unknown) => x + 1, 0);
    useEffect(() => {
        const id = window.setInterval(() => forceRerender(undefined), 100);
        return () => window.clearInterval(id);
    }, []);

    const bridge = (window as unknown as SyncDebugWindow).__minionBattlesSyncDebug ?? null;
    const props = battleSyncDebugPropsFromBridge(bridge);

    return (
        <div className="rounded-md border border-border-custom bg-surface-light px-2 py-2">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Sync (debug)</div>
            <BattleSyncStatus variant="debug" {...props} />
        </div>
    );
}

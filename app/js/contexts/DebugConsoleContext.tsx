import React, { createContext, useContext, useMemo, useState } from 'react';

export interface BattleDebugSnapshot {
    gameTick: number | null;
    gameState: Record<string, unknown> | null;
    synchash: string | null;
}

export interface BattleDebugBridge {
    adminHealUnit(unitId: string): void;
    adminKillUnit(unitId: string): void;
    adminMoveUnit(unitId: string, worldX: number, worldY: number): void;
    setUnitHover(unitId: string | null): void;
    logLocalStateToLobby(): Promise<void>;
    triggerDesync(): void;
    triggerReplayFromStart(): void;
    getSnapshot(): BattleDebugSnapshot;
}

interface DebugConsoleContextValue {
    selectedDebugUnitId: string | null;
    setSelectedDebugUnitId: (id: string | null) => void;
    battleBridge: BattleDebugBridge | null;
    setBattleBridge: (bridge: BattleDebugBridge | null) => void;
    adminMovePendingUnitId: string | null;
    setAdminMovePendingUnitId: (id: string | null) => void;
}

const DebugConsoleContext = createContext<DebugConsoleContextValue>({
    selectedDebugUnitId: null,
    setSelectedDebugUnitId: () => {},
    battleBridge: null,
    setBattleBridge: () => {},
    adminMovePendingUnitId: null,
    setAdminMovePendingUnitId: () => {},
});

export function useDebugConsole(): DebugConsoleContextValue {
    return useContext(DebugConsoleContext);
}

export function DebugConsoleProvider({ children }: { children: React.ReactNode }) {
    const [selectedDebugUnitId, setSelectedDebugUnitId] = useState<string | null>(null);
    const [battleBridge, setBattleBridge] = useState<BattleDebugBridge | null>(null);
    const [adminMovePendingUnitId, setAdminMovePendingUnitId] = useState<string | null>(null);
    const value = useMemo(
        () => ({
            selectedDebugUnitId,
            setSelectedDebugUnitId,
            battleBridge,
            setBattleBridge,
            adminMovePendingUnitId,
            setAdminMovePendingUnitId,
        }),
        [selectedDebugUnitId, battleBridge, adminMovePendingUnitId],
    );
    return <DebugConsoleContext.Provider value={value}>{children}</DebugConsoleContext.Provider>;
}

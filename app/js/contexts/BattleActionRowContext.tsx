/**
 * When Minion Battles runs in the lobby “battle chrome” layout (desktop), the card hand /
 * action row is mounted in a full-viewport-width slot below the [game | chat] row. BattlePhase
 * portals into this host so the hand spans under both side columns.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';

export interface BattleActionRowContextValue {
    actionRowHost: HTMLElement | null;
    setActionRowHost: (el: HTMLElement | null) => void;
}

const BattleActionRowContext = createContext<BattleActionRowContextValue | null>(null);

export function BattleActionRowProvider({ children }: { children: React.ReactNode }): React.ReactElement {
    const [actionRowHost, setActionRowHost] = useState<HTMLElement | null>(null);
    const value = useMemo(
        () => ({
            actionRowHost,
            setActionRowHost,
        }),
        [actionRowHost],
    );
    return <BattleActionRowContext.Provider value={value}>{children}</BattleActionRowContext.Provider>;
}

export function useBattleActionRowHost(): BattleActionRowContextValue | null {
    return useContext(BattleActionRowContext);
}

/** Renders the DOM node Minion Battles’ BattlePhase portals the card hand into. */
export function BattleActionRowSlot({ className }: { className?: string }): React.ReactElement | null {
    const ctx = useContext(BattleActionRowContext);
    if (!ctx) return null;
    return (
        <div
            ref={(el) => {
                ctx.setActionRowHost(el);
            }}
            className={className}
        />
    );
}

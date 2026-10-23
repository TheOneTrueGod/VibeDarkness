import React, { createContext, useContext, useEffect } from 'react';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import type { MinionBattlesApi } from '../../../../api/minionBattlesApi';
import type { PrepLoadoutConfig } from './prepLoadoutConfig';
import { usePrepLoadout } from './usePrepLoadout';

type PrepLoadoutValue = ReturnType<typeof usePrepLoadout> & {
    character: CampaignCharacter;
};

const PrepLoadoutContext = createContext<PrepLoadoutValue | null>(null);

export function PrepLoadoutProvider({
    api,
    playerId,
    character,
    config,
    loadoutsByPlayer,
    onSelectedPrimaryIdsChange,
    onAbilityReadyChange,
    children,
}: {
    api: MinionBattlesApi;
    playerId: string;
    character: CampaignCharacter;
    config: PrepLoadoutConfig;
    loadoutsByPlayer: Record<string, string[]>;
    /** Mirror local primaries for Ready/freeze (avoids lobby sync race). */
    onSelectedPrimaryIdsChange?: (ids: string[]) => void;
    onAbilityReadyChange?: (ready: boolean) => void;
    children: React.ReactNode;
}) {
    const loadout = usePrepLoadout({
        api,
        playerId,
        character,
        config,
        loadoutsByPlayer,
    });
    useEffect(() => {
        onSelectedPrimaryIdsChange?.(loadout.selectedPrimaryIds);
    }, [loadout.selectedPrimaryIds, onSelectedPrimaryIdsChange]);
    useEffect(() => {
        onAbilityReadyChange?.(loadout.abilityReady);
    }, [loadout.abilityReady, onAbilityReadyChange]);
    return (
        <PrepLoadoutContext.Provider value={{ ...loadout, character }}>
            {children}
        </PrepLoadoutContext.Provider>
    );
}

export function usePrepLoadoutContext(): PrepLoadoutValue {
    const ctx = useContext(PrepLoadoutContext);
    if (!ctx) {
        throw new Error('usePrepLoadoutContext must be used within PrepLoadoutProvider');
    }
    return ctx;
}

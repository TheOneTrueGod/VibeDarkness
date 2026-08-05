import React, { createContext, useContext, useEffect } from 'react';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import type { MinionBattlesApi } from '../../../../api/minionBattlesApi';
import { useMissionPrepLoadout } from './useMissionPrepLoadout';

type MissionPrepLoadoutValue = ReturnType<typeof useMissionPrepLoadout> & {
    character: CampaignCharacter;
};

const MissionPrepLoadoutContext = createContext<MissionPrepLoadoutValue | null>(null);

export function MissionPrepLoadoutProvider({
    api,
    playerId,
    character,
    missionPrepLoadoutsByPlayer,
    onSelectedPrimaryIdsChange,
    onAbilityReadyChange,
    children,
}: {
    api: MinionBattlesApi;
    playerId: string;
    character: CampaignCharacter;
    missionPrepLoadoutsByPlayer: Record<string, string[]>;
    onSelectedPrimaryIdsChange?: (ids: string[]) => void;
    onAbilityReadyChange?: (ready: boolean) => void;
    children: React.ReactNode;
}) {
    const loadout = useMissionPrepLoadout({
        api,
        playerId,
        character,
        missionPrepLoadoutsByPlayer,
    });
    useEffect(() => {
        onSelectedPrimaryIdsChange?.(loadout.selectedPrimaryIds);
    }, [loadout.selectedPrimaryIds, onSelectedPrimaryIdsChange]);
    useEffect(() => {
        onAbilityReadyChange?.(loadout.abilityReady);
    }, [loadout.abilityReady, onAbilityReadyChange]);
    return (
        <MissionPrepLoadoutContext.Provider value={{ ...loadout, character }}>
            {children}
        </MissionPrepLoadoutContext.Provider>
    );
}

export function useMissionPrepLoadoutContext(): MissionPrepLoadoutValue {
    const ctx = useContext(MissionPrepLoadoutContext);
    if (!ctx) {
        throw new Error('useMissionPrepLoadoutContext must be used within MissionPrepLoadoutProvider');
    }
    return ctx;
}

import React, { createContext, useContext, useEffect } from 'react';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import type { MinionBattlesApi } from '../../../../api/minionBattlesApi';
import { useQuestPrepLoadout } from './useQuestPrepLoadout';

type QuestPrepLoadoutValue = ReturnType<typeof useQuestPrepLoadout> & {
    character: CampaignCharacter;
};

const QuestPrepLoadoutContext = createContext<QuestPrepLoadoutValue | null>(null);

export function QuestPrepLoadoutProvider({
    api,
    playerId,
    character,
    questPrepLoadoutsByPlayer,
    rememberedAbilityIds,
    onSelectedPrimaryIdsChange,
    children,
}: {
    api: MinionBattlesApi;
    playerId: string;
    character: CampaignCharacter;
    questPrepLoadoutsByPlayer: Record<string, string[]>;
    /** Prior quest loadout for this character when the lobby has none yet. */
    rememberedAbilityIds?: readonly string[];
    /** Mirror local primaries for Ready/freeze (avoids lobby sync race). */
    onSelectedPrimaryIdsChange?: (ids: string[]) => void;
    children: React.ReactNode;
}) {
    const loadout = useQuestPrepLoadout({
        api,
        playerId,
        character,
        questPrepLoadoutsByPlayer,
        rememberedAbilityIds,
    });
    useEffect(() => {
        onSelectedPrimaryIdsChange?.(loadout.selectedPrimaryIds);
    }, [loadout.selectedPrimaryIds, onSelectedPrimaryIdsChange]);
    return (
        <QuestPrepLoadoutContext.Provider value={{ ...loadout, character }}>
            {children}
        </QuestPrepLoadoutContext.Provider>
    );
}

export function useQuestPrepLoadoutContext(): QuestPrepLoadoutValue {
    const ctx = useContext(QuestPrepLoadoutContext);
    if (!ctx) {
        throw new Error('useQuestPrepLoadoutContext must be used within QuestPrepLoadoutProvider');
    }
    return ctx;
}

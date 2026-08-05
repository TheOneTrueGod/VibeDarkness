import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import type { MinionBattlesApi } from '../../../../api/minionBattlesApi';
import {
    addQuestPrepAbility,
    buildAccessibleAbilityIds,
    filterSelectableQuestPrepAbilityIds,
    isQuestPrepSlotsFull,
    removeQuestPrepAbility,
    QUEST_PREP_ABILITY_SLOT_COUNT,
} from '../../../../storylines/questPrepLoadout';

interface UseQuestPrepLoadoutParams {
    api: MinionBattlesApi;
    playerId: string;
    character: CampaignCharacter;
    /** Lobby-synced primary picks by player id. */
    questPrepLoadoutsByPlayer: Record<string, string[]>;
}

/**
 * Local + lobby sync for Quest Prep primary ability slots.
 */
export function useQuestPrepLoadout({
    api,
    playerId,
    character,
    questPrepLoadoutsByPlayer,
}: UseQuestPrepLoadoutParams) {
    const serverPrimaries = questPrepLoadoutsByPlayer[playerId] ?? [];
    const [localPrimaries, setLocalPrimaries] = useState<string[]>(serverPrimaries);
    const syncingRef = useRef(false);
    const lastPushedRef = useRef<string>(JSON.stringify(serverPrimaries));

    // Pull remote updates when not mid-push.
    useEffect(() => {
        if (syncingRef.current) return;
        const key = JSON.stringify(serverPrimaries);
        if (key === lastPushedRef.current) {
            setLocalPrimaries(serverPrimaries);
        } else if (key !== JSON.stringify(localPrimaries)) {
            setLocalPrimaries(serverPrimaries);
            lastPushedRef.current = key;
        }
    }, [serverPrimaries, localPrimaries]);

    const pushLoadout = useCallback(
        async (next: string[]) => {
            const key = JSON.stringify(next);
            lastPushedRef.current = key;
            syncingRef.current = true;
            setLocalPrimaries(next);
            try {
                await api.updateGameState({
                    questPrepLoadoutsByPlayer: {
                        ...questPrepLoadoutsByPlayer,
                        [playerId]: next,
                    },
                });
            } catch (e) {
                console.warn('Failed to sync Quest Prep loadout:', e);
            } finally {
                syncingRef.current = false;
            }
        },
        [api, playerId, questPrepLoadoutsByPlayer],
    );

    const accessibleIds = useMemo(
        () => buildAccessibleAbilityIds(character.equipment, character.researchTrees),
        [character.equipment, character.researchTrees],
    );

    const selectableIds = useMemo(
        () => filterSelectableQuestPrepAbilityIds(accessibleIds),
        [accessibleIds],
    );

    const slotsFull = isQuestPrepSlotsFull(localPrimaries);

    const addAbility = useCallback(
        (abilityId: string) => {
            const next = addQuestPrepAbility(localPrimaries, abilityId);
            if (next.length === localPrimaries.length) return;
            void pushLoadout(next);
        },
        [localPrimaries, pushLoadout],
    );

    const removeAbility = useCallback(
        (abilityId: string) => {
            const next = removeQuestPrepAbility(localPrimaries, abilityId);
            if (next.length === localPrimaries.length) return;
            void pushLoadout(next);
        },
        [localPrimaries, pushLoadout],
    );

    return {
        selectedPrimaryIds: localPrimaries,
        selectableIds,
        accessibleIds,
        slotsFull,
        slotCount: QUEST_PREP_ABILITY_SLOT_COUNT,
        addAbility,
        removeAbility,
    };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import type { MinionBattlesApi } from '../../../../api/minionBattlesApi';
import {
    addQuestPrepAbility,
    buildAccessibleAbilityIds,
    filterSelectableQuestPrepAbilityIds,
    isQuestPrepSlotsFull,
    removeQuestPrepAbility,
    resolveInitialMissionSelection,
    QUEST_PREP_ABILITY_SLOT_COUNT,
} from '../../../../storylines/questPrepLoadout';

interface UseQuestPrepLoadoutParams {
    api: MinionBattlesApi;
    playerId: string;
    character: CampaignCharacter;
    /** Lobby-synced primary picks by player id. */
    questPrepLoadoutsByPlayer: Record<string, string[]>;
    /**
     * Prior quest prep picks by campaign character id (continue / previous run).
     * Used when the lobby has no loadout yet for this player.
     */
    rememberedAbilityIds?: readonly string[];
}

/**
 * Local + lobby sync for Quest Prep primary ability slots.
 * Empty lobby + no remembered picks → first {@link QUEST_PREP_ABILITY_SLOT_COUNT} selectable.
 */
export function useQuestPrepLoadout({
    api,
    playerId,
    character,
    questPrepLoadoutsByPlayer,
    rememberedAbilityIds = [],
}: UseQuestPrepLoadoutParams) {
    const accessibleIds = useMemo(
        () => buildAccessibleAbilityIds(character.equipment, character.researchTrees),
        [character.equipment, character.researchTrees],
    );

    const selectableIds = useMemo(
        () => filterSelectableQuestPrepAbilityIds(accessibleIds),
        [accessibleIds],
    );

    const defaultSelection = useMemo(
        () => resolveInitialMissionSelection(selectableIds, rememberedAbilityIds),
        [selectableIds, rememberedAbilityIds],
    );

    const serverPrimaries = questPrepLoadoutsByPlayer[playerId];
    const [localPrimaries, setLocalPrimaries] = useState<string[]>(
        () => (serverPrimaries && serverPrimaries.length > 0 ? serverPrimaries : defaultSelection),
    );
    const syncingRef = useRef(false);
    const lastPushedRef = useRef<string>(
        JSON.stringify(serverPrimaries && serverPrimaries.length > 0 ? serverPrimaries : defaultSelection),
    );
    const seededRef = useRef(false);

    const pushLoadout = useCallback(
        async (next: string[]) => {
            const key = JSON.stringify(next);
            if (key === lastPushedRef.current && key === JSON.stringify(localPrimaries)) {
                return;
            }
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
        [api, playerId, questPrepLoadoutsByPlayer, localPrimaries],
    );

    // Seed lobby once when empty (first 7 / remembered picks).
    useEffect(() => {
        if (seededRef.current) return;
        seededRef.current = true;
        if (serverPrimaries && serverPrimaries.length > 0) return;
        if (defaultSelection.length === 0) return;
        void pushLoadout(defaultSelection);
    }, [serverPrimaries, defaultSelection, pushLoadout]);

    // Pull remote updates when not mid-push.
    useEffect(() => {
        if (syncingRef.current) return;
        if (!serverPrimaries) return;
        const key = JSON.stringify(serverPrimaries);
        if (key === lastPushedRef.current) {
            setLocalPrimaries(serverPrimaries);
        } else if (key !== JSON.stringify(localPrimaries)) {
            setLocalPrimaries(serverPrimaries);
            lastPushedRef.current = key;
        }
    }, [serverPrimaries, localPrimaries]);

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

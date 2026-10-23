import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import type { MinionBattlesApi } from '../../../../api/minionBattlesApi';
import {
    addQuestPrepAbility,
    buildAccessibleAbilityIds,
    filterSelectableQuestPrepAbilityIds,
    isMissionPrepAbilityReady,
    isMissionPrepReadOnly,
    isQuestPrepSlotsFull,
    moveQuestPrepAbility,
    needsMissionAbilitySelection,
    readOnlyPrepSelection,
    PREP_ABILITY_SLOT_COUNT,
    removeQuestPrepAbility,
    resolveInitialMissionSelection,
} from '../../../../storylines/questPrepLoadout';

interface UseMissionPrepLoadoutParams {
    api: MinionBattlesApi;
    playerId: string;
    character: CampaignCharacter;
    /** Lobby-synced primary picks by player id. */
    missionPrepLoadoutsByPlayer: Record<string, string[]>;
}

/**
 * Local + lobby sync for regular-mission Prepare Carefully ability slots.
 * Under/at cap: read-only (all primaries selected). Over cap: player must pick PREP_ABILITY_SLOT_COUNT.
 */
export function useMissionPrepLoadout({
    api,
    playerId,
    character,
    missionPrepLoadoutsByPlayer,
}: UseMissionPrepLoadoutParams) {
    const accessibleIds = useMemo(
        () => buildAccessibleAbilityIds(character.equipment, character.researchTrees),
        [character.equipment, character.researchTrees],
    );

    const selectableIds = useMemo(
        () => filterSelectableQuestPrepAbilityIds(accessibleIds),
        [accessibleIds],
    );

    const readOnly = isMissionPrepReadOnly(selectableIds.length);
    const selectionRequired = needsMissionAbilitySelection(selectableIds.length);

    const defaultSelection = useMemo(
        () => resolveInitialMissionSelection(selectableIds, character.lastMissionAbilityIds),
        [selectableIds, character.lastMissionAbilityIds],
    );

    const serverPrimaries = missionPrepLoadoutsByPlayer[playerId];
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
            const toPush = readOnly ? readOnlyPrepSelection(next, selectableIds) : next;
            const key = JSON.stringify(toPush);
            if (key === lastPushedRef.current && key === JSON.stringify(localPrimaries)) {
                return;
            }
            lastPushedRef.current = key;
            syncingRef.current = true;
            setLocalPrimaries(toPush);
            try {
                await api.updateGameState({
                    missionPrepLoadoutsByPlayer: {
                        ...missionPrepLoadoutsByPlayer,
                        [playerId]: toPush,
                    },
                });
            } catch (e) {
                console.warn('Failed to sync mission prep loadout:', e);
            } finally {
                syncingRef.current = false;
            }
        },
        [api, playerId, missionPrepLoadoutsByPlayer, readOnly, selectableIds, localPrimaries],
    );

    // Seed lobby state once when empty (read-only auto-fill or remembered picks).
    useEffect(() => {
        if (seededRef.current) return;
        seededRef.current = true;
        if (serverPrimaries && serverPrimaries.length > 0) return;
        if (defaultSelection.length === 0) return;
        void pushLoadout(defaultSelection);
    }, [serverPrimaries, defaultSelection, pushLoadout]);

    // When under/at cap, keep selection locked to the full selectable set (in the player's order).
    useEffect(() => {
        if (!readOnly) return;
        const locked = readOnlyPrepSelection(localPrimaries, selectableIds);
        if (JSON.stringify(localPrimaries) === JSON.stringify(locked)) return;
        void pushLoadout(locked);
    }, [readOnly, selectableIds, localPrimaries, pushLoadout]);

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
    const abilityReady = isMissionPrepAbilityReady(localPrimaries, selectableIds);

    const addAbility = useCallback(
        (abilityId: string) => {
            if (readOnly) return;
            const next = addQuestPrepAbility(localPrimaries, abilityId);
            if (next.length === localPrimaries.length) return;
            void pushLoadout(next);
        },
        [localPrimaries, pushLoadout, readOnly],
    );

    const removeAbility = useCallback(
        (abilityId: string) => {
            if (readOnly) return;
            const next = removeQuestPrepAbility(localPrimaries, abilityId);
            if (next.length === localPrimaries.length) return;
            void pushLoadout(next);
        },
        [localPrimaries, pushLoadout, readOnly],
    );

    // Reordering is allowed even when read-only: the set is locked, the order is the player's.
    const moveAbility = useCallback(
        (fromIndex: number, insertIndex: number) => {
            const next = moveQuestPrepAbility(localPrimaries, fromIndex, insertIndex);
            if (JSON.stringify(next) === JSON.stringify(localPrimaries)) return;
            void pushLoadout(next);
        },
        [localPrimaries, pushLoadout],
    );

    return {
        selectedPrimaryIds: localPrimaries,
        selectableIds,
        accessibleIds,
        slotsFull,
        slotCount: PREP_ABILITY_SLOT_COUNT,
        readOnly,
        selectionRequired,
        abilityReady,
        addAbility,
        removeAbility,
        moveAbility,
    };
}

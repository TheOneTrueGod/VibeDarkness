import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DarknessUpgradesState } from '../../../../../types';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import type { IBaseMissionDef } from '../../../storylines/BaseMissionDef';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import {
    filterDarknessUpgradesByCompletedMissions,
    getCompletedMissionIds,
} from '../../../../../researchTrees/darknessUpgrades';
import {
    getMissionDarknessUpgradeLimits,
    getOwnedDarknessUpgradeNodeIds,
    getSelectedDarknessUpgradeNodeIds,
    shouldShowDarknessModifiersButton,
    validateDarknessUpgradeSelection,
    withSelectedDarknessUpgrades,
} from '../../../../../researchTrees/darknessUpgradeSelection';

interface UseDarknessModifiersParams {
    api: MinionBattlesApi;
    campaignId: string;
    isHost: boolean;
    missionDef: IBaseMissionDef | null | undefined;
    /** The host's chosen character; upgrades earned from unfinished missions are inactive for it. */
    character: CampaignCharacter | null;
}

/**
 * Host-only Darkness Upgrade ("modifier") selection for the pre-battle screen. Loads the host's
 * campaign upgrades, exposes the mission limits + validation, and persists each change to the
 * campaign so the last selection is auto-applied the next time a mission is hosted.
 */
export function useDarknessModifiers({ api, campaignId, isHost, missionDef, character }: UseDarknessModifiersParams) {
    const [state, setState] = useState<DarknessUpgradesState | null>(null);
    const latestRef = useRef<DarknessUpgradesState | null>(null);
    latestRef.current = state;

    useEffect(() => {
        if (!isHost || !campaignId) { setState(null); return; }
        let cancelled = false;
        api.getCampaign(campaignId)
            .then((c) => { if (!cancelled) setState(c.darknessUpgrades ?? null); })
            .catch(() => { if (!cancelled) setState(null); });
        return () => { cancelled = true; };
    }, [api, campaignId, isHost]);

    const limits = useMemo(() => getMissionDarknessUpgradeLimits(missionDef), [missionDef]);

    /** Upgrades that can actually apply for this character (mission-gated ones filtered out). */
    const earned = useMemo(
        () => filterDarknessUpgradesByCompletedMissions(
            state ?? undefined,
            getCompletedMissionIds(character?.missionResults),
        ) ?? null,
        [state, character],
    );
    const ownedNodeIds = useMemo(() => getOwnedDarknessUpgradeNodeIds(earned), [earned]);
    const selectedNodeIds = useMemo(() => getSelectedDarknessUpgradeNodeIds(earned), [earned]);

    const available = isHost && !!character && shouldShowDarknessModifiersButton(ownedNodeIds.length, limits);
    const check = validateDarknessUpgradeSelection(selectedNodeIds.length, ownedNodeIds.length, limits);
    /** Why the host cannot start yet, or null. Only applies while the modifiers are editable. */
    const blockReason = available && !check.valid ? check.reason : null;

    const toggle = useCallback((nodeId: string) => {
        const current = latestRef.current;
        if (!current) return;
        const base = current.selectedNodeIds ?? getOwnedDarknessUpgradeNodeIds(current);
        const nextIds = base.includes(nodeId) ? base.filter((id) => id !== nodeId) : [...base, nodeId];
        const next = withSelectedDarknessUpgrades(current, nextIds);
        setState(next);
        api.updateCampaignDarknessUpgrades(campaignId, next)
            .then((updated) => setState((prev) => (prev === next ? (updated.darknessUpgrades ?? next) : prev)))
            .catch((error) => console.error('Failed to save darkness modifiers:', error));
    }, [api, campaignId]);

    return { available, limits, ownedNodeIds, selectedNodeIds, check, blockReason, toggle };
}

export type DarknessModifiersController = ReturnType<typeof useDarknessModifiers>;

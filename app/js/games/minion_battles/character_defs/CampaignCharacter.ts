/**
 * Campaign character instance created from server data.
 * Provides helpers for mission eligibility and starter battle cards.
 */

import type { CampaignCharacterData, CharacterDisallowReason } from './campaignCharacterTypes';
import type { MissionResult } from '../../../types';
import { getItemDef } from './items';
import { LIGHT_TREE_ID, LIGHT_NODE_CORE } from '../../../researchTrees/trees/light';
import { coreLightItem } from './items/core/017_core_light';

export interface MissionTraitFilter {
    allowedTraits?: string[];
    disallowedTraits?: string[];
}

/**
 * Create a CampaignCharacter instance from the serializable object from the server.
 */
export function fromCampaignCharacterData(data: CampaignCharacterData): CampaignCharacter {
    return new CampaignCharacter(data);
}

/**
 * The Light Core item briefly shared id '008' with the SMG, so characters who
 * researched the Light Core node were saved with an SMG and no core equipped.
 * Rewrites that saved '008' to the Light Core's current id.
 */
function migrateLightCoreEquipment(
    equipment: string[],
    researchTrees: Record<string, string[]>,
): string[] {
    const researchedLightCore = (researchTrees[LIGHT_TREE_ID] ?? []).includes(LIGHT_NODE_CORE);
    if (!researchedLightCore || !equipment.includes('008')) return equipment;
    const hasCore = equipment.some((id) => getItemDef(id)?.slots.includes('core'));
    if (hasCore) return equipment;
    return equipment.map((id) => (id === '008' ? coreLightItem.id : id));
}

function normalizeResearchNodeLevels(
    raw: CampaignCharacterData['researchNodeLevels'],
): Record<string, Record<string, number>> {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, Record<string, number>> = {};
    for (const [treeId, levels] of Object.entries(raw)) {
        if (!treeId || !levels || typeof levels !== 'object') continue;
        const treeOut: Record<string, number> = {};
        for (const [nodeId, level] of Object.entries(levels)) {
            if (!nodeId) continue;
            if (typeof level !== 'number' || !Number.isFinite(level) || level < 1) continue;
            treeOut[nodeId] = Math.floor(level);
        }
        if (Object.keys(treeOut).length > 0) out[treeId] = treeOut;
    }
    return out;
}

export class CampaignCharacter {
    readonly id: string;
    readonly ownerAccountId: number | undefined;
    readonly name: string;
    readonly equipment: string[];
    readonly knowledge: Record<string, Record<string, unknown>>;
    readonly traits: string[];
    readonly portraitId: string;
    readonly battleChipDetails: Record<string, unknown>;
    readonly campaignId: string;
    readonly missionId: string;
    readonly researchTrees: Record<string, string[]>;
    /** Per-tree node level counts for multi-level research nodes. */
    readonly researchNodeLevels: Record<string, Record<string, number>>;
    /** Unix seconds; 0 if never used in a mission (per server). */
    readonly lastUsed: number;
    /** Per-campaign mission results. Key = campaignId. */
    readonly missionResults: Record<string, MissionResult[]>;

    constructor(data: CampaignCharacterData) {
        this.id = data.id;
        this.ownerAccountId = data.ownerAccountId;
        this.name = typeof data.name === 'string' && data.name !== '' ? data.name : 'Adventurer';
        const rawEquipment = Array.isArray(data.equipment) ? [...data.equipment] : [];
        const rawResearchTrees =
            data.researchTrees && typeof data.researchTrees === 'object'
                ? (data.researchTrees as Record<string, string[]>)
                : {};
        this.equipment = migrateLightCoreEquipment(rawEquipment, rawResearchTrees);
        this.knowledge =
            data.knowledge && typeof data.knowledge === 'object' ? { ...data.knowledge } : {};
        this.traits = Array.isArray(data.traits) ? [...data.traits] : [];
        this.portraitId = typeof data.portraitId === 'string' ? data.portraitId : '';
        this.battleChipDetails =
            data.battleChipDetails && typeof data.battleChipDetails === 'object'
                ? { ...data.battleChipDetails }
                : {};
        this.campaignId = typeof data.campaignId === 'string' ? data.campaignId : '';
        this.missionId = typeof data.missionId === 'string' ? data.missionId : '';
        this.researchTrees = rawResearchTrees;
        this.researchNodeLevels = normalizeResearchNodeLevels(data.researchNodeLevels);
        this.lastUsed =
            typeof data.lastUsed === 'number' && Number.isFinite(data.lastUsed) && data.lastUsed > 0
                ? Math.floor(data.lastUsed)
                : 0;
        this.missionResults =
            data.missionResults && typeof data.missionResults === 'object' ? data.missionResults : {};
    }

    /**
     * Returns true if this character can be used on the given campaign (and optionally mission).
     * Same campaign is required; mission trait filters (allowedTraits / disallowedTraits) are applied when provided.
     */
    canBeUsedOnMission(
        campaignId: string,
        _missionId?: string,
        missionDef?: MissionTraitFilter | null,
    ): boolean {
        if (this.campaignId !== campaignId) {
            return false;
        }
        if (missionDef) {
            if (missionDef.disallowedTraits?.length) {
                const hasDisallowed = this.traits.some((t) =>
                    missionDef.disallowedTraits!.includes(t),
                );
                if (hasDisallowed) return false;
            }
            if (missionDef.allowedTraits?.length) {
                const hasAllowed = this.traits.some((t) => missionDef.allowedTraits!.includes(t));
                if (!hasAllowed) return false;
            }
        }
        return true;
    }

    /**
     * Returns a one-word reason the character is disallowed, or null if allowed.
     */
    getDisallowReason(
        campaignId: string,
        _missionId?: string,
        missionDef?: MissionTraitFilter | null,
    ): CharacterDisallowReason | null {
        if (this.campaignId !== campaignId) {
            return 'campaign';
        }
        if (missionDef?.disallowedTraits?.length) {
            const hasDisallowed = this.traits.some((t) =>
                missionDef.disallowedTraits!.includes(t),
            );
            if (hasDisallowed) return 'disallowed';
        }
        if (missionDef?.allowedTraits?.length) {
            const hasAllowed = this.traits.some((t) => missionDef.allowedTraits!.includes(t));
            if (!hasAllowed) return 'allowed';
        }
        return null;
    }

    toJSON(): CampaignCharacterData {
        return {
            id: this.id,
            ownerAccountId: this.ownerAccountId,
            name: this.name,
            equipment: this.equipment,
            knowledge: this.knowledge,
            traits: this.traits,
            portraitId: this.portraitId,
            battleChipDetails: this.battleChipDetails as CampaignCharacterData['battleChipDetails'],
            campaignId: this.campaignId,
            missionId: this.missionId,
            researchTrees: this.researchTrees,
            researchNodeLevels: this.researchNodeLevels,
            lastUsed: this.lastUsed,
            missionResults: this.missionResults,
        };
    }
}

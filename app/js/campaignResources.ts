import type { CampaignResourceKey, CampaignResources, MissionResult } from './types';
import {
    hasAccountKnowledge,
    KNOWLEDGE_RESOURCE_FOOD,
    KNOWLEDGE_RESOURCE_POPULATION,
    KNOWLEDGE_SYSTEM_CAMPAIGN_RESOURCES,
    type AccountKnowledgeMap,
} from './accountKnowledge';

/**
 * The one table of campaign resources, in display order. Adding or renaming a resource is an edit here
 * (plus its icon in `ResourcePill.tsx`); everything else loops over this table.
 */
export const CAMPAIGN_RESOURCE_DEFS = [
    { key: 'vigor', label: 'Vigor', color: '#22C55E', missionBonus: true, knowledgeKey: KNOWLEDGE_SYSTEM_CAMPAIGN_RESOURCES },
    { key: 'metal', label: 'Metal', color: '#95A5A6', missionBonus: true, knowledgeKey: KNOWLEDGE_SYSTEM_CAMPAIGN_RESOURCES },
    {
        key: 'population',
        label: 'Population',
        color: '#3498DB',
        missionBonus: false,
        /** Account knowledge needed before the resource shows in player-facing rows (admin tools ignore it). */
        knowledgeKey: KNOWLEDGE_RESOURCE_POPULATION,
    },
    /** Gated with Vigor and Metal by System: Campaign Resources (`KNOWLEDGE_RESOURCE_ATTUNEMENT` stays reserved). */
    {
        key: 'attunement',
        label: 'Attunement',
        color: '#8B5CF6',
        missionBonus: true,
        knowledgeKey: KNOWLEDGE_SYSTEM_CAMPAIGN_RESOURCES,
    },
    /** Hunger is a signed penalty accumulator (can go negative); its pill chrome is sign-driven. */
    {
        key: 'hunger',
        label: 'Hunger',
        color: '#f97316',
        missionBonus: false,
        signed: true,
        knowledgeKey: KNOWLEDGE_RESOURCE_FOOD,
    },
] as const satisfies readonly CampaignResourceDef[];

export interface CampaignResourceDef {
    key: string;
    label: string;
    color: string;
    /** True when the resource can be handed out as a mission/story reward and counts toward research cost totals. */
    missionBonus: boolean;
    /** Account knowledge required before player-facing rows show this resource. */
    knowledgeKey?: string;
    /** True when the value is a signed delta (a penalty accumulator) rather than a spendable stockpile. */
    signed?: boolean;
}

/** Resource keys in display order. */
export const CAMPAIGN_RESOURCE_KEYS: readonly CampaignResourceKey[] = CAMPAIGN_RESOURCE_DEFS.map((d) => d.key);

/** Resources that can be granted as mission / story rewards (vigor, metal, attunement today). */
export type MissionBonusResourceKey = Extract<(typeof CAMPAIGN_RESOURCE_DEFS)[number], { missionBonus: true }>['key'];
export type MissionBonusResourceDelta = Partial<Record<MissionBonusResourceKey, number>>;
export const MISSION_BONUS_RESOURCE_KEYS = CAMPAIGN_RESOURCE_DEFS.filter((d) => d.missionBonus).map(
    (d) => d.key,
) as MissionBonusResourceKey[];

const DEF_BY_KEY = new Map<CampaignResourceKey, CampaignResourceDef>(
    CAMPAIGN_RESOURCE_DEFS.map((d) => [d.key, d]),
);

export function campaignResourceDef(resource: CampaignResourceKey): CampaignResourceDef {
    return DEF_BY_KEY.get(resource)!;
}

/** A (possibly partial) set of resource amounts. */
export type CampaignResourceDelta = Partial<Record<CampaignResourceKey, number>>;

/**
 * Account knowledge a campaign resource needs before it shows in player-facing resource rows.
 * Resources not listed are always visible. Admin tools ignore this and list every resource.
 */
export const CAMPAIGN_RESOURCE_KNOWLEDGE: Partial<Record<CampaignResourceKey, string>> = Object.fromEntries(
    CAMPAIGN_RESOURCE_DEFS.flatMap((d) => ('knowledgeKey' in d ? [[d.key, d.knowledgeKey]] : [])),
);

export function isCampaignResourceVisible(resource: CampaignResourceKey, knowledge: AccountKnowledgeMap): boolean {
    const key = CAMPAIGN_RESOURCE_KNOWLEDGE[resource];
    return key == null || hasAccountKnowledge(knowledge, key);
}

/** The resources from `resources` (kept in order) that this account knows about. */
export function visibleCampaignResources(
    resources: readonly CampaignResourceKey[],
    knowledge: AccountKnowledgeMap,
): CampaignResourceKey[] {
    return resources.filter((resource) => isCampaignResourceVisible(resource, knowledge));
}

export const RESET_CAMPAIGN_RESOURCES_LABEL = 'Reset resources';
export const RESET_CAMPAIGN_RESOURCES_CONFIRM =
    'Reset campaign resources to the sum of mission rewards? This removes admin-granted extras.';

export const ZERO_CAMPAIGN_RESOURCES: CampaignResources = Object.fromEntries(
    CAMPAIGN_RESOURCE_DEFS.map((d) => [d.key, 0]),
) as CampaignResources;

/**
 * Latest `resourceDelta` per missionId (highest timestamp wins), then summed.
 * Matches campaign effective-resource math on the server.
 */
export function sumLatestMissionResourceDeltas(
    results: MissionResult[] | undefined,
): CampaignResources {
    const out: CampaignResources = { ...ZERO_CAMPAIGN_RESOURCES };
    if (!results?.length) return out;

    const latestByMission = new Map<string, MissionResult>();
    for (const result of results) {
        const missionId = result.missionId ?? '';
        if (missionId === '') continue;
        const prev = latestByMission.get(missionId);
        if (!prev || (prev.timestamp ?? 0) <= (result.timestamp ?? 0)) {
            latestByMission.set(missionId, result);
        }
    }
    for (const result of latestByMission.values()) {
        const delta = result.resourceDelta;
        if (!delta) continue;
        for (const key of CAMPAIGN_RESOURCE_KEYS) out[key] += delta[key] ?? 0;
    }
    return out;
}

/** Sum one or more resource deltas. Returns undefined when nothing was added. */
export function mergeResourceDeltas(
    ...deltas: Array<CampaignResourceDelta | undefined>
): CampaignResourceDelta | undefined {
    const out: CampaignResourceDelta = {};
    let any = false;
    for (const delta of deltas) {
        if (!delta) continue;
        for (const [key, value] of Object.entries(delta)) {
            if (value == null) continue;
            const resource = key as CampaignResourceKey;
            out[resource] = (out[resource] ?? 0) + value;
            any = true;
        }
    }
    return any ? out : undefined;
}

export function campaignResourcesEqual(a: CampaignResources, b: CampaignResources): boolean {
    return CAMPAIGN_RESOURCE_KEYS.every((key) => a[key] === b[key]);
}

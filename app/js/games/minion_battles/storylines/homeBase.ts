/**
 * Campaign home / spawn tile. Layout-composer missions fill `{ kind: 'spawn' }` cells with
 * whatever {@link resolveHomeSegmentId} returns. Terrain must be identical on host and clients,
 * so callers pass shared lobby context (union of party research, shared mission results) — not
 * a single player's private trees.
 */

import { CRYSTAL_CAVE_SEGMENT_ID } from './WorldOfDarkness/MapSegments/50_50_crystal_cave';
import type { MissionResult } from '../../../types';

/** Fallback home until a higher-priority rule matches. */
export const DEFAULT_HOME_SEGMENT_ID = CRYSTAL_CAVE_SEGMENT_ID;

/** Campfire light carried with the home tile on layout-composer missions. */
export const HOME_CAMPFIRE_LIGHT_AMOUNT = 10;
export const HOME_CAMPFIRE_LIGHT_RADIUS = 8;
export const HOME_CAMPFIRE_MAX_HP = 5;

export interface HomeResolveContext {
    /** Tree id → researched node ids. Prefer {@link mergePartyResearch} so the party shares one home. */
    researchTrees?: Record<string, string[]>;
    /** Shared campaign results (typically the host's). */
    missionResults?: MissionResult[];
}

export interface HomeResolveRule {
    segmentId: string;
    /** Higher wins. Default home is priority 0. */
    priority: number;
    when: (ctx: HomeResolveContext) => boolean;
}

export interface ResolveHomeSegmentOptions {
    /** Mission pin — always wins when set. */
    missionOverride?: string;
    /** Test hook; production uses {@link HOME_SEGMENT_RULES}. */
    rules?: readonly HomeResolveRule[];
}

/**
 * Ordered upgrade table. Empty until a research node or campaign beat should swap the home;
 * add rules here rather than per-mission. Example:
 * `{ segmentId: 'fortified_camp', priority: 20, when: (ctx) => partyHasResearchNode(ctx, 'camp', 'walls') }`
 */
export const HOME_SEGMENT_RULES: readonly HomeResolveRule[] = [];

export function partyHasResearchNode(ctx: HomeResolveContext, treeId: string, nodeId: string): boolean {
    return (ctx.researchTrees?.[treeId] ?? []).includes(nodeId);
}

export function partyHasMissionVictory(ctx: HomeResolveContext, missionId: string): boolean {
    return (ctx.missionResults ?? []).some((r) => r.missionId === missionId && r.result !== 'defeat');
}

/** Union researched nodes across every player so any unlock upgrades the shared home. */
export function mergePartyResearch(
    byPlayer: Record<string, Record<string, string[]>> | undefined,
): Record<string, string[]> {
    const merged: Record<string, string[]> = {};
    for (const trees of Object.values(byPlayer ?? {})) {
        for (const [treeId, nodes] of Object.entries(trees)) {
            const set = new Set([...(merged[treeId] ?? []), ...nodes]);
            merged[treeId] = [...set];
        }
    }
    return merged;
}

export function terrainContextFromSnapshot(
    snapshot: Record<string, unknown> | null | undefined,
): HomeResolveContext {
    const research = snapshot?.playerResearchTreesByPlayer as
        | Record<string, Record<string, string[]>>
        | undefined;
    const missionResults = snapshot?.missionResults as MissionResult[] | undefined;
    return {
        researchTrees: mergePartyResearch(research),
        missionResults,
    };
}

export function resolveHomeSegmentId(
    ctx: HomeResolveContext = {},
    options: ResolveHomeSegmentOptions = {},
): string {
    if (options.missionOverride) return options.missionOverride;
    const rules = options.rules ?? HOME_SEGMENT_RULES;
    let bestId = DEFAULT_HOME_SEGMENT_ID;
    let bestPriority = 0;
    for (const rule of rules) {
        if (rule.priority > bestPriority && rule.when(ctx)) {
            bestId = rule.segmentId;
            bestPriority = rule.priority;
        }
    }
    return bestId;
}

/** Every home the resolver might pick — include these in `segmentIds` so battle fetch can load them. */
export function listHomeSegmentIds(): string[] {
    return [...new Set([DEFAULT_HOME_SEGMENT_ID, ...HOME_SEGMENT_RULES.map((r) => r.segmentId)])];
}

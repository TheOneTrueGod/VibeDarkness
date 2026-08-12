/**
 * Priority-fill hit selection: committed units still in-shape first, then other
 * in-shape units, capped with the same stack-aware slot rules as MeleeAttack.
 */

import type { Unit } from '../game/units/Unit';
import type { HitboxSpec } from '../hitboxes/HitboxSpec';
import type { HitboxEngineContext } from '../hitboxes/Hitbox';
import { CircleHitbox } from '../hitboxes/CircleHitbox';
import type { ResolvedTarget } from '../game/types';
import { findMeleeAimPixelInTargets } from './targeting';

/**
 * Assign up to `cap` hit slots to candidates. Each unique unit gets one slot
 * first (preserving order). Remaining slots go to stacks (largest first,
 * capped by stackSize), spreading across stacks before double-hitting one.
 */
export function assignHitSlots(candidates: Unit[], cap: number): Unit[] {
    const slotsUsed = new Map<string, number>();
    const result: Unit[] = [];

    for (const u of candidates) {
        if (result.length >= cap) break;
        if (!slotsUsed.has(u.id)) {
            slotsUsed.set(u.id, 1);
            result.push(u);
        }
    }

    if (result.length < cap) {
        const stackable = [...new Set(candidates)]
            .filter((u) => u.stackSize > (slotsUsed.get(u.id) ?? 0))
            .sort((a, b) => b.stackSize - a.stackSize);

        for (const u of stackable) {
            while (result.length < cap && (slotsUsed.get(u.id) ?? 0) < u.stackSize) {
                slotsUsed.set(u.id, (slotsUsed.get(u.id) ?? 0) + 1);
                result.push(u);
            }
            if (result.length >= cap) break;
        }
    }

    return result;
}

/**
 * Priority fill: committed IDs still present in `inShape` (stable commit order),
 * then other in-shape units, then stack-aware cap at `numTargets`.
 */
export function priorityFillHits(
    committedIds: readonly string[],
    inShape: Unit[],
    numTargets: number,
): Unit[] {
    if (numTargets <= 0) return [];
    const inShapeById = new Map(inShape.map((u) => [u.id, u]));
    const ordered: Unit[] = [];
    const seen = new Set<string>();

    for (const id of committedIds) {
        const u = inShapeById.get(id);
        if (!u || seen.has(id)) continue;
        ordered.push(u);
        seen.add(id);
    }
    for (const u of inShape) {
        if (seen.has(u.id)) continue;
        ordered.push(u);
        seen.add(u.id);
    }

    return assignHitSlots(ordered, numTargets);
}

/** Unit IDs from order.targets before the trailing aim pixel (melee / AoE lock-on convention). */
export function extractCommittedUnitIds(targets: readonly ResolvedTarget[]): string[] {
    const ids: string[] = [];
    for (const t of targets) {
        if (t.type === 'unit' && t.unitId != null) {
            ids.push(t.unitId);
        }
    }
    return ids;
}

/**
 * Split `[primary0..P-1, companion0..C-1, …, aimPixel]` into primary / companion
 * commit lists. Prefers `lockRole` when present; otherwise falls back to primaryCount /
 * companionCounts slot budgets. Aim pixel remains the last pixel entry.
 */
export function splitSelectOrderTargets(
    targets: readonly ResolvedTarget[],
    primaryCount: number,
    companionCounts: readonly number[] = [],
): {
    primaryIds: string[];
    companionIds: string[][];
    aimPixel: { x: number; y: number } | null;
} {
    const hasRoles = targets.some((t) => t.type === 'unit' && t.lockRole != null);
    if (hasRoles) {
        const primaryIds: string[] = [];
        const allCompanionIds: string[] = [];
        for (const t of targets) {
            if (t.type !== 'unit' || t.unitId == null) continue;
            if (t.lockRole === 'companion') allCompanionIds.push(t.unitId);
            else primaryIds.push(t.unitId);
        }
        let offset = 0;
        const companionIds: string[][] = [];
        for (const count of companionCounts) {
            const slice = allCompanionIds.slice(offset, offset + Math.max(0, count));
            companionIds.push(slice);
            offset += slice.length;
        }
        if (companionCounts.length === 0 && allCompanionIds.length > 0) {
            companionIds.push(allCompanionIds);
        }
        return {
            primaryIds: primaryIds.slice(0, Math.max(0, primaryCount)),
            companionIds,
            aimPixel: findMeleeAimPixelInTargets(targets as ResolvedTarget[]),
        };
    }

    const unitIds = extractCommittedUnitIds(targets);
    const primaryIds = unitIds.slice(0, Math.max(0, primaryCount));
    let offset = primaryIds.length;
    const companionIds: string[][] = [];
    for (const count of companionCounts) {
        const slice = unitIds.slice(offset, offset + Math.max(0, count));
        companionIds.push(slice);
        offset += slice.length;
    }
    return {
        primaryIds,
        companionIds,
        aimPixel: findMeleeAimPixelInTargets(targets as ResolvedTarget[]),
    };
}

/**
 * Strict AoE resolve: only committed units still in `inShape` keep priority;
 * remaining slots fill from other in-shape units (no tether).
 */
export function resolveStrictAoEHits(options: {
    committedIds: readonly string[];
    inShapeUnits: Unit[];
    numTargets: number;
}): Unit[] {
    return priorityFillHits(options.committedIds, options.inShapeUnits, options.numTargets);
}

/**
 * Collect in-shape units via HitboxSpec.resolveHits at aim, then strict priority fill.
 */
export function collectStrictAoEHits(options: {
    hitbox: HitboxSpec;
    engine: HitboxEngineContext;
    caster: Unit;
    aimX: number;
    aimY: number;
    committedIds: readonly string[];
    numTargets: number;
}): Unit[] {
    const inShape = options.hitbox.resolveHits(
        options.engine,
        options.caster,
        options.aimX,
        options.aimY,
    );
    return resolveStrictAoEHits({
        committedIds: options.committedIds,
        inShapeUnits: inShape,
        numTargets: options.numTargets,
    });
}

/**
 * Circle blast at a point: CircleHitbox discovery → strict priority fill.
 * Shared by delayed explosions (Energy Blast, Throw Charged Rock).
 */
export function explodeAtPointWithPriorityFill(options: {
    engine: HitboxEngineContext;
    caster: Unit;
    center: { x: number; y: number };
    radius: number;
    committedIds: readonly string[];
    numTargets: number;
}): Unit[] {
    const inShape = CircleHitbox.getUnitsInHitbox(
        options.engine,
        options.caster,
        options.center.x,
        options.center.y,
        options.radius,
    );
    inShape.sort((a, b) => {
        const da = (a.x - options.center.x) ** 2 + (a.y - options.center.y) ** 2;
        const db = (b.x - options.center.x) ** 2 + (b.y - options.center.y) ** 2;
        return da - db;
    });
    return resolveStrictAoEHits({
        committedIds: options.committedIds,
        inShapeUnits: inShape,
        numTargets: options.numTargets,
    });
}

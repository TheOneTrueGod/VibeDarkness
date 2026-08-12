/**
 * Targeting system for abilities.
 *
 * Defines target types, target definitions, and helpers
 * for validating and resolving click targets.
 */

import type { Unit } from '../game/units/Unit';
import type { Camera } from '../game/Camera';
import type { ResolvedTarget } from '../game/types';
import type { AbilityStatic, IAbilityPreviewGraphics } from './Ability';
import type { InteractiveTargetDef, SelectTargetDef } from './timingTargetDef';
import { isInteractiveTargetDef, isSelectTargetDef } from './timingTargetDef';
import { isAbilityTimingInterval } from './abilityTimings';
import { areEnemies, areAllies } from '../game/teams';

/** The types of targets an ability can require. */
export type TargetType = 'player' | 'unit' | 'pixel';

/** Describes one required target for an ability. */
export interface TargetDef {
    type?: TargetType; // defaults to 'pixel'
    label: string;
}

/** Result of resolving a click on the canvas. */
export interface ClickResult {
    /** The unit clicked on, if any. */
    unit: Unit | null;
    /** The world-space position of the click. */
    worldPosition: { x: number; y: number };
}

/**
 * Resolve a screen-space click to a world-space position and
 * optionally the unit at that position.
 */
export function resolveClick(
    screenX: number,
    screenY: number,
    camera: Camera,
    units: Unit[],
): ClickResult {
    const worldPos = camera.screenToWorld(screenX, screenY);
    let closestUnit: Unit | null = null;
    let closestDist = Infinity;

    for (const unit of units) {
        if (!unit.isAlive()) continue;
        const dx = unit.x - worldPos.x;
        const dy = unit.y - worldPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= unit.radius && dist < closestDist) {
            closestDist = dist;
            closestUnit = unit;
        }
    }

    return { unit: closestUnit, worldPosition: worldPos };
}

/**
 * Find the unit at the given world position (closest if multiple overlap).
 */
export function getUnitAtPosition(worldPos: { x: number; y: number }, units: Unit[]): Unit | null {
    let closestUnit: Unit | null = null;
    let closestDist = Infinity;

    for (const unit of units) {
        if (!unit.isAlive()) continue;
        const dx = unit.x - worldPos.x;
        const dy = unit.y - worldPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= unit.radius && dist < closestDist) {
            closestDist = dist;
            closestUnit = unit;
        }
    }

    return closestUnit;
}

/**
 * Collect all `SelectTargetDef` entries from an ability's timing intervals, in declaration order.
 *
 * For new-style abilities that declare per-timing `targetDef: { kind: 'select', ... }`, this gives
 * the ordered click sequence to drive target collection in the UI (replacing `getAbilityTargets`).
 * Returns an empty array for legacy abilities that do not use per-timing target defs.
 *
 * Pass `caster` and `engine` so that research-dependent `getAbilityTimings` overrides (e.g.
 * More Rock dual-throw) return the correct interval set for the current player.
 */
export function getSelectTargetDefsFromTimings(
    ability: AbilityStatic,
    caster?: Unit,
    engine?: unknown,
): SelectTargetDef[] {
    // Use raw timing entries (before normalisation/coop-tail-split) so that
    // targetDef fields are never accidentally stripped by applyCoopTailSplit.
    const entries = ability.getAbilityTimings
        ? ability.getAbilityTimings(caster, engine)
        : ability.abilityTimings;
    const result: SelectTargetDef[] = [];
    for (const entry of entries) {
        if (isAbilityTimingInterval(entry) && entry.targetDef && isSelectTargetDef(entry.targetDef)) {
            result.push(entry.targetDef);
        }
    }
    return result;
}

/**
 * Collect interactive timing target defs (`select` + `confirmRadius`) in declaration order.
 * Used by ITS pause / label collection; select-only helpers stay on {@link getSelectTargetDefsFromTimings}.
 */
export function getInteractiveTargetDefsFromTimings(
    ability: AbilityStatic,
    caster?: Unit,
    engine?: unknown,
): InteractiveTargetDef[] {
    const entries = ability.getAbilityTimings
        ? ability.getAbilityTimings(caster, engine)
        : ability.abilityTimings;
    const result: InteractiveTargetDef[] = [];
    for (const entry of entries) {
        if (isAbilityTimingInterval(entry) && entry.targetDef && isInteractiveTargetDef(entry.targetDef)) {
            result.push(entry.targetDef);
        }
    }
    return result;
}

/** Draw red highlight rings around units that will be hit by the current targeting preview. */
export function renderMeleeTrackingHighlights(gr: IAbilityPreviewGraphics, hitUnits: Unit[]): void {
    for (const unit of hitUnits) {
        gr.circle(unit.x, unit.y, unit.radius + 4);
        gr.stroke({ color: 0xff2222, width: 2.5, alpha: 0.4 });
    }
}

/**
 * Filter a candidate unit list by a `SelectTargetDef.filter` value and exclude the caster.
 *
 * Call this after `HitboxSpec.renderTargetingPreview` (which does NOT self-exclude) and
 * after `HitboxSpec.resolveTargets` (which self-excludes but does NOT team-filter).
 * Safe to call on already-self-excluded lists — the caster check is a no-op in that case.
 *
 * Pass `includeSelf: true` (from `SelectTargetDef.includeSelf`) for self-castable `filter:
 * 'ally'`/`'any'` steps — the caster still only appears here if the paired hitbox already
 * put them in `units` (see `UnitRangeHitboxSpec`'s `includeCaster`).
 */
export function filterSelectTargetCandidates(
    units: Unit[],
    caster: Pick<Unit, 'id' | 'teamId'>,
    filter: SelectTargetDef['filter'],
    includeSelf = false,
): Unit[] {
    return units.filter(u => {
        if (u.id === caster.id && !includeSelf) return false;
        if (filter === 'enemy') return areEnemies(caster.teamId, u.teamId);
        if (filter === 'ally')  return areAllies(caster.teamId, u.teamId);
        return true; // 'any'
    });
}

/**
 * Post-lunge virtual caster + aim point used by melee targeting preview and lock-on resolution.
 * Returns null when no lunge is needed (already in range / aim on caster).
 */
export function computeLungeAimState(
    caster: { x: number; y: number },
    mouseWorld: { x: number; y: number },
    hitboxMax: number,
    lungeMax: number,
): { virtualX: number; virtualY: number; adjustedMouse: { x: number; y: number } } | null {
    const dx = mouseWorld.x - caster.x;
    const dy = mouseWorld.y - caster.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5) return null;

    const neededLunge = Math.max(0, dist - hitboxMax);
    const actualLunge = Math.min(lungeMax, neededLunge);
    if (actualLunge <= 0) return null;

    const dirX = dx / dist;
    const dirY = dy / dist;
    const virtualX = caster.x + dirX * actualLunge;
    const virtualY = caster.y + dirY * actualLunge;
    return {
        virtualX,
        virtualY,
        adjustedMouse: {
            x: virtualX + dirX * Math.min(hitboxMax, dist - actualLunge),
            y: virtualY + dirY * Math.min(hitboxMax, dist - actualLunge),
        },
    };
}

export type SelectLockOnEngine = {
    units: readonly Unit[];
};

/**
 * Resolve lock-on candidates for a SelectTargetDef click — **same geometry as the targeting
 * preview highlights** (including windup-lunge virtual caster / adjusted aim).
 *
 * Callers that resolve from the pre-lunge caster position will lock different units than the
 * player saw highlighted during sequential targeting playahead.
 */
export function resolveSelectTargetLockOnCandidates(
    ability: AbilityStatic,
    caster: Unit,
    selectDef: SelectTargetDef,
    aimPoint: { x: number; y: number },
    engine: SelectLockOnEngine,
): Unit[] {
    let originX = caster.x;
    let originY = caster.y;
    let effectiveAim = aimPoint;

    if (ability.lunge != null) {
        const lungeMax = caster.getLungeDistance(engine, ability.lunge.distance);
        const state = computeLungeAimState(caster, aimPoint, selectDef.hitbox.maxRange, lungeMax);
        if (state) {
            originX = state.virtualX;
            originY = state.virtualY;
            effectiveAim = state.adjustedMouse;
        }
    }

    // Shadow caster x/y so hitbox geometry matches the post-lunge preview without mutating live state.
    const originCaster = Object.create(caster) as Unit;
    originCaster.x = originX;
    originCaster.y = originY;

    const raw = selectDef.hitbox.resolveTargets(originCaster, effectiveAim, engine.units as Unit[]);
    const candidates = filterSelectTargetCandidates(raw, caster, selectDef.filter, selectDef.includeSelf);
    candidates.sort((a, b) => {
        const da = (a.x - effectiveAim.x) ** 2 + (a.y - effectiveAim.y) ** 2;
        const db = (b.x - effectiveAim.x) ** 2 + (b.y - effectiveAim.y) ** 2;
        return da - db;
    });
    const maxCandidates = selectDef.numTargets ?? selectDef.hitbox.numTargets;
    return candidates.slice(0, maxCandidates);
}

/**
 * Resolve companion hitbox lock-on candidates for the same click as the primary select.
 * Uses the same lunge-adjusted origin/aim as {@link resolveSelectTargetLockOnCandidates}.
 * Dedupes units already taken by `primaryCandidates` so they are not committed twice.
 */
export function resolveSelectTargetCompanionLockOns(
    ability: AbilityStatic,
    caster: Unit,
    selectDef: SelectTargetDef,
    aimPoint: { x: number; y: number },
    engine: SelectLockOnEngine,
    primaryCandidates: readonly Unit[] = [],
): Unit[] {
    const companions = selectDef.companionHitboxes;
    if (!companions?.length) return [];

    let originX = caster.x;
    let originY = caster.y;
    let effectiveAim = aimPoint;

    if (ability.lunge != null) {
        const lungeMax = caster.getLungeDistance(engine, ability.lunge.distance);
        const state = computeLungeAimState(caster, aimPoint, selectDef.hitbox.maxRange, lungeMax);
        if (state) {
            originX = state.virtualX;
            originY = state.virtualY;
            effectiveAim = state.adjustedMouse;
        }
    }

    const originCaster = Object.create(caster) as Unit;
    originCaster.x = originX;
    originCaster.y = originY;

    const taken = new Set(primaryCandidates.map((u) => u.id));
    const result: Unit[] = [];
    for (const companion of companions) {
        const raw = companion.hitbox.resolveTargets(originCaster, effectiveAim, engine.units as Unit[]);
        const filter = companion.filter ?? selectDef.filter;
        const filtered = filterSelectTargetCandidates(raw, caster, filter, selectDef.includeSelf)
            .filter((u) => !taken.has(u.id));
        filtered.sort((a, b) => {
            const da = (a.x - effectiveAim.x) ** 2 + (a.y - effectiveAim.y) ** 2;
            const db = (b.x - effectiveAim.x) ** 2 + (b.y - effectiveAim.y) ** 2;
            return da - db;
        });
        const max = companion.numTargets ?? companion.hitbox.numTargets;
        for (const u of filtered.slice(0, max)) {
            taken.add(u.id);
            result.push(u);
        }
    }
    return result;
}

/**
 * Find the trailing aim pixel appended by `buildMeleeSelectOrderTargets`.
 * Convention: last `pixel` entry in the array (always appended after lock-on units).
 * Returns `null` when no pixel entry is present.
 */
export function findMeleeAimPixelInTargets(targets: ResolvedTarget[]): { x: number; y: number } | null {
    for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        if (t?.type === 'pixel' && t.position != null) {
            return t.position;
        }
    }
    return null;
}

/**
 * Build the `order.targets` array for a melee / AoE SelectTargetDef click.
 *
 * Convention (mirrors AbilityTargetingTool upfront path):
 * - Primary candidates: `[primary, ...additionalLockOns(1..numTargets-1), ...companions, aimPixel]`
 * - No primary candidates: `[labelResolved]` only (companions are not committed on a primary miss)
 *
 * Companion IDs (from `SelectTargetDef.companionHitboxes`) append after primary lock-ons and
 * before the trailing aim pixel. Split with `splitSelectOrderTargets` in `priorityFillHits.ts`.
 *
 * @param labelResolved  Primary resolved target (unit or pixel) stored in `targetsByLabel`.
 * @param lockOnCandidates All sorted lock-on candidates (closest-first), up to hitbox numTargets.
 * @param clickWorldPosition Raw click world position — appended as trailing aim pixel when candidates exist.
 * @param numTargets Max lock-on slots from the SelectTargetDef / hitbox.
 * @param companionCandidates Optional companion lock-ons (already capped per companion def).
 */
export function buildMeleeSelectOrderTargets(
    labelResolved: ResolvedTarget,
    lockOnCandidates: Array<{ unitId: string }>,
    clickWorldPosition: { x: number; y: number },
    numTargets: number,
    companionCandidates: Array<{ unitId: string }> = [],
): ResolvedTarget[] {
    if (lockOnCandidates.length === 0) {
        return [labelResolved];
    }
    // Lock-on geometry can include units slightly beyond getAbilityMaxRange center distance
    // (thick-line tolerance). clampSelectTarget may downgrade labelResolved to a range pixel —
    // always prefer the highlighted lock-on unit as primary so MeleeAttack.onSetup records it.
    const primary: ResolvedTarget = { type: 'unit', unitId: lockOnCandidates[0]!.unitId, lockRole: 'primary' };
    const additionalLockOns: ResolvedTarget[] = lockOnCandidates
        .slice(1, numTargets)
        .map((c) => ({ type: 'unit' as const, unitId: c.unitId, lockRole: 'primary' as const }));
    const companionLockOns: ResolvedTarget[] = companionCandidates.map((c) => ({
        type: 'unit' as const,
        unitId: c.unitId,
        lockRole: 'companion' as const,
    }));
    const aimPixel: ResolvedTarget = { type: 'pixel', position: clickWorldPosition };
    return [primary, ...additionalLockOns, ...companionLockOns, aimPixel];
}

/** Convert a committed `ResolvedTarget` to a world-space point, or null if unresolvable. */
export function resolveTargetToPoint(
    target: ResolvedTarget,
    engine: { getUnit(id: string): { x: number; y: number } | undefined | null },
): { x: number; y: number } | null {
    if (target.type === 'unit' && target.unitId) {
        const u = engine.getUnit(target.unitId);
        return u ? { x: u.x, y: u.y } : null;
    }
    if (target.type === 'pixel' && target.position) {
        return target.position;
    }
    return null;
}

/** Max cast range from `getRange` or `aiSettings.maxRange`. Returns null when uncapped. */
export function getAbilityMaxRange(ability: AbilityStatic, caster: Unit): number | null {
    const range = ability.getRange?.(caster);
    if (range != null) return range.maxRange;
    const aiMax = ability.aiSettings?.maxRange;
    if (aiMax != null && aiMax > 0) return aiMax;
    return null;
}

/**
 * Clamp a resolved target to the ability's max range from the caster.
 * Pixel picks beyond range become a pixel at the range boundary; unit picks beyond
 * range become a pixel aimed at that unit's direction at max range.
 */
export function clampResolvedTargetToAbilityRange(
    ability: AbilityStatic,
    caster: Unit,
    target: ResolvedTarget,
    engine: { getUnit(id: string): { x: number; y: number } | undefined | null },
): ResolvedTarget {
    const maxRange = getAbilityMaxRange(ability, caster);
    if (maxRange == null || maxRange <= 0) return target;

    const point = resolveTargetToPoint(target, engine);
    if (!point) return target;

    const dx = point.x - caster.x;
    const dy = point.y - caster.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= maxRange * maxRange) return target;

    const dist = Math.sqrt(distSq);
    const scale = maxRange / dist;
    return { type: 'pixel', position: { x: caster.x + dx * scale, y: caster.y + dy * scale } };
}

/** Clamp a world point to `[minDistance, maxDistance]` from an origin along the click bearing. */
export function clampPointToDistanceBand(
    originX: number,
    originY: number,
    clickX: number,
    clickY: number,
    minDistance: number,
    maxDistance: number,
): { x: number; y: number } {
    const dx = clickX - originX;
    const dy = clickY - originY;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) {
        return { x: originX + maxDistance, y: originY };
    }
    const clampedDist = Math.min(maxDistance, Math.max(minDistance, dist));
    return {
        x: originX + (dx / dist) * clampedDist,
        y: originY + (dy / dist) * clampedDist,
    };
}

/**
 * Resolve the anchor unit for an anchored `SelectTargetDef` from collected targets.
 * Returns null when the anchor label is missing or not yet resolved to a unit.
 */
export function resolveAnchorUnit(
    _selectDefs: readonly SelectTargetDef[],
    collectedTargetsByLabel: Record<string, ResolvedTarget>,
    anchorLabel: string,
    engine: { getUnit(id: string): Unit | undefined | null },
): Unit | null {
    const anchorTarget = collectedTargetsByLabel[anchorLabel];
    if (!anchorTarget || anchorTarget.type !== 'unit' || !anchorTarget.unitId) return null;
    return engine.getUnit(anchorTarget.unitId) ?? null;
}

/**
 * Resolve anchor position from ordered collected targets (preview / non-label maps).
 */
export function resolveAnchorPointFromCollected(
    selectDefs: readonly SelectTargetDef[],
    collectedTargets: ResolvedTarget[],
    anchorLabel: string,
    engine: { getUnit(id: string): { x: number; y: number } | undefined | null },
): { x: number; y: number } | null {
    const anchorIdx = selectDefs.findIndex((d) => d.label === anchorLabel);
    if (anchorIdx < 0 || anchorIdx >= collectedTargets.length) return null;
    return resolveTargetToPoint(collectedTargets[anchorIdx]!, engine);
}

/**
 * Clamp a select-target resolution — anchor-relative pixel picks or caster-range fallback.
 */
export function clampSelectTarget(
    ability: AbilityStatic,
    caster: Unit,
    selectDef: SelectTargetDef,
    collectedTargetsByLabel: Record<string, ResolvedTarget>,
    collectedTargetsOrdered: ResolvedTarget[],
    target: ResolvedTarget,
    engine: { getUnit(id: string): Unit | undefined | null },
    minDistanceFromAnchor = 0,
): ResolvedTarget {
    if (
        selectDef.anchorLabel != null
        && selectDef.maxRangeFromAnchor != null
        && selectDef.maxRangeFromAnchor > 0
    ) {
        const selectDefs = getSelectTargetDefsFromTimings(ability, caster, engine);
        const labeledAnchor = collectedTargetsByLabel[selectDef.anchorLabel];
        const anchorPoint =
            (labeledAnchor ? resolveTargetToPoint(labeledAnchor, engine) : null)
            ?? resolveAnchorPointFromCollected(selectDefs, collectedTargetsOrdered, selectDef.anchorLabel, engine);
        if (!anchorPoint) return target;

        const point = resolveTargetToPoint(target, engine) ?? anchorPoint;
        const minDist = selectDef.minRangeFromAnchor ?? minDistanceFromAnchor;
        const clamped = clampPointToDistanceBand(
            anchorPoint.x,
            anchorPoint.y,
            point.x,
            point.y,
            minDist,
            selectDef.maxRangeFromAnchor,
        );
        return { type: 'pixel', position: clamped };
    }

    return clampResolvedTargetToAbilityRange(ability, caster, target, engine);
}

/**
 * Build AI order targets for abilities with per-timing `SelectTargetDef` entries.
 */
export function buildAiSelectTargets(
    caster: Unit,
    ability: AbilityStatic,
    enemyUnit: Unit,
    engine: { getUnit(id: string): Unit | undefined | null },
): { targets: ResolvedTarget[]; targetsByLabel: Record<string, ResolvedTarget> } {
    const selectDefs = getSelectTargetDefsFromTimings(ability, caster, engine);
    const targets: ResolvedTarget[] = [];
    const targetsByLabel: Record<string, ResolvedTarget> = {};

    for (const selectDef of selectDefs) {
        if (selectDef.aiHint?.kind === 'pixelFromAnchor' && selectDef.anchorLabel) {
            const anchorUnit =
                resolveAnchorUnit(selectDefs, targetsByLabel, selectDef.anchorLabel, engine)
                ?? enemyUnit;
            const maxDist = selectDef.maxRangeFromAnchor ?? 0;
            let dirX = anchorUnit.x - caster.x;
            let dirY = anchorUnit.y - caster.y;
            const casterDist = Math.hypot(dirX, dirY);
            if (casterDist < 1e-6) {
                dirX = maxDist;
                dirY = 0;
            } else {
                dirX /= casterDist;
                dirY /= casterDist;
            }
            const distance = selectDef.aiHint.distance === 'maxFromAnchor' ? maxDist : maxDist;
            const pixel: ResolvedTarget = {
                type: 'pixel',
                position: {
                    x: anchorUnit.x + dirX * distance,
                    y: anchorUnit.y + dirY * distance,
                },
            };
            targets.push(pixel);
            targetsByLabel[selectDef.label] = pixel;
            continue;
        }

        if (selectDef.filter === 'enemy') {
            const unitTarget: ResolvedTarget = { type: 'unit', unitId: enemyUnit.id };
            targets.push(unitTarget);
            targetsByLabel[selectDef.label] = unitTarget;
            continue;
        }

        const fallback: ResolvedTarget = { type: 'pixel', position: { x: enemyUnit.x, y: enemyUnit.y } };
        targets.push(fallback);
        targetsByLabel[selectDef.label] = fallback;
    }

    return { targets, targetsByLabel };
}

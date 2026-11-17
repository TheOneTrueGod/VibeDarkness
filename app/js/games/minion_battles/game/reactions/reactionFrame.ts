/**
 * Reaction frames: the moment a Reactable enemy attack lets threatened players answer it.
 *
 * {@link requestReactionFrame} is THE entry point. Anything that wants to give players a Reaction calls it
 * with the attack's source unit and the area it threatens: ability intervals that declare a `reactionFrame`
 * (via `unitAbilityTick`), the fused body telegraph (via `engineEventWiring`), and later the resprout
 * eruption. It collects every player unit that qualifies, marks it `reactionPending`, and adds it to the
 * tick's deferred pause (the same path as a conditional cancel, so it merges with any other pause that tick).
 *
 * The decision (`wait` is free; any castable ability spends 1 Reflex and cancels the current cast) lives in
 * `OrderManager.resolveReactionIfNeeded`. This is not a CC interrupt: nothing here touches `ccInterrupt`.
 */

import { ResourceId } from '../../resources/resourceIds';
import type { EngineContext } from '../EngineContext';
import type { Unit } from '../units/Unit';
import { areEnemies } from '../teams';
import { playerKnowsReactions } from './playerKnowledge';

/** A threatened area: a disc, or a set of lanes (segments with a half-width), e.g. the rays of a beam. */
export type ReactionArea =
    | { kind: 'circle'; x: number; y: number; radius: number }
    | {
          kind: 'lanes';
          segments: readonly { x1: number; y1: number; x2: number; y2: number }[];
          halfWidth: number;
      };

export interface ReactionFrameRequest {
    /** The enemy unit running the attack. Only units hostile to it are considered. */
    sourceUnitId: string;
    /** What the attack threatens; a player is "inside" when its body overlaps this. */
    area: ReactionArea;
    /** Stored as `reactionPending.abilityId`: the attack's ability id, or a name for non-ability attacks. */
    label: string;
}

/** Context handed to an interval's `reactionFrame.area` resolver. */
export interface ReactionFrameAreaContext {
    caster: Unit;
    engine: EngineContext;
    targets: readonly import('../types').ResolvedTarget[];
    abilityId: string;
    castPayload: unknown;
}

/** Declared on an `AbilityTimingInterval` of a `reactable` ability. */
export interface ReactionFrameDef {
    /** Fire when the window opens or when it closes. */
    at: 'start' | 'end';
    /** The telegraphed area at that moment; null means nothing is threatened (no frame). */
    area: (context: ReactionFrameAreaContext) => ReactionArea | null;
}

function distanceToSegmentSq(
    px: number,
    py: number,
    seg: { x1: number; y1: number; x2: number; y2: number },
): number {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq));
    const cx = seg.x1 + t * dx;
    const cy = seg.y1 + t * dy;
    return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/** Whether `unit`'s body overlaps `area`. */
export function unitInReactionArea(unit: Unit, area: ReactionArea): boolean {
    if (area.kind === 'circle') {
        const reach = area.radius + unit.radius;
        const dx = unit.x - area.x;
        const dy = unit.y - area.y;
        return dx * dx + dy * dy <= reach * reach;
    }
    const reach = area.halfWidth + unit.radius;
    return area.segments.some((s) => distanceToSegmentSq(unit.x, unit.y, s) <= reach * reach);
}

/** The one rule for "may this unit be offered a Reaction": a living player unit that knows Reactions and has Reflex. */
export function unitCanReact(engine: Pick<EngineContext, 'playerKnowledgeKeysByPlayer'>, unit: Unit): boolean {
    if (!unit.active || !unit.isAlive() || !unit.isPlayerControlled()) return false;
    if (!playerKnowsReactions(engine, unit.ownerId)) return false;
    const reflex = unit.getResource(ResourceId.Reflex);
    return reflex !== undefined && reflex.current >= 1;
}

/** Player units that would be paused by this frame, in the deterministic waiter order. */
export function collectReactionThreatened(engine: EngineContext, request: ReactionFrameRequest): Unit[] {
    const source = engine.getUnit(request.sourceUnitId);
    if (!source) return [];
    const out = engine.units.filter(
        (u) => areEnemies(source.teamId, u.teamId) && unitCanReact(engine, u) && unitInReactionArea(u, request.area),
    );
    out.sort((a, b) => (a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.id.localeCompare(b.id)));
    return out;
}

/**
 * Open a reaction frame: mark each threatened player `reactionPending` and add it as a waiter of this tick's
 * deferred pause. A unit that already has a pending reaction (another frame this tick) keeps the first.
 * Returns the units that were paused.
 */
export function requestReactionFrame(engine: EngineContext, request: ReactionFrameRequest): Unit[] {
    const threatened = collectReactionThreatened(engine, request);
    for (const unit of threatened) {
        if (!unit.reactionPending) {
            unit.reactionPending = { abilityId: request.label, casterId: request.sourceUnitId };
        }
        engine.requestReactionPause(unit);
    }
    return threatened;
}

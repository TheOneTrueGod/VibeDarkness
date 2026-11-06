/**
 * Arrange — reusable CastBehaviour that glides a group of OTHER units into new positions over its
 * window (a summoner rearranging crystals, a commander dressing a line of turrets).
 *
 * On the window's first tick it picks the units (`units`), asks for their destinations (`slots`, usually
 * `formationSlots` + `fitSlotsToTerrain`), pairs them shortest-move-first (`assignUnitsToSlots`) and stores
 * the moves in the behaviour payload, so the glide is serialized and identical in preview and committed
 * runs. Each tick then places every unit on its eased path; the last tick lands them exactly. The units
 * fly (no terrain collision on the way) and their own walking is cleared when they are picked up.
 * Interrupting the cast leaves the units wherever they had got to.
 *
 * Usage:
 *   CastBehaviours.Arrange({
 *       units: (ctx) => getBoundUnits(ctx.engine.units, ctx.caster, 'court_crystal'),
 *       slots: (ctx, units) => fitSlotsToTerrain(formationSlots(shape, units.length, {...}), ctx.engine.terrainManager),
 *   })
 */

import type { Unit } from '../../game/units/Unit';
import type { CastBehaviour, CastBehaviourTickContext } from '../castBehaviourTypes';
import { assignUnitsToSlots, type FormationPoint } from '../../game/formations/formationDef';
import { easeInOutQuad } from '../easing';

export interface ArrangeConfig {
    /** Units to move, resolved once when the window opens. */
    units: (ctx: CastBehaviourTickContext) => Unit[];
    /** Destinations for those units (any order; pairing is shortest-move-first). */
    slots: (ctx: CastBehaviourTickContext, units: Unit[]) => FormationPoint[];
    /** Progress curve of the glide (default ease-in-out). */
    easing?: (t: number) => number;
    /**
     * Leave units that are casting alone: busy ones are not planned, and a unit that starts casting
     * mid-glide is released where it is (it is not moved again, and gets no `onArrive`).
     */
    leaveCastingUnits?: boolean;
    /**
     * Carry the units through the air (`Unit.claimFlight`) instead of along the ground: they pass over rock
     * and walls without being ejected or shattering it. The landing tick is on the ground again, so a unit
     * whose slot is rock lands in it (a structure shatters it, anything else is pushed out).
     */
    flight?: boolean;
    /** Called once per unit when it lands on its slot (VFX). */
    onArrive?: (ctx: CastBehaviourTickContext, unit: Unit) => void;
}

export interface ArrangeMove {
    unitId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    /** Released by `leaveCastingUnits` (started casting mid-glide). */
    released?: boolean;
}

export interface ArrangePayload {
    moves: ArrangeMove[];
}

function readPayload(raw: unknown): ArrangePayload | null {
    const p = raw as Partial<ArrangePayload> | undefined;
    return p && Array.isArray(p.moves) ? (p as ArrangePayload) : null;
}

/** Plan the moves for `units` onto `slots` (exported for previews and tests). */
export function planArrangeMoves(units: readonly Unit[], slots: readonly FormationPoint[]): ArrangeMove[] {
    const byId = new Map(units.map((u) => [u.id, u]));
    return assignUnitsToSlots(units, slots).map(({ unitId, slot }) => {
        const u = byId.get(unitId)!;
        return { unitId, fromX: u.x, fromY: u.y, toX: slot.x, toY: slot.y };
    });
}

export class ArrangeBehaviour implements CastBehaviour {
    constructor(private readonly config: ArrangeConfig) {}

    onTick(ctx: CastBehaviourTickContext): void {
        let payload = readPayload(ctx.behaviourPayload);
        if (!payload) {
            const units = this.config
                .units(ctx)
                .filter((u) => u.isAlive() && !(this.config.leaveCastingUnits && u.activeAbilities.length > 0));
            const moves = planArrangeMoves(units, this.config.slots(ctx, units));
            for (const m of moves) ctx.engine.getUnit(m.unitId)?.clearMovement();
            payload = { moves };
            ctx.setBehaviourPayload(payload);
        }
        const ease = this.config.easing ?? easeInOutQuad;
        const t = ctx.isLastTick ? 1 : ease(Math.max(0, Math.min(1, ctx.windowProgress)));
        for (const m of payload.moves) {
            const unit = ctx.engine.getUnit(m.unitId);
            if (!unit?.isAlive() || m.released) continue;
            if (this.config.leaveCastingUnits && unit.activeAbilities.length > 0) {
                m.released = true;
                ctx.setBehaviourPayload(payload);
                continue;
            }
            unit.x = m.fromX + (m.toX - m.fromX) * t;
            unit.y = m.fromY + (m.toY - m.fromY) * t;
            if (this.config.flight && !ctx.isLastTick) unit.claimFlight();
            else unit.claimAbilityMovement();
            if (ctx.isLastTick) this.config.onArrive?.(ctx, unit);
        }
    }
}

export function Arrange(config: ArrangeConfig): ArrangeBehaviour {
    return new ArrangeBehaviour(config);
}

/** Planned moves of an in-flight Arrange window (for active previews), or null before it opens. */
export function readArrangeMoves(behaviourPayload: unknown): ArrangeMove[] | null {
    return readPayload(behaviourPayload)?.moves ?? null;
}

import type { Unit } from '../game/units/Unit';
import type { HitboxEngineContext } from '../hitboxes/Hitbox';
import { CircleHitbox } from '../hitboxes/CircleHitbox';
import { ThickLineHitbox } from '../hitboxes/ThickLineHitbox';
import { clampToMaxRange } from './previewHelpers';

export type HitboxDef =
    | { shape: 'circle';    range: number }
    | { shape: 'meleeLine'; range: number; thickness: number }
    | { shape: 'cone';      range: number; halfAngle: number }
    | { shape: 'custom';    resolve: (caster: Unit, aimPoint: { x: number; y: number }, units: Unit[]) => Unit[] };

export interface ResolveHitboxContext {
    engine: HitboxEngineContext;
    caster: Unit;
    originX: number;
    originY: number;
    aimX: number;
    aimY: number;
    priorityUnitId?: string;
}

/**
 * Dispatches to the appropriate hitbox class and applies priority-unit ordering.
 * If priorityUnitId is set: the priority unit must be in the hitbox to get any results
 * (returns empty list if priority unit is absent — a miss), and is moved to index 0 if present.
 */
export function resolveHitbox(def: HitboxDef, ctx: ResolveHitboxContext): Unit[] {
    const { engine, caster, originX, originY, aimX, aimY } = ctx;
    let units: Unit[];

    switch (def.shape) {
        case 'circle':
            units = CircleHitbox.getUnitsInHitbox(engine, caster, originX, originY, def.range);
            break;
        case 'meleeLine': {
            const clamped = clampToMaxRange(
                { x: originX, y: originY },
                { x: aimX, y: aimY },
                def.range,
            );
            units = ThickLineHitbox.getUnitsInHitbox(
                engine, caster,
                originX, originY,
                clamped.endX, clamped.endY,
                def.thickness,
            );
            break;
        }
        case 'cone':
            // stub — not implemented in MVP
            units = [];
            break;
        case 'custom':
            units = def.resolve(caster, { x: aimX, y: aimY }, engine.units);
            break;
    }

    // Apply priority unit logic
    if (ctx.priorityUnitId) {
        const priorityIdx = units.findIndex(u => u.id === ctx.priorityUnitId);
        if (priorityIdx === -1) {
            // Priority unit not in hitbox — miss
            return [];
        }
        if (priorityIdx !== 0) {
            // Move priority unit to front
            const [priorityUnit] = units.splice(priorityIdx, 1);
            units.unshift(priorityUnit);
        }
    }

    return units;
}

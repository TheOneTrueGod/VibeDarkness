/**
 * Shared helpers for abilities with the 'meleeTracking' tag.
 *
 * Lock-break logic is shared with windup telegraph tracking via targetLockTracking.ts.
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from './Ability';
import type { HitboxEngineContext } from '../hitboxes/Hitbox';
import {
    evaluateTargetLockBreak,
    getLockOnRange,
    resolveTrackingAimPoint,
    spawnDodgedFloatingText,
} from './targetLockTracking';

/** @deprecated Use LOCK_ON_TETHER_EXTRA from targetLockTracking.ts */
export const MELEE_TRACKING_TETHER_EXTRA = 100;

export interface MeleeTrackingEntry {
    unitId: string | null;
    lockedPosition: { x: number; y: number } | null;
}

export function buildMeleeTrackingEntries(hitUnitsBySlot: (Unit | null)[]): MeleeTrackingEntry[] {
    return hitUnitsBySlot.map((unit) => ({
        unitId: unit?.id ?? null,
        lockedPosition: null,
    }));
}

interface TrackingEngineContext {
    getUnit(id: string): Unit | undefined;
    addEffect: (effect: import('../game/effects/Effect').Effect) => void;
    gameTime: number;
}

export function updateMeleeTrackingEntry(
    engine: TrackingEngineContext,
    caster: Unit,
    entry: MeleeTrackingEntry,
    maxRange: number,
): void {
    if (entry.unitId === null || entry.lockedPosition !== null) return;
    const unit = engine.getUnit(entry.unitId);
    if (!unit) return;

    const lockPos = evaluateTargetLockBreak(caster, unit, getLockOnRange(maxRange));
    if (lockPos) {
        entry.lockedPosition = lockPos;
        spawnDodgedFloatingText(engine, lockPos.x, lockPos.y);
    }
}

export function getMeleeTrackingAimPoint(
    engine: { getUnit(id: string): Unit | undefined },
    entry: MeleeTrackingEntry,
    fallbackPos: { x: number; y: number },
): { x: number; y: number } {
    return resolveTrackingAimPoint(engine, entry.unitId, entry.lockedPosition, fallbackPos);
}

export function renderMeleeTrackingHighlights(gr: IAbilityPreviewGraphics, hitUnits: Unit[]): void {
    for (const unit of hitUnits) {
        gr.circle(unit.x, unit.y, unit.radius + 4);
        gr.stroke({ color: 0xff2222, width: 2.5, alpha: 0.4 });
    }
}

export function buildHitboxContext(units: Unit[]): HitboxEngineContext {
    return {
        units,
        getUnit: (id: string) => units.find((u) => u.id === id),
    };
}

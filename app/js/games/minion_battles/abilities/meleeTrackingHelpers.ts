/**
 * Shared helpers for abilities with the 'meleeTracking' tag.
 *
 * A MeleeTrackingEntry captures a unit ID at commit time. Each tick,
 * updateMeleeTrackingEntry checks whether the unit has used an evade ability
 * or left the tether range; if so, it locks lockedPosition and spawns a
 * "Dodged" text. getMeleeTrackingAimPoint resolves the final aim position
 * (locked > live unit > fallback pixel).
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from './Ability';
import { abilityHasTag } from './Ability';
import { Effect } from '../game/effects/Effect';
import type { HitboxEngineContext } from '../hitboxes/Hitbox';
import type { DamageNumberMotionData } from '../game/effects/damageNumberMotion';

export const MELEE_TRACKING_TETHER_EXTRA = 50;

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
    addEffect(effect: Effect): void;
    gameTime: number;
}

function spawnDodgedEffect(engine: TrackingEngineContext, x: number, y: number): void {
    const motionData: DamageNumberMotionData = {
        amount: 0,
        color: 0xfacc15,
        originX: x,
        originY: y,
        dirX: 0,
        dirY: -1,
        flightPx: 48,
        arcPx: 36,
    };
    engine.addEffect(
        new Effect({
            x,
            y,
            duration: 0.92,
            effectType: 'FloatingText',
            effectData: motionData,
        }),
    );
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

    const hasEvadeActive = unit.activeAbilities.some((a) => abilityHasTag(a.abilityId, 'evade'));
    if (hasEvadeActive) {
        entry.lockedPosition = { x: unit.x, y: unit.y };
        spawnDodgedEffect(engine, unit.x, unit.y);
        return;
    }

    const dx = unit.x - caster.x;
    const dy = unit.y - caster.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const tetherRange = maxRange + MELEE_TRACKING_TETHER_EXTRA;
    if (dist > tetherRange) {
        entry.lockedPosition = { x: unit.x, y: unit.y };
        spawnDodgedEffect(engine, unit.x, unit.y);
    }
}

export function getMeleeTrackingAimPoint(
    engine: { getUnit(id: string): Unit | undefined },
    entry: MeleeTrackingEntry,
    fallbackPos: { x: number; y: number },
): { x: number; y: number } {
    if (entry.lockedPosition !== null) return entry.lockedPosition;
    if (entry.unitId !== null) {
        const unit = engine.getUnit(entry.unitId);
        if (unit) return { x: unit.x, y: unit.y };
    }
    return fallbackPos;
}

export function renderMeleeTrackingHighlights(gr: IAbilityPreviewGraphics, hitUnits: Unit[]): void {
    for (const unit of hitUnits) {
        gr.circle(unit.x, unit.y, unit.radius + 4);
        gr.stroke({ color: 0xff2222, width: 2.5, alpha: 0.85 });
    }
}

export function buildHitboxContext(units: Unit[]): HitboxEngineContext {
    return {
        units,
        getUnit: (id: string) => units.find((u) => u.id === id),
    };
}

/**
 * Global damage feedback: floating damage numbers for any HP loss from Unit.takeDamage.
 */

import type { DamageTakenEvent } from './EventBus';
import type { Unit } from './units/Unit';
import { Effect } from './effects/Effect';
import { buildDamageNumberMotionFields, type DamageNumberMotionData } from './effects/damageNumberMotion';
import { getCreatureType } from './units/unit_defs/unitDef';

export interface DamageTakenEffectContext {
    addEffect(effect: Effect): void;
    generateRandomInteger(min: number, max: number): number;
    getUnit(id: string): Unit | undefined;
}

/** Match bleed-tick palette: dark creatures read as “no blood” purple, others red. */
const DAMAGE_NUMBER_COLOR_DARK = 0xc084fc;
const DAMAGE_NUMBER_COLOR_STANDARD = 0xff3344;

function pickDamageNumberColor(unit: Unit): number {
    return getCreatureType(unit.characterId) === 'dark_creature' ? DAMAGE_NUMBER_COLOR_DARK : DAMAGE_NUMBER_COLOR_STANDARD;
}

function spawnDamageNumberEffect(
    ctx: DamageTakenEffectContext,
    unit: Unit,
    amount: number,
    color: number,
    from: { x: number; y: number } | null,
): void {
    const motion = buildDamageNumberMotionFields(unit.x, unit.y, (a, b) => ctx.generateRandomInteger(a, b), from);
    const effectData: DamageNumberMotionData = {
        amount,
        color,
        ...motion,
    };
    ctx.addEffect(
        new Effect({
            x: unit.x,
            y: unit.y,
            duration: 0.92,
            effectType: 'DamageNumber',
            effectData,
        }),
    );
}

/**
 * Spawn VFX for combat damage: a parabolic DamageNumber at the victim.
 * Uses source unit position for flight direction when `sourceUnitId` resolves to a live unit.
 */
export function createDamageTakenEffect(ctx: DamageTakenEffectContext, ev: DamageTakenEvent): void {
    if (ev.amount <= 0) return;
    const unit = ctx.getUnit(ev.unitId);
    if (!unit) return;

    const color = pickDamageNumberColor(unit);
    let from: { x: number; y: number } | null = null;
    if (ev.sourceUnitId) {
        const src = ctx.getUnit(ev.sourceUnitId);
        if (src?.isAlive()) {
            from = { x: src.x, y: src.y };
        }
    }
    spawnDamageNumberEffect(ctx, unit, ev.amount, color, from);
}

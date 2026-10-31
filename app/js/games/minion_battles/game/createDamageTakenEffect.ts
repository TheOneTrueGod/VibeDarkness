/**
 * Global HP feedback: floating damage numbers for any HP loss from Unit.takeDamage, and green
 * "+N" numbers for heals that report through `applyHeal`'s feedback.
 */

import { DAMAGE_VISUAL_KIND_DAYLIGHT, type DamageTakenEvent, type UnitHealedEvent } from './EventBus';
import type { Unit } from './units/Unit';
import { Effect } from './effects/Effect';
import { buildDamageNumberMotionFields, type DamageNumberMotionData } from './effects/damageNumberMotion';
import { getCreatureType } from './units/unit_defs/unitDef';
import { DAYLIGHT_SEAR_EFFECT_TYPE } from './effect_defs/dayLightEffects';
import { DAYLIGHT_DAMAGE_NUMBER_COLOR, DAYLIGHT_SEAR_DURATION_SEC } from './lighting/dayLightVfx';

export interface DamageTakenEffectContext {
    addEffect(effect: Effect): void;
    generateRandomInteger(min: number, max: number): number;
    getUnit(id: string): Unit | undefined;
}

/** Match bleed-tick palette: dark creatures read as “no blood” purple, others red. */
const DAMAGE_NUMBER_COLOR_DARK = 0xc084fc;
const DAMAGE_NUMBER_COLOR_NATURE = 0x4ade80; // green-400
const DAMAGE_NUMBER_COLOR_STANDARD = 0xff3344;
/** Heals read as green with a "+" so they never look like nature-creature damage. */
export const HEAL_NUMBER_COLOR = 0x4ade80;
export const HEAL_NUMBER_PREFIX = '+';

function pickDamageNumberColor(unit: Unit, visualKind?: DamageTakenEvent['visualKind']): number {
    if (visualKind === DAMAGE_VISUAL_KIND_DAYLIGHT) return DAYLIGHT_DAMAGE_NUMBER_COLOR;
    const ct = getCreatureType(unit.characterId);
    if (ct === 'dark_creature') return DAMAGE_NUMBER_COLOR_DARK;
    if (ct === 'nature') return DAMAGE_NUMBER_COLOR_NATURE;
    return DAMAGE_NUMBER_COLOR_STANDARD;
}

function spawnDamageNumberEffect(
    ctx: DamageTakenEffectContext,
    unit: Unit,
    amount: number,
    color: number,
    from: { x: number; y: number } | null,
    prefix?: string,
): void {
    const motion = buildDamageNumberMotionFields(unit.x, unit.y, (a, b) => ctx.generateRandomInteger(a, b), from);
    const effectData: DamageNumberMotionData & { prefix?: string } = {
        amount,
        color,
        ...motion,
        ...(prefix ? { prefix } : {}),
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

    const color = pickDamageNumberColor(unit, ev.visualKind);
    let from: { x: number; y: number } | null = null;
    if (ev.sourceUnitId) {
        const src = ctx.getUnit(ev.sourceUnitId);
        if (src?.isAlive()) {
            from = { x: src.x, y: src.y };
        }
    }
    spawnDamageNumberEffect(ctx, unit, ev.amount, color, from);
    if (ev.visualKind === DAMAGE_VISUAL_KIND_DAYLIGHT) {
        ctx.addEffect(
            new Effect({
                x: unit.x,
                y: unit.y,
                duration: DAYLIGHT_SEAR_DURATION_SEC,
                effectType: DAYLIGHT_SEAR_EFFECT_TYPE,
                effectRadius: unit.radius,
            }),
        );
    }
}

/**
 * Spawn a green "+N" number at the healed unit. Fractional heals are rounded; a heal that rounds
 * to 0 shows nothing. Flight direction comes from the source, like damage numbers.
 */
export function createHealEffect(ctx: DamageTakenEffectContext, ev: UnitHealedEvent): void {
    const shown = Math.round(ev.amount);
    if (shown <= 0) return;
    const unit = ctx.getUnit(ev.unitId);
    if (!unit) return;
    let from: { x: number; y: number } | null = null;
    if (ev.sourceUnitId && ev.sourceUnitId !== unit.id) {
        const src = ctx.getUnit(ev.sourceUnitId);
        if (src?.isAlive()) from = { x: src.x, y: src.y };
    }
    spawnDamageNumberEffect(ctx, unit, shown, HEAL_NUMBER_COLOR, from, HEAL_NUMBER_PREFIX);
}

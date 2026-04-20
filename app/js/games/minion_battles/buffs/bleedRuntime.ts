/**
 * Bleed application and round-milestone tick damage.
 */

import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';
import { Effect } from '../game/effects/Effect';
import { PARTICLE_EXPLOSION_DURATION_SECONDS } from '../game/deathEffects/ParticleExplosion';
import { getCreatureType } from '../game/units/unit_defs/unitDef';
import { BleedBuff, BLEED_BUFF_TYPE } from './BleedBuff';

/** Damage dealt on each bleed milestone tick = this value × current stacks (before losing one stack). */
export const BLEED_TICK_DAMAGE_PER_STACK = 5;

const MINI_DISSOLUTION_PARTICLE_COUNT = 6;

export interface BleedDamageFxContext {
    addEffect(effect: Effect): void;
    generateRandomInteger(min: number, max: number): number;
}

function spawnMiniDarkDissolutionParticles(unit: Unit, fx: BleedDamageFxContext): void {
    for (let i = 0; i < MINI_DISSOLUTION_PARTICLE_COUNT; i++) {
        const angle = (fx.generateRandomInteger(0, 6283) / 1000) * 2 * Math.PI;
        const speed = 70 + (fx.generateRandomInteger(0, 1000) / 1000) * 160;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        fx.addEffect(
            new Effect({
                x: unit.x,
                y: unit.y,
                duration: PARTICLE_EXPLOSION_DURATION_SECONDS,
                effectType: 'ParticleImage',
                effectData: {
                    imageKey: 'darkBlob',
                    vx,
                    vy,
                    scale: 0.45 + (fx.generateRandomInteger(0, 1000) / 1000) * 0.45,
                },
            }),
        );
    }
}

/** Extra VFX for dark-creature bleed ticks (floating number comes from `createDamageTakenEffect`). */
function spawnBleedDamageVisuals(unit: Unit, actualDamage: number, fx: BleedDamageFxContext): void {
    if (actualDamage <= 0) return;
    const creature = getCreatureType(unit.characterId);
    if (creature !== 'dark_creature') return;
    spawnMiniDarkDissolutionParticles(unit, fx);
}

function findBleedBuff(unit: Unit): BleedBuff | undefined {
    for (const b of unit.buffs) {
        if (b._type === BLEED_BUFF_TYPE && b instanceof BleedBuff) return b;
    }
    return undefined;
}

/** Add one bleed stack to the unit (merges into a single BleedBuff). */
export function applyBleedStack(unit: Unit, gameTime: number, roundNumber: number): void {
    if (!unit.isAlive()) return;
    const existing = findBleedBuff(unit);
    if (existing) {
        existing.stacks += 1;
        return;
    }
    unit.addBuff(new BleedBuff(1), gameTime, roundNumber);
}

/**
 * At each round-timer milestone (0% and 50%), units with bleed take
 * (BLEED_TICK_DAMAGE_PER_STACK × stacks) damage, then lose one stack.
 */
export function tickBleedForRoundMilestone(
    units: readonly Unit[],
    eventBus: EventBus,
    fx?: BleedDamageFxContext,
): void {
    for (const unit of units) {
        if (!unit.isAlive()) continue;
        const bleed = findBleedBuff(unit);
        if (!bleed || bleed.stacks <= 0) continue;

        const damage = BLEED_TICK_DAMAGE_PER_STACK * bleed.stacks;
        const actual = unit.takeDamage(damage, null, eventBus);
        bleed.stacks -= 1;
        if (fx) {
            spawnBleedDamageVisuals(unit, actual, fx);
        }
    }
}

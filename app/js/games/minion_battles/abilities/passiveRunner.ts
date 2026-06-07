/**
 * Passive ability runner — called once per simulation tick for every alive unit.
 *
 * processUnitPassives checks each ability registered on the unit for a `passive` def;
 * if the trigger condition is met this tick, it applies the declared effects.
 */

import { getAbility } from './AbilityRegistry';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import type { PassiveDef, PassiveEffect, PassiveTrigger, PassiveTargetFilter } from './passiveDef';
import { getCreatureType } from '../game/units/unit_defs/unitDef';
import { areEnemies } from '../game/teams';
import { Effect } from '../game/effects/Effect';

function shouldFire(trigger: PassiveTrigger, gameTime: number, dt: number): boolean {
    if (trigger.type === 'onTick') {
        const prev = Math.floor((gameTime - dt) / trigger.intervalSec);
        const curr = Math.floor(gameTime / trigger.intervalSec);
        return curr > prev;
    }
    return false;
}

function matchesFilter(target: Unit, filter: PassiveTargetFilter, caster: Unit): boolean {
    if (filter.creatureType !== undefined && getCreatureType(target.characterId) !== filter.creatureType) {
        return false;
    }
    if (filter.teamRelation === 'enemy' && !areEnemies(caster.teamId, target.teamId)) return false;
    if (filter.teamRelation === 'ally' && areEnemies(caster.teamId, target.teamId)) return false;
    return true;
}

function applyEffects(caster: Unit, effects: PassiveEffect[], engine: EngineContext): void {
    for (const effect of effects) {
        if (effect.type === 'aoe_damage') {
            for (const target of engine.units) {
                if (!target.isAlive()) continue;
                if (!matchesFilter(target, effect.targetFilter, caster)) continue;
                if (effect.range !== undefined) {
                    const dx = target.x - caster.x;
                    const dy = target.y - caster.y;
                    if (dx * dx + dy * dy > effect.range * effect.range) continue;
                }
                target.takeDamage(effect.damage, caster.id, engine.eventBus);
            }
            if (effect.pulseRadius !== undefined) {
                engine.addEffect(new Effect({
                    x: caster.x,
                    y: caster.y,
                    duration: 0.55,
                    effectType: 'AuraPulse',
                    effectData: {
                        pulseRadius: effect.pulseRadius,
                        startRadius: caster.radius,
                    },
                }));
            }
        }
    }
}

function processPassive(unit: Unit, passive: PassiveDef, dt: number, engine: EngineContext): void {
    if (shouldFire(passive.trigger, engine.gameTime, dt)) {
        applyEffects(unit, passive.effects, engine);
    }
}

export function processUnitPassives(unit: Unit, dt: number, engine: EngineContext): void {
    if (!unit.isAlive()) return;
    for (const abilityId of unit.abilities) {
        const ability = getAbility(abilityId);
        if (!ability?.passive) continue;
        processPassive(unit, ability.passive, dt, engine);
    }
}

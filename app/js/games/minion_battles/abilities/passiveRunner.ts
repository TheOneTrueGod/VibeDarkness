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
import { rasterizeArea } from '../game/TerrainLayerManager';
import { CELL_SIZE } from '../terrain/TerrainGrid';

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
            let hitSomething = false;
            for (const target of engine.units) {
                if (!target.isAlive()) continue;
                if (!matchesFilter(target, effect.targetFilter, caster)) continue;
                if (effect.range !== undefined) {
                    const dx = target.x - caster.x;
                    const dy = target.y - caster.y;
                    if (dx * dx + dy * dy > effect.range * effect.range) continue;
                }
                const dealt = target.takeDamage(effect.damage, caster.id, engine.eventBus);
                if (dealt > 0) hitSomething = true;
            }
            if (hitSomething && effect.pulseRadius !== undefined) {
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
        } else if (effect.type === 'place_terrain') {
            // 1. Rasterize a circle around the caster.
            const candidates = rasterizeArea({
                type: 'circle',
                x: caster.x,
                y: caster.y,
                radiusPx: effect.range,
            });

            // 2. Filter out cells already carrying this effect type on the ground layer.
            const eligible = candidates.filter(({ col, row }) => {
                const existing = engine.terrainLayers.getGroundEffectAt(col, row);
                return existing?.effectType !== effect.effectType;
            });

            // 3. Sort by squared distance ascending, breaking ties by col then row.
            eligible.sort((a, b) => {
                const aCx = a.col * CELL_SIZE + CELL_SIZE / 2;
                const aCy = a.row * CELL_SIZE + CELL_SIZE / 2;
                const bCx = b.col * CELL_SIZE + CELL_SIZE / 2;
                const bCy = b.row * CELL_SIZE + CELL_SIZE / 2;
                const aDist = (aCx - caster.x) * (aCx - caster.x) + (aCy - caster.y) * (aCy - caster.y);
                const bDist = (bCx - caster.x) * (bCx - caster.x) + (bCy - caster.y) * (bCy - caster.y);
                if (aDist !== bDist) return aDist - bDist;
                if (a.col !== b.col) return a.col - b.col;
                return a.row - b.row;
            });

            // 4. Take the first `count` cells.
            const toPlace = eligible.slice(0, effect.count);

            // 5. Place terrain on each selected cell.
            for (const { col, row } of toPlace) {
                engine.terrainLayers.add({
                    id: `thorn-${caster.id}-${col}-${row}`,
                    layer: 'ground',
                    effectType: effect.effectType,
                    placedAtGameTime: engine.gameTime,
                    ownerUnitId: caster.id,
                    area: { type: 'cell', col, row },
                    params: {},
                });
            }

            // 6. Emit AuraPulse visual if at least one tile was placed.
            if (toPlace.length > 0 && effect.pulseRadius !== undefined) {
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

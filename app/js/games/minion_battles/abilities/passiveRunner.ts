/**
 * Passive ability runner — called once per simulation tick for every alive unit.
 *
 * processUnitPassives checks each ability registered on the unit for a `passive` def;
 * if the trigger condition is met this tick, it applies the declared effects.
 */

import { getAbility } from './AbilityRegistry';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import type {
    PassiveDef,
    PassiveEffect,
    PassiveEventTriggerType,
    PassivePlaceTerrainEffect,
    PassiveTrigger,
    PassiveTargetFilter,
} from './passiveDef';
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
                // Only used for the hitSomething > 0 check below; hp-damage-only is sufficient,
                // no need for the shield/armour breakdown.
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
            placeTerrain(caster, effect, engine);
        }
    }
}

/** Candidate cells for a place_terrain effect: a cell square around the caster, or a px circle. */
function placeTerrainCandidates(caster: Unit, effect: PassivePlaceTerrainEffect): Array<{ col: number; row: number }> {
    if (effect.cellRadius !== undefined) {
        const centerCol = Math.floor(caster.x / CELL_SIZE);
        const centerRow = Math.floor(caster.y / CELL_SIZE);
        const cells: Array<{ col: number; row: number }> = [];
        for (let row = centerRow - effect.cellRadius; row <= centerRow + effect.cellRadius; row++) {
            for (let col = centerCol - effect.cellRadius; col <= centerCol + effect.cellRadius; col++) {
                cells.push({ col, row });
            }
        }
        return cells;
    }
    return rasterizeArea({ type: 'circle', x: caster.x, y: caster.y, radiusPx: effect.range ?? 0 });
}

export function placeTerrain(caster: Unit, effect: PassivePlaceTerrainEffect, engine: EngineContext): void {
    const layer = effect.layer ?? 'ground';
    const expiresAtGameTime = effect.durationSec !== undefined ? engine.gameTime + effect.durationSec : undefined;
    const terrain = engine.terrainManager;

    // 1. Candidate cells around the caster, minus walls when asked.
    const candidates = placeTerrainCandidates(caster, effect).filter(
        ({ col, row }) =>
            !effect.skipImpassable ||
            !terrain ||
            terrain.isPassable(col * CELL_SIZE + CELL_SIZE / 2, row * CELL_SIZE + CELL_SIZE / 2),
    );

    // 2. Cells already carrying this effect type are skipped, or refreshed and skipped.
    const eligible = candidates.filter(({ col, row }) => {
        const existing = engine.terrainLayers.getEffectAt(layer, col, row);
        if (existing?.effectType !== effect.effectType) return true;
        if (effect.onExisting === 'refresh' && expiresAtGameTime !== undefined) {
            engine.terrainLayers.extendExpiry(existing.id, expiresAtGameTime);
        }
        return false;
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

    // 4. Take the first `count` cells (all of them when count is omitted).
    const toPlace = effect.count !== undefined ? eligible.slice(0, effect.count) : eligible;

    // 5. Place terrain on each selected cell. Ground thorns keep their legacy id prefix.
    const idPrefix = layer === 'ground' && expiresAtGameTime === undefined ? 'thorn' : effect.effectType;
    for (const { col, row } of toPlace) {
        engine.terrainLayers.add({
            id: `${idPrefix}-${caster.id}-${col}-${row}`,
            layer,
            effectType: effect.effectType,
            placedAtGameTime: engine.gameTime,
            expiresAtGameTime,
            ownerUnitId: caster.id,
            teamId: caster.teamId,
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

/** Fire every passive on the unit whose trigger is the given unit event (e.g. `onCellEnter`). */
export function processUnitPassiveEvent(unit: Unit, eventType: PassiveEventTriggerType, engine: EngineContext): void {
    if (!unit.isAlive()) return;
    for (const abilityId of unit.abilities) {
        const passive = getAbility(abilityId)?.passive;
        if (passive?.trigger.type !== eventType) continue;
        applyEffects(unit, passive.effects, engine);
    }
}

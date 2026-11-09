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
    PassiveSpawnUnitsEffect,
    PassiveTrigger,
    PassiveTargetFilter,
} from './passiveDef';
import { getCreatureType } from '../game/units/unit_defs/unitDef';
import { areEnemies } from '../game/teams';
import { Effect } from '../game/effects/Effect';
import { rasterizeArea } from '../game/TerrainLayerManager';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { spawnUnitsAtPoints } from './CastBehaviours/SpawnUnitsBehaviour';
import { pickCloneSpawnPositions } from '../game/displacer/clonePlacement';

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
        } else if (effect.type === 'spawn_units') {
            spawnUnitsAroundCaster(caster, effect, engine);
        }
    }
}

function spawnUnitsAroundCaster(caster: Unit, effect: PassiveSpawnUnitsEffect, engine: EngineContext): void {
    let count = effect.count;
    if (effect.maxLiving !== undefined) {
        const characterId = effect.template.characterId;
        const living = engine.units.filter(
            (u) => u !== caster && u.isAlive() && u.teamId === caster.teamId && u.characterId === characterId,
        ).length;
        count = Math.min(count, effect.maxLiving - living);
    }
    if (count <= 0) return;

    const positions = pickCloneSpawnPositions(
        { x: caster.x, y: caster.y },
        {
            count,
            radius: effect.placement.maxDistance,
            minDistanceFromCenter: effect.placement.minDistance,
            ...(effect.placement.minSpacing !== undefined ? { minSpacing: effect.placement.minSpacing } : {}),
            isFree: (x, y) => engine.terrainManager?.isPassable(x, y) ?? true,
            occupied: engine.units.filter((u) => u.isAlive()).map((u) => ({ x: u.x, y: u.y })),
            randomInt: (min, max) => engine.generateRandomInteger(min, max),
        },
    );
    const spawned = spawnUnitsAtPoints(caster, { ...effect.template, teamId: caster.teamId }, positions, engine);
    const hpFraction = caster.maxHp > 0 ? Math.max(0, Math.min(1, caster.hp / caster.maxHp)) : 1;
    spawned.forEach((unit, i) => {
        if (effect.inheritHpFraction) unit.hp = unit.maxHp * hpFraction;
        if (effect.pulseColors) {
            const at = positions[i]!;
            engine.addEffect(new Effect({
                x: at.x,
                y: at.y,
                duration: 0.5,
                effectType: 'Pulse',
                effectData: { colors: [...effect.pulseColors] },
            }));
        }
    });
}

type Point = { x: number; y: number };

/** Cells within `cellRadius` (Chebyshev) of the anchor's cell, row-major. */
function cellSquareAround(anchor: Point, cellRadius: number): Array<{ col: number; row: number }> {
    const centerCol = Math.floor(anchor.x / CELL_SIZE);
    const centerRow = Math.floor(anchor.y / CELL_SIZE);
    const cells: Array<{ col: number; row: number }> = [];
    for (let row = centerRow - cellRadius; row <= centerRow + cellRadius; row++) {
        for (let col = centerCol - cellRadius; col <= centerCol + cellRadius; col++) {
            cells.push({ col, row });
        }
    }
    return cells;
}

/** Candidate cells for a place_terrain effect: a cell square around the caster, or a px circle. */
function placeTerrainCandidates(anchor: Point, effect: PassivePlaceTerrainEffect): Array<{ col: number; row: number }> {
    if (effect.cellRadius !== undefined) return cellSquareAround(anchor, effect.cellRadius);
    return rasterizeArea({ type: 'circle', x: anchor.x, y: anchor.y, radiusPx: effect.range ?? 0 });
}

/**
 * Spillover cells for a place_terrain effect: free cells in the spillover square that the main
 * area did not already cover, in random order (engine RNG, so deterministic across clients).
 */
function pickSpilloverCells(
    anchor: Point,
    effect: PassivePlaceTerrainEffect,
    engine: EngineContext,
    layer: 'ground' | 'air',
    mainArea: Array<{ col: number; row: number }>,
    isUsable: (cell: { col: number; row: number }) => boolean,
    needed: number,
): Array<{ col: number; row: number }> {
    if (!effect.spillover || needed <= 0) return [];
    const covered = new Set(mainArea.map(({ col, row }) => `${col},${row}`));
    const pool = cellSquareAround(anchor, effect.spillover.cellRadius).filter(
        (cell) =>
            !covered.has(`${cell.col},${cell.row}`) &&
            isUsable(cell) &&
            engine.terrainLayers.getEffectAt(layer, cell.col, cell.row)?.effectType !== effect.effectType,
    );
    const picked: Array<{ col: number; row: number }> = [];
    while (picked.length < needed && pool.length > 0) {
        const index = engine.generateRandomInteger(0, pool.length - 1);
        picked.push(pool.splice(index, 1)[0]);
    }
    return picked;
}

/**
 * Place `effect`'s terrain around `anchor` (default: the caster's position) on behalf of `caster`.
 * The anchor is what a projectile landing, a thrown cloud or any non-self-centred cast passes in;
 * ownership, team and the pulse visual still follow the caster. Returns the cells that got terrain.
 */
export function placeTerrain(
    caster: Unit,
    effect: PassivePlaceTerrainEffect,
    engine: EngineContext,
    anchor: Point = caster,
): Array<{ col: number; row: number }> {
    const layer = effect.layer ?? 'ground';
    const expiresAtGameTime = effect.durationSec !== undefined ? engine.gameTime + effect.durationSec : undefined;
    const terrain = engine.terrainManager;

    // 1. Candidate cells around the caster, minus walls when asked.
    const isUsable = ({ col, row }: { col: number; row: number }): boolean =>
        !effect.skipImpassable ||
        !terrain ||
        terrain.isPassable(col * CELL_SIZE + CELL_SIZE / 2, row * CELL_SIZE + CELL_SIZE / 2);
    const mainArea = placeTerrainCandidates(anchor, effect);
    const candidates = mainArea.filter(isUsable);

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
        const aDist = (aCx - anchor.x) * (aCx - anchor.x) + (aCy - anchor.y) * (aCy - anchor.y);
        const bDist = (bCx - anchor.x) * (bCx - anchor.x) + (bCy - anchor.y) * (bCy - anchor.y);
        if (aDist !== bDist) return aDist - bDist;
        if (a.col !== b.col) return a.col - b.col;
        return a.row - b.row;
    });

    // 4. Take the first `count` cells (all of them when count is omitted).
    const toPlace = effect.count !== undefined ? eligible.slice(0, effect.count) : eligible;

    // 4b. Spillover: top up a short placement with random free cells around the main area.
    const wanted = effect.count ?? 1;
    toPlace.push(...pickSpilloverCells(anchor, effect, engine, layer, mainArea, isUsable, wanted - toPlace.length));

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
            x: anchor.x,
            y: anchor.y,
            duration: 0.55,
            effectType: 'AuraPulse',
            effectData: {
                pulseRadius: effect.pulseRadius,
                startRadius: caster.radius,
            },
        }));
    }
    return toPlace;
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

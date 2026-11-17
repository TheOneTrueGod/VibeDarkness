/**
 * Stem tethers: blocking walkers along their length, the leash, the Briar left by a dead tether, vine geometry and
 * a serialization round-trip.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
    buildTinyBattleEngine,
    placeTargetDummy,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import type { GameEngine } from '../GameEngine';
import type { Unit } from '../units/Unit';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainType } from '../../terrain/TerrainType';
import { createUnitFromSpawnConfig } from '../units/index';
import { serializeUnit } from '../units/unitToJSON';
import { applySerializedUnitState } from '../units/unitFromJSON';
import { linkNodeChild, unlinkNodeChild } from '../units/components/nodeTree';
import { setUnitMovement, updateUnit } from '../units/unitMovementTick';
import {
    TETHER_SEGMENTS,
    getTetherSegment,
    listLiveTethers,
    tetherCoveredTiles,
    tetherSwayPhase,
    tetherVinePoints,
} from './tether';

const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;
const DT = 1 / 60;

let engine: GameEngine;
afterEach(() => engine?.destroy());

function setup(): { parent: Unit; child: Unit; walker: Unit } {
    engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
    const parent = placeTargetDummy(engine, { x: cell(10), y: cell(4) }, 'parent');
    const child = placeTargetDummy(engine, { x: cell(10), y: cell(11) }, 'child');
    linkNodeChild(parent, child, { tetherMaxLength: 8 * CELL_SIZE });
    const walker = spawnTinyPlayerUnit(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        x: cell(7),
        y: cell(8),
        abilities: [],
    });
    return { parent, child, walker };
}

function walk(unit: Unit, toCol: number, row: number, seconds: number): void {
    setUnitMovement(unit, [{ col: toCol, row }], undefined, engine.gameTick);
    for (let i = 0; i < Math.round(seconds / DT); i++) {
        if (!unit.movement) break;
        updateUnit(unit, DT, engine);
    }
}

describe('tether', () => {
    it('exists while both ends live, follows them, and lists as a live tether', () => {
        const { parent, child } = setup();
        const seg = getTetherSegment(engine, child)!;
        expect(seg).toMatchObject({ parentId: 'parent', childId: 'child', ax: parent.x, by: child.y });
        child.x += 30;
        expect(getTetherSegment(engine, child)!.bx).toBe(child.x);
        expect(listLiveTethers(engine)).toHaveLength(1);
        child.takeDamage(child.maxHp * 10, null, engine.eventBus);
        expect(listLiveTethers(engine)).toHaveLength(0);
    });

    it('a living tether blocks a walk through it', () => {
        const { walker } = setup();
        walk(walker, 13, 8, 4);
        // Never gets past the vine at x = col 10 (it holds on the near side).
        expect(walker.x).toBeLessThan(cell(10));
        expect(walker.x).toBeGreaterThan(cell(7));
    });

    it('the same walk is clear once the tether is cut (unlinked, so no Briar)', () => {
        const { parent, child, walker } = setup();
        unlinkNodeChild(parent, child);
        walk(walker, 13, 8, 4);
        expect(walker.x).toBeGreaterThan(cell(12));
    });

    it('does not block the units at its own ends', () => {
        const { parent, child } = setup();
        // The child walks across the line from a spot beside the parent end; the vine is its own.
        child.x = cell(11);
        child.y = cell(8);
        walk(child, 8, 8, 4);
        expect(child.x).toBeLessThan(cell(9));
        expect(parent.isAlive()).toBe(true);
    });

    it('leash: a child pushed beyond its max length is pulled back to it', () => {
        const { parent, child } = setup();
        child.x = cell(10);
        child.y = parent.y + 12 * CELL_SIZE;
        engine.stepSimulationFixedTicks(1);
        expect(Math.hypot(child.x - parent.x, child.y - parent.y)).toBeCloseTo(8 * CELL_SIZE, 3);
    });

    it('a dead tether leaves Briar on the tiles it covered', () => {
        const { parent, child } = setup();
        const col = Math.floor(child.x / CELL_SIZE);
        const rows = tetherCoveredTiles(parent.x, parent.y, child.x, child.y).map((t) => t.row);
        expect(rows.length).toBeGreaterThan(5);
        const terrain = engine.terrainManager!;
        expect(terrain.getEffectiveTerrainType(col, 8)).not.toBe(TerrainType.Briar);
        child.takeDamage(child.maxHp * 10, null, engine.eventBus);
        for (const row of rows) {
            expect(terrain.getEffectiveTerrainType(col, row)).toBe(TerrainType.Briar);
        }
        expect(terrain.getEffectiveTerrainType(col + 3, 8)).not.toBe(TerrainType.Briar);
    });

    it('an untethered link leaves no vine and no Briar', () => {
        engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        const parent = placeTargetDummy(engine, { x: cell(10), y: cell(4) }, 'parent');
        const child = placeTargetDummy(engine, { x: cell(10), y: cell(11) }, 'child');
        linkNodeChild(parent, child);
        expect(listLiveTethers(engine)).toHaveLength(0);
        child.takeDamage(child.maxHp * 10, null, engine.eventBus);
        expect(engine.terrainManager!.getEffectiveTerrainType(10, 8)).not.toBe(TerrainType.Briar);
    });

    it('vine points: pinned ends, travelling wave, stable phase per id', () => {
        const seg = { ax: 0, ay: 0, bx: 300, by: 0, childId: 'x' };
        const t0 = tetherVinePoints(seg, 0);
        const t1 = tetherVinePoints(seg, 0.5);
        expect(t0).toHaveLength(TETHER_SEGMENTS + 1);
        expect(t0[0]).toEqual({ x: 0, y: 0 });
        expect(t0[TETHER_SEGMENTS].x).toBeCloseTo(300, 6);
        expect(Math.abs(t0[TETHER_SEGMENTS].y)).toBeLessThan(1e-6);
        expect(t1[TETHER_SEGMENTS / 2].y).not.toBeCloseTo(t0[TETHER_SEGMENTS / 2].y, 3);
        expect(tetherSwayPhase('x')).toBe(tetherSwayPhase('x'));
        expect(tetherSwayPhase('x')).not.toBe(tetherSwayPhase('y'));
    });

    it('round-trips: a restored child still has its tether to the same parent', () => {
        const { child } = setup();
        const data = JSON.parse(JSON.stringify(serializeUnit(child, 0))) as Record<string, unknown>;
        const copy = createUnitFromSpawnConfig(
            { id: 'child2', characterId: child.characterId, name: 'c', hp: 10, x: child.x, y: child.y, teamId: 'enemy', ownerId: 'ai' },
            engine.eventBus,
            engine,
        );
        applySerializedUnitState(copy, data, engine.eventBus, 0);
        const seg = getTetherSegment(engine, copy)!;
        expect(seg.parentId).toBe('parent');
        expect(seg.maxLength).toBe(8 * CELL_SIZE);
    });
});

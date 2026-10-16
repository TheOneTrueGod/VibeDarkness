/**
 * Structures (UnitTag.Structure — nests etc.) cannot be pushed out of a wall. When rock rises on a
 * structure's tile it shatters into rubble and the structure takes its def-level
 * `terrainCrushDamage` once, instead of bouncing in place for repeated wall damage.
 */
import { describe, expect, it } from 'vitest';
import { buildTinyBattleEngine, TINY_BATTLE_PLAYER_ID } from '../../testing/harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from './index';
import { tickWallUnstick } from './unitWallUnstick';
import { TerrainType } from '../../terrain/TerrainType';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { DEFAULT_STRUCTURE_TERRAIN_CRUSH_DAMAGE, getUnitTerrainCrushDamage } from './unit_defs/unitDef';
import type { GameEngine } from '../GameEngine';
import type { EngineContext } from '../EngineContext';

const DT = 1 / 60;
const TILE = { col: 4, row: 4 };

function centre(col: number, row: number) {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

function spawn(engine: GameEngine, characterId: string, name: string) {
    const { x, y } = centre(TILE.col, TILE.row);
    const unit = createUnitFromSpawnConfig(
        { characterId, name, x, y, teamId: 'enemy', ownerId: 'ai' },
        engine.eventBus,
        engine,
    );
    engine.addUnit(unit, 'initialGameSpawn');
    return unit;
}

function tickFor(engine: GameEngine, unit: ReturnType<typeof spawn>, seconds: number): void {
    const ticks = Math.round(seconds / DT);
    for (let i = 0; i < ticks; i++) tickWallUnstick(unit, DT, engine as unknown as EngineContext);
}

describe('structures in rock', () => {
    it('a nest shatters rock raised on its tile and takes the crush damage exactly once', () => {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        const nest = spawn(engine, 'swarm_nest', 'Swarm Nest');
        const startPos = { x: nest.x, y: nest.y };
        const hp0 = nest.hp;

        engine.terrainManager!.createOrMarkRock(TILE.col, TILE.row);
        expect(engine.terrainManager!.isPassable(nest.x, nest.y)).toBe(false);

        tickFor(engine, nest, 1.0);

        expect(engine.terrainManager!.getEffectiveTerrainType(TILE.col, TILE.row)).toBe(TerrainType.Rubble);
        expect(hp0 - nest.hp).toBe(getUnitTerrainCrushDamage('swarm_nest'));
        expect(getUnitTerrainCrushDamage('swarm_nest')).toBe(DEFAULT_STRUCTURE_TERRAIN_CRUSH_DAMAGE);
        // Not pushed or bounced.
        expect(nest.x).toBe(startPos.x);
        expect(nest.y).toBe(startPos.y);
        expect(nest.knockback).toBeNull();
        expect(nest.isAlive()).toBe(true);

        // No further damage once the rock is gone.
        tickFor(engine, nest, 1.0);
        expect(hp0 - nest.hp).toBe(DEFAULT_STRUCTURE_TERRAIN_CRUSH_DAMAGE);
        engine.destroy();
    });

    it('applies to every structure, e.g. the lanternite and thornling nests', () => {
        for (const characterId of ['lanternite_nest', 'thornling_nest']) {
            const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
            const nest = spawn(engine, characterId, characterId);
            const hp0 = nest.hp;
            engine.terrainManager!.createOrMarkRock(TILE.col, TILE.row);
            tickFor(engine, nest, 0.5);
            expect(engine.terrainManager!.getEffectiveTerrainType(TILE.col, TILE.row)).toBe(TerrainType.Rubble);
            expect(hp0 - nest.hp).toBe(getUnitTerrainCrushDamage(characterId));
            engine.destroy();
        }
    });

    it('non-structures are still ejected from the rock instead of breaking it', () => {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        const slime = spawn(engine, 'slime', 'Slime');
        engine.terrainManager!.createOrMarkRock(TILE.col, TILE.row);
        tickFor(engine, slime, 0.2);
        expect(engine.terrainManager!.getEffectiveTerrainType(TILE.col, TILE.row)).toBe(TerrainType.Rock);
        expect(slime.knockback).not.toBeNull();
        engine.destroy();
    });
});

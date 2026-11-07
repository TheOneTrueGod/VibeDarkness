/**
 * A unit in a juggernaut window ignores wall ejection: rock rising under it does not bounce it out,
 * deal bounce damage, or interrupt it. Once the window ends the normal ejection applies.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTinyBattleEngine, TINY_BATTLE_PLAYER_ID } from '../../testing/harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from './index';
import { tickWallUnstick } from './unitWallUnstick';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { GameEngine } from '../GameEngine';
import type { EngineContext } from '../EngineContext';

const DT = 1 / 60;
const TILE = { col: 4, row: 4 };

function spawnSlime(engine: GameEngine) {
    const unit = createUnitFromSpawnConfig(
        {
            characterId: 'slime',
            name: 'Slime',
            x: TILE.col * CELL_SIZE + CELL_SIZE / 2,
            y: TILE.row * CELL_SIZE + CELL_SIZE / 2,
            teamId: 'enemy',
            ownerId: 'ai',
        },
        engine.eventBus,
        engine,
    );
    engine.addUnit(unit, 'initialGameSpawn');
    return unit;
}

function tickFor(engine: GameEngine, unit: ReturnType<typeof spawnSlime>, seconds: number): void {
    const ticks = Math.round(seconds / DT);
    for (let i = 0; i < ticks; i++) tickWallUnstick(unit, DT, engine as unknown as EngineContext);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('juggernaut in rock', () => {
    it('is not ejected, damaged or interrupted while the window lasts; ejection resumes after', () => {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        const slime = spawnSlime(engine);
        const start = { x: slime.x, y: slime.y };
        const hp0 = slime.hp;
        const juggernaut = vi.spyOn(slime, 'isInJuggernautWindow').mockReturnValue(true);
        const interrupt = vi.spyOn(slime, 'interruptAllAbilities');

        engine.terrainManager!.createOrMarkRock(TILE.col, TILE.row);
        tickFor(engine, slime, 1.0);

        expect(slime.knockback).toBeNull();
        expect(slime.hp).toBe(hp0);
        expect({ x: slime.x, y: slime.y }).toEqual(start);
        expect(slime.controlled).toBe(false);
        expect(interrupt).not.toHaveBeenCalled();

        juggernaut.mockReturnValue(false);
        tickFor(engine, slime, 0.2);
        expect(slime.knockback).not.toBeNull();
        expect(slime.hp).toBeLessThan(hp0);
        engine.destroy();
    });
});

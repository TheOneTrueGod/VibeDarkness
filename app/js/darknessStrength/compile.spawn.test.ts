import { describe, expect, it } from 'vitest';
import { GameEngine } from '../games/minion_battles/game/GameEngine';
import { resetGameObjectIdCounter } from '../games/minion_battles/game/GameObject';
import { TerrainGrid, CELL_SIZE } from '../games/minion_battles/terrain/TerrainGrid';
import { TerrainManager } from '../games/minion_battles/terrain/TerrainManager';
import { TerrainType } from '../games/minion_battles/terrain/TerrainType';
import { buildWorldModifiersFromSources } from '../games/minion_battles/worldModifiers/buildWorldModifiers';
import { compileWorldModifiers } from './compile';
import {
    DS_SWARM_REINFORCEMENTS_CHARACTER_ID,
    DS_SWARM_REINFORCEMENTS_COUNT,
    DS_SWARM_REINFORCEMENTS_ID,
    DS_SWARM_REINFORCEMENTS_SPAWN_BEHAVIOUR,
} from './packages/starters';
import { resolveActiveDarknessStrengths } from './resolve';

describe('compileWorldModifiers spawnTweak', () => {
    it('compiles ds_swarm_reinforcements into an on_round_start spawnUnits WM', () => {
        const active = resolveActiveDarknessStrengths({
            instances: [{ packageId: DS_SWARM_REINFORCEMENTS_ID }],
        });
        const wms = compileWorldModifiers(active);
        expect(wms).toHaveLength(1);
        const def = wms[0]!;
        expect(def.id).toBe(DS_SWARM_REINFORCEMENTS_ID);
        const rules = def.rules?.on_round_start;
        expect(rules).toHaveLength(1);
        const effect = rules![0]!.effects[0]!;
        expect(effect).toEqual({
            type: 'spawnUnits',
            characterId: DS_SWARM_REINFORCEMENTS_CHARACTER_ID,
            count: DS_SWARM_REINFORCEMENTS_COUNT,
            spawnBehaviour: DS_SWARM_REINFORCEMENTS_SPAWN_BEHAVIOUR,
            inDarkness: undefined,
        });
    });

    it('spawns swarmlings on round_start when campaign WM is installed (headless)', () => {
        resetGameObjectIdCounter(1);
        const grid = new TerrainGrid(10, 10, CELL_SIZE, TerrainType.Grass);
        const tm = new TerrainManager(grid);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1, terrainManager: tm });

        const active = resolveActiveDarknessStrengths({
            instances: [{ packageId: DS_SWARM_REINFORCEMENTS_ID }],
        });
        engine.setActiveDarknessStrengths(active);
        engine.state.worldModifierManager.install(
            buildWorldModifiersFromSources({
                campaign: compileWorldModifiers(active),
            }),
        );

        expect(engine.units.filter((u) => u.characterId === DS_SWARM_REINFORCEMENTS_CHARACTER_ID)).toHaveLength(
            0,
        );

        engine.eventBus.emit('round_start', { roundNumber: 1 });

        const swarmlings = engine.units.filter(
            (u) => u.characterId === DS_SWARM_REINFORCEMENTS_CHARACTER_ID && u.isAlive(),
        );
        expect(swarmlings).toHaveLength(DS_SWARM_REINFORCEMENTS_COUNT);

        engine.eventBus.emit('round_start', { roundNumber: 2 });
        const afterTwo = engine.units.filter(
            (u) => u.characterId === DS_SWARM_REINFORCEMENTS_CHARACTER_ID && u.isAlive(),
        );
        expect(afterTwo).toHaveLength(DS_SWARM_REINFORCEMENTS_COUNT * 2);

        engine.destroy();
    });
});

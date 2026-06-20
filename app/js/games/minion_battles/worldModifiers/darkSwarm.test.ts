import { describe, it, expect } from 'vitest';
import { GameEngine } from '../game/GameEngine';
import { resetGameObjectIdCounter } from '../game/GameObject';
import { darkSwarmModifier } from './presets';
import { buildWorldModifiersFromSources } from './buildWorldModifiers';
import { createUnitFromSpawnConfig } from '../game/units';

describe('Dark Swarm world modifier', () => {
    it('spawns a dark LightSource at swarmling death position with 5-round lifetime', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });

        engine.state.worldModifierManager.install(
            buildWorldModifiersFromSources({ mission: [darkSwarmModifier()] }),
        );

        const swarmling = createUnitFromSpawnConfig(
            {
                characterId: 'swarmling',
                name: 'Swarmling',
                x: 200,
                y: 300,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: ['0013'],
                aiSettings: { minRange: 0, maxRange: 70 },
            },
            engine.eventBus,
            engine,
        );
        engine.addUnit(swarmling);

        expect(engine.lightSources.filter((ls) => ls.active && ls.lightAmount < 0)).toHaveLength(0);

        swarmling.hp = 0;
        swarmling.active = false;
        engine.eventBus.emit('unit_died', { unitId: swarmling.id, killerUnitId: null });

        const darkLights = engine.lightSources.filter((ls) => ls.active && ls.lightAmount < 0);
        expect(darkLights).toHaveLength(1);

        const ls = darkLights[0]!;
        expect(ls.x).toBe(200);
        expect(ls.y).toBe(300);
        expect(ls.lightAmount).toBe(-4);
        expect(ls.decay.roundsTotal).toBe(5);

        engine.destroy();
    });

    it('does not spawn a dark LightSource when a non-swarmling dies', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });

        engine.state.worldModifierManager.install(
            buildWorldModifiersFromSources({ mission: [darkSwarmModifier()] }),
        );

        const boar = createUnitFromSpawnConfig(
            {
                characterId: 'boar',
                name: 'Boar',
                x: 100,
                y: 100,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                aiSettings: null,
            },
            engine.eventBus,
            engine,
        );
        engine.addUnit(boar);

        boar.hp = 0;
        boar.active = false;
        engine.eventBus.emit('unit_died', { unitId: boar.id, killerUnitId: null });

        const darkLights = engine.lightSources.filter((ls) => ls.active && ls.lightAmount < 0);
        expect(darkLights).toHaveLength(0);

        engine.destroy();
    });
});

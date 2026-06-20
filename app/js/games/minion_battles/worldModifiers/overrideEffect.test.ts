import { describe, it, expect } from 'vitest';
import { GameEngine } from '../game/GameEngine';
import { resetGameObjectIdCounter } from '../game/GameObject';
import { darkSwarmModifier } from './presets';
import { buildWorldModifiersFromSources } from './buildWorldModifiers';
import { createUnitFromSpawnConfig } from '../game/units';
import type { WorldModifierDef } from './types';

function setup(defs: WorldModifierDef[]) {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
    engine.state.worldModifierManager.install(
        buildWorldModifiersFromSources({ mission: defs }),
    );
    const swarmling = createUnitFromSpawnConfig(
        {
            characterId: 'swarmling',
            name: 'Swarmling',
            x: 200,
            y: 200,
            teamId: 'enemy',
            ownerId: 'ai',
            abilities: ['0013'],
            aiSettings: { minRange: 0, maxRange: 70 },
        },
        engine.eventBus,
        engine,
    );
    engine.addUnit(swarmling);
    return { engine, swarmling };
}

describe('overrideEffect stacking policy on spawnLightSource', () => {
    it('stack (default) — two modifiers at same tile both spawn a light source', () => {
        const modA = { ...darkSwarmModifier(), id: 'swarm_a' };
        const modB = { ...darkSwarmModifier(), id: 'swarm_b' };
        const { engine, swarmling } = setup([modA, modB]);

        swarmling.hp = 0;
        swarmling.active = false;
        engine.eventBus.emit('unit_died', { unitId: swarmling.id, killerUnitId: null });

        const darkLights = engine.lightSources.filter((ls) => ls.active && ls.lightAmount < 0);
        expect(darkLights).toHaveLength(2);

        engine.destroy();
    });

    it('replace — modifier B deactivates A\'s light and spawns its own', () => {
        // modA fires first (higher priority), then modB with 'replace' deactivates A's light.
        const modA = { ...darkSwarmModifier(), id: 'swarm_a', priority: 10 };
        const modB = {
            ...darkSwarmModifier({ lightAmount: -6 }),
            id: 'swarm_b',
            priority: 0,
            overrideEffect: { spawnLightSource: 'replace' as const },
        };
        const { engine, swarmling } = setup([modA, modB]);

        swarmling.hp = 0;
        swarmling.active = false;
        engine.eventBus.emit('unit_died', { unitId: swarmling.id, killerUnitId: null });

        const darkLights = engine.lightSources.filter((ls) => ls.active && ls.lightAmount < 0);
        expect(darkLights).toHaveLength(1);
        expect(darkLights[0]!.lightAmount).toBe(-6);

        engine.destroy();
    });

    it('max — stronger source wins; weaker spawn is skipped', () => {
        // modA fires first with lightAmount -8 (stronger), modB tries -4 but is skipped.
        const modA = { ...darkSwarmModifier({ lightAmount: -8 }), id: 'swarm_a', priority: 10 };
        const modB = {
            ...darkSwarmModifier({ lightAmount: -4 }),
            id: 'swarm_b',
            priority: 0,
            overrideEffect: { spawnLightSource: 'max' as const },
        };
        const { engine, swarmling } = setup([modA, modB]);

        swarmling.hp = 0;
        swarmling.active = false;
        engine.eventBus.emit('unit_died', { unitId: swarmling.id, killerUnitId: null });

        const darkLights = engine.lightSources.filter((ls) => ls.active && ls.lightAmount < 0);
        expect(darkLights).toHaveLength(1);
        expect(darkLights[0]!.lightAmount).toBe(-8);

        engine.destroy();
    });
});

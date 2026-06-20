import { describe, it, expect } from 'vitest';
import { GameEngine } from '../game/GameEngine';
import { resetGameObjectIdCounter } from '../game/GameObject';
import { createUnitFromSpawnConfig } from '../game/units';
import type { WorldModifierDef } from './types';

/** Minimal modifier: increments a counter on every on_unit_died. */
const COUNTER_MOD: WorldModifierDef = {
    id: 'test_counter_mod',
    name: 'Counter Mod',
    description: 'Increments a counter when any unit dies.',
    icon: '',
    rules: {
        on_unit_died: [
            {
                id: 'inc_death',
                conditions: [{ type: 'always' }],
                effects: [{ type: 'incrementCounter', counterId: 'deaths' }],
            },
        ],
    },
};

describe('WorldModifierManager mid-battle API', () => {
    it('fires effects for a dynamically added modifier', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });

        // No modifiers installed at start
        engine.state.worldModifierManager.install([]);

        // Dynamically add the counter modifier mid-battle
        engine.state.worldModifierManager.addModifier(COUNTER_MOD);

        const enemy = createUnitFromSpawnConfig(
            {
                characterId: 'boar',
                name: 'Boar',
                x: 200,
                y: 200,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                aiSettings: null,
            },
            engine.eventBus,
            engine,
        );
        engine.addUnit(enemy);

        enemy.hp = 0;
        enemy.active = false;
        engine.eventBus.emit('unit_died', { unitId: enemy.id, killerUnitId: null });

        // Counter should be 1 after one death
        const instances = engine.state.worldModifierManager.toJSON();
        const inst = instances.find((i) => i.id === 'test_counter_mod');
        expect(inst).toBeDefined();
        expect(inst!.counters['deaths']).toBe(1);

        engine.destroy();
    });

    it('dynamic modifier survives toJSON/fromJSON round-trip and fires after restore', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        engine.state.worldModifierManager.install([]);
        engine.state.worldModifierManager.addModifier(COUNTER_MOD);

        // Serialize
        const snapshot = engine.toJSON();
        engine.destroy();

        // Restore: fromJSON stashes snapshot; install([]) triggers merge of dynamic defs
        resetGameObjectIdCounter(1);
        const engine2 = GameEngine.fromJSON(snapshot, 'p1');
        engine2.state.worldModifierManager.install([]);

        // Dynamic modifier should be restored with isDynamic flag
        const instancesBefore = engine2.state.worldModifierManager.toJSON();
        const instBefore = instancesBefore.find((i) => i.id === 'test_counter_mod');
        expect(instBefore).toBeDefined();
        expect(instBefore!.dynamicDef).toBeDefined();
        expect(instBefore!.dynamicDef!.id).toBe('test_counter_mod');

        // And it still fires effects
        const enemy = createUnitFromSpawnConfig(
            {
                characterId: 'boar',
                name: 'Boar',
                x: 200,
                y: 200,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                aiSettings: null,
            },
            engine2.eventBus,
            engine2,
        );
        engine2.addUnit(enemy);
        engine2.eventBus.emit('unit_died', { unitId: enemy.id, killerUnitId: null });

        const instancesAfter = engine2.state.worldModifierManager.toJSON();
        const instAfter = instancesAfter.find((i) => i.id === 'test_counter_mod');
        expect(instAfter!.counters['deaths']).toBe(1);

        engine2.destroy();
    });

    it('setWorldModifiers LevelEvent adds a modifier when trigger fires', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        engine.state.worldModifierManager.install([]);

        engine.registerLevelEvents([
            {
                type: 'setWorldModifiers',
                trigger: { atRound: 1 },
                actions: [{ action: 'add', modifier: COUNTER_MOD }],
            },
        ]);

        // Simulate level events being processed (roundNumber is 1 by default)
        // Access processLevelEvents via the internal level event manager
        engine.state.levelEventManager['processSetWorldModifiersEvent'](0, {
            type: 'setWorldModifiers',
            trigger: { atRound: 1 },
            actions: [{ action: 'add', modifier: COUNTER_MOD }],
        });

        const instances = engine.state.worldModifierManager.toJSON();
        expect(instances.find((i) => i.id === 'test_counter_mod')).toBeDefined();

        engine.destroy();
    });

    it('setWorldModifiers LevelEvent disables an existing modifier', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        engine.state.worldModifierManager.install([COUNTER_MOD]);

        // Modifier starts enabled
        expect(engine.state.worldModifierManager.getActiveModifiersForUI(1)).toHaveLength(1);

        engine.state.levelEventManager['processSetWorldModifiersEvent'](0, {
            type: 'setWorldModifiers',
            trigger: { atRound: 1 },
            actions: [{ action: 'disable', modifierId: 'test_counter_mod' }],
        });

        expect(engine.state.worldModifierManager.getActiveModifiersForUI(1)).toHaveLength(0);

        // Re-enable
        engine.state.levelEventManager['processSetWorldModifiersEvent'](1, {
            type: 'setWorldModifiers',
            trigger: { atRound: 1 },
            actions: [{ action: 'enable', modifierId: 'test_counter_mod' }],
        });

        expect(engine.state.worldModifierManager.getActiveModifiersForUI(1)).toHaveLength(1);

        engine.destroy();
    });
});

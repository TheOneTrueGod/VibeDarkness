/**
 * Unit phases: conditions, one-way progression, tag / ability / AI / modifier changes, transitions, onEnter effects,
 * serialization (including an old enraged-unit checkpoint) and the Alpha Wolf / Displacer migration.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../../testing/harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../../testing/fixtures/targetDummies';
import { createUnitFromSpawnConfig } from '../index';
import { GameEngine } from '../../GameEngine';
import type { Unit } from '../Unit';
import { UnitTag, hasUnitTag } from '../unitTag';
import { getUnitDefEntry, getUnitPhases } from '../unit_defs/unitDef';
import { enemySpawnDefToSpawnDefinition } from '../spawning/adapters';
import { ENEMY_ALPHA_WOLF, ENEMY_DISPLACER_SPIRIT } from '../../../constants/enemyConstants';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { getCurrentNodeId, getUnitAITree } from '../unitAI';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { enragePreset, getPhaseHpThresholds, type UnitPhaseDef } from './phaseDef';
import { peekPhaseState } from './phaseComponent';
import { evaluateUnitPhases } from './phaseRuntime';
import { getActorTempo } from '../../time/actorClock';
import type { WorldModifierDef } from '../../../worldModifiers/types';

const P = TINY_BATTLE_PLAYER_ID;
const TICKS_PER_SEC = 60;
const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;

/** `dog` is the stock target-dummy character; phases are set on its def per test and removed afterwards. */
const DUMMY_DEF = getUnitDefEntry('dog')!;

beforeEach(() => {
    DUMMY_DEF.phases = undefined;
});
afterEach(() => {
    DUMMY_DEF.phases = undefined;
});

function makeEngine(): GameEngine {
    const engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: P, grass: true });
    spawnTinyPlayerUnit(engine, { playerId: P, x: cell(0), y: cell(0), abilities: [] });
    return engine;
}

/** Install `phases` on the dummy def, then spawn a dummy (phases are read from the def at spawn). */
function spawnPhased(engine: GameEngine, phases: UnitPhaseDef[], opts: { id?: string; hp?: number; abilities?: string[] } = {}): Unit {
    DUMMY_DEF.phases = phases;
    const unit = createTargetDummyAtWorld(engine, cell(12), cell(8), { id: opts.id ?? 'phased', hp: opts.hp ?? 100 });
    if (opts.abilities) unit.abilities = opts.abilities;
    initializeAbilityRuntimeForUnit(unit);
    engine.addUnit(unit, 'initialGameSpawn');
    return unit;
}

function spawnPlain(engine: GameEngine, id: string, characterId: string, col: number): Unit {
    const unit = createUnitFromSpawnConfig(
        {
            id,
            characterId,
            name: id,
            hp: 50,
            x: cell(col),
            y: cell(2),
            teamId: 'enemy',
            ownerId: 'ai',
            unitAITreeId: 'static_test_no_ai',
            unitTags: [UnitTag.CrowdSpacingExempt],
        },
        engine.eventBus,
        engine,
    );
    engine.addUnit(unit, 'initialGameSpawn');
    return unit;
}

function step(engine: GameEngine, seconds: number): void {
    const ticks = Math.round(seconds * TICKS_PER_SEC);
    for (let i = 0; i < ticks; i++) {
        const batch = engine.waitingForOrders;
        if (batch) {
            for (const waiter of batch.waiters) {
                engine.state.orderMgr.applyOrder({ unitId: waiter.unitId, abilityId: 'wait', targets: [], endTurn: true });
            }
            engine.tryResumeParallel();
        }
        engine.stepSimulationFixedTicks(1);
    }
}

function hit(engine: GameEngine, unit: Unit, amount: number): number {
    return unit.takeDamage(amount, null, engine.eventBus);
}

function recordPhaseEvents(engine: GameEngine): string[] {
    const seen: string[] = [];
    engine.eventBus.on('unit_phase_entered', (e) => seen.push(e.phaseId));
    return seen;
}

const COUNTER_MOD: WorldModifierDef = { id: 'ctr', name: 'Counter', description: 'test counter', icon: '' };

const bump = (counterId: string) => ({ type: 'incrementCounter' as const, counterId, modifierId: 'ctr' });

describe('enragePreset and defs', () => {
    it('is a one-phase health_below_percent enrage that adds the Enraged tag', () => {
        expect(enragePreset(0.4)).toMatchObject({
            id: 'enraged',
            enterWhen: { kind: 'health_below_percent', threshold: 0.4 },
            tags: { add: [UnitTag.Enraged] },
        });
    });

    it('collects HP thresholds (also inside all / any) in descending order', () => {
        const phases: UnitPhaseDef[] = [
            { id: 'a', enterWhen: { kind: 'health_below_percent', threshold: 0.3 } },
            { id: 'b', enterWhen: { kind: 'all', conditions: [{ kind: 'elapsed_seconds', seconds: 1 }, { kind: 'health_below_percent', threshold: 0.7 }] } },
            { id: 'c', enterWhen: { kind: 'any', conditions: [{ kind: 'health_below_percent', threshold: 0.3 }] } },
        ];
        expect(getPhaseHpThresholds(phases)).toEqual([0.7, 0.3]);
    });

    it('phases are not gated on UnitTag.Boss', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [enragePreset(0.5)]);
        expect(hasUnitTag(unit, UnitTag.Boss)).toBe(false);
        hit(engine, unit, 60);
        expect(hasUnitTag(unit, UnitTag.Enraged)).toBe(true);
        engine.destroy();
    });
});

describe('condition kinds', () => {
    it('health_below_percent: enters at or below the threshold, not before', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [enragePreset(0.5)]);
        hit(engine, unit, 49);
        expect(hasUnitTag(unit, UnitTag.Enraged)).toBe(false);
        hit(engine, unit, 1);
        expect(hasUnitTag(unit, UnitTag.Enraged)).toBe(true);
        engine.destroy();
    });

    it('HP is checked after damage only: setting hp directly never enters a phase (old enrage semantics)', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [enragePreset(0.5)]);
        unit.hp = unit.maxHp * 0.4;
        step(engine, 0.5);
        evaluateUnitPhases(unit, engine);
        expect(hasUnitTag(unit, UnitTag.Enraged)).toBe(false);
        hit(engine, unit, 1);
        expect(hasUnitTag(unit, UnitTag.Enraged)).toBe(true);
        engine.destroy();
    });

    it('elapsed_seconds: from battle start, then from the previous phase', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            { id: 'a', enterWhen: { kind: 'elapsed_seconds', seconds: 1 } },
            { id: 'b', enterWhen: { kind: 'elapsed_seconds', seconds: 1, from: 'previousPhase' } },
        ]);
        const entered = recordPhaseEvents(engine);
        step(engine, 0.9);
        expect(entered).toEqual([]);
        step(engine, 0.2);
        expect(entered).toEqual(['a']);
        step(engine, 0.5);
        expect(entered).toEqual(['a']);
        step(engine, 0.6);
        expect(entered).toEqual(['a', 'b']);
        expect(peekPhaseState(unit)!.index).toBe(2);
        engine.destroy();
    });

    it('units_alive_below: counts other living units matching the filters', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            { id: 'adds_dead', enterWhen: { kind: 'units_alive_below', count: 2, characterId: 'boar', teamId: 'enemy' } },
        ]);
        const entered = recordPhaseEvents(engine);
        const boarA = spawnPlain(engine, 'boar_a', 'boar', 3);
        spawnPlain(engine, 'boar_b', 'boar', 4);
        step(engine, 0.2);
        expect(entered).toEqual([]);
        hit(engine, boarA, 9999);
        expect(boarA.isAlive()).toBe(false);
        step(engine, 0.2);
        expect(entered).toEqual(['adds_dead']);
        expect(peekPhaseState(unit)!.index).toBe(1);
        engine.destroy();
    });

    it('counter_at_least: reads a world-modifier counter', () => {
        const engine = makeEngine();
        engine.worldModifierManager.install([COUNTER_MOD]);
        const unit = spawnPhased(engine, [
            { id: 'a', enterWhen: { kind: 'counter_at_least', modifierId: 'ctr', counterId: 'k', count: 2 } },
        ]);
        const entered = recordPhaseEvents(engine);
        engine.worldModifierManager.applyEffectsForUnit([bump('k')], unit);
        step(engine, 0.1);
        expect(entered).toEqual([]);
        engine.worldModifierManager.applyEffectsForUnit([bump('k')], unit);
        step(engine, 0.1);
        expect(entered).toEqual(['a']);
        engine.destroy();
    });

    it('all / any combine conditions', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            {
                id: 'both',
                enterWhen: {
                    kind: 'all',
                    conditions: [
                        { kind: 'health_below_percent', threshold: 0.5 },
                        { kind: 'elapsed_seconds', seconds: 1 },
                    ],
                },
            },
            {
                id: 'either',
                enterWhen: {
                    kind: 'any',
                    conditions: [
                        { kind: 'health_below_percent', threshold: 0.01 },
                        { kind: 'elapsed_seconds', seconds: 2, from: 'previousPhase' },
                    ],
                },
            },
        ]);
        const entered = recordPhaseEvents(engine);
        hit(engine, unit, 60); // HP satisfied, time not yet
        expect(entered).toEqual([]);
        step(engine, 1.1);
        expect(entered).toEqual(['both']);
        step(engine, 1.5);
        expect(entered).toEqual(['both']);
        step(engine, 0.6);
        expect(entered).toEqual(['both', 'either']);
        engine.destroy();
    });
});

describe('one-way progression', () => {
    it('one hit crossing several thresholds enters every phase in order; healing never reverts', () => {
        const engine = makeEngine();
        engine.worldModifierManager.install([COUNTER_MOD]);
        const phases: UnitPhaseDef[] = ['a', 'b', 'c'].map((id, i) => ({
            id,
            enterWhen: { kind: 'health_below_percent', threshold: [0.75, 0.5, 0.25][i]! },
            tags: { add: [[UnitTag.Enraged, UnitTag.ShowHpBar, UnitTag.Clone][i]!] },
            onEnter: [bump('entered')],
        }));
        const unit = spawnPhased(engine, phases);
        const entered = recordPhaseEvents(engine);
        hit(engine, unit, 80);
        expect(entered).toEqual(['a', 'b', 'c']);
        expect(engine.worldModifierManager.getCounter('ctr', 'entered')).toBe(3);

        unit.hp = unit.maxHp; // full heal
        evaluateUnitPhases(unit, engine);
        step(engine, 0.2);
        expect(entered).toEqual(['a', 'b', 'c']);
        expect(peekPhaseState(unit)!.index).toBe(3);
        expect(hasUnitTag(unit, UnitTag.Enraged)).toBe(true);
        engine.destroy();
    });
});

describe('what entering a phase changes', () => {
    it('adds and removes tags and abilities (with ability runtime)', () => {
        const engine = makeEngine();
        const unit = spawnPhased(
            engine,
            [
                {
                    id: 'a',
                    enterWhen: { kind: 'health_below_percent', threshold: 0.5 },
                    tags: { add: [UnitTag.Enraged], remove: [UnitTag.CrowdSpacingExempt] },
                    abilities: { add: ['0120'], remove: ['0001'] },
                },
            ],
            { abilities: ['0001'] },
        );
        expect(unit.abilityRuntime['0001']).toBeDefined();
        hit(engine, unit, 60);
        expect(unit.abilities).toEqual(['0120']);
        expect(unit.abilityRuntime['0120']).toBeDefined();
        expect(unit.abilityRuntime['0001']).toBeUndefined();
        expect(hasUnitTag(unit, UnitTag.Enraged)).toBe(true);
        expect(hasUnitTag(unit, UnitTag.CrowdSpacingExempt)).toBe(false);
        engine.destroy();
    });

    it('switches the AI tree and jumps to a node', () => {
        const engine = makeEngine();
        const tree = getUnitAITree('hunt')!;
        const node = Object.keys(tree.nodes)[1]!;
        const unit = spawnPhased(engine, [
            { id: 'a', enterWhen: { kind: 'health_below_percent', threshold: 0.5 }, ai: { treeId: 'hunt', node } },
        ]);
        expect(unit.unitAITreeId).toBe('static_test_no_ai');
        hit(engine, unit, 60);
        expect(unit.unitAITreeId).toBe('hunt');
        expect(getCurrentNodeId(unit)).toBe(node);
        engine.destroy();
    });

    it('applies modifiers: tempo buff and damage multiplier', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            { id: 'a', enterWhen: { kind: 'health_below_percent', threshold: 0.5 }, modifiers: { tempo: 1.5, damageMultiplier: 2 } },
        ]);
        hit(engine, unit, 60);
        expect(getActorTempo(unit)).toBeCloseTo(1.5);
        expect(unit.getDamageModifier().multiplier).toBe(2);
        step(engine, 1);
        expect(getActorTempo(unit)).toBeCloseTo(1.5); // permanent
        engine.destroy();
    });

    it('runs onEnter world effects from the unit: spawnUnits and spawnLightSource at its position', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            {
                id: 'a',
                enterWhen: { kind: 'health_below_percent', threshold: 0.5 },
                onEnter: [
                    { type: 'spawnUnits', characterId: 'swarmling', count: 2, spawnBehaviour: 'anywhere' },
                    { type: 'spawnLightSource', lightAmount: -2, radius: 3, durationRounds: 2, position: 'victim' },
                ],
            },
        ]);
        const unitsBefore = engine.units.filter((u) => u.characterId === 'swarmling').length;
        const lightsBefore = engine.lightSources.length;
        hit(engine, unit, 60);
        expect(engine.units.filter((u) => u.characterId === 'swarmling').length).toBe(unitsBefore + 2);
        expect(engine.lightSources.length).toBe(lightsBefore + 1);
        const light = engine.lightSources[engine.lightSources.length - 1]!;
        expect([light.x, light.y]).toEqual([unit.x, unit.y]);
        engine.destroy();
    });

    it('emits unit_phase_entered with label, index and added tags, and unit_enraged for the Enraged tag', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            { id: 'calm', label: 'Calm', enterWhen: { kind: 'health_below_percent', threshold: 0.9 } },
            enragePreset(0.5),
        ]);
        const events: unknown[] = [];
        engine.eventBus.on('unit_phase_entered', (e) => events.push(e));
        const enraged: unknown[] = [];
        engine.eventBus.on('unit_enraged', (e) => enraged.push(e));
        hit(engine, unit, 60);
        expect(events).toEqual([
            { unitId: unit.id, phaseId: 'calm', phaseIndex: 0, label: 'Calm', tagsAdded: [] },
            { unitId: unit.id, phaseId: 'enraged', phaseIndex: 1, label: 'Enraged', tagsAdded: [UnitTag.Enraged] },
        ]);
        expect(enraged).toEqual([{ unitId: unit.id, tag: UnitTag.Enraged }]);
        engine.destroy();
    });
});

describe('transitions', () => {
    it('invulnerability window: no damage, then vulnerable again; transition clears at its end', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            {
                id: 'a',
                enterWhen: { kind: 'health_below_percent', threshold: 0.5 },
                transition: { kind: 'none', durationSeconds: 1, invulnerableSeconds: 0.5, banner: 'Rage!' },
            },
        ]);
        hit(engine, unit, 60);
        expect(hasUnitTag(unit, UnitTag.Invincible)).toBe(true);
        expect(peekPhaseState(unit)!.transition?.banner).toBe('Rage!');
        const hp = unit.hp;
        expect(hit(engine, unit, 10)).toBe(0);
        expect(unit.hp).toBe(hp);

        step(engine, 0.4);
        expect(hasUnitTag(unit, UnitTag.Invincible)).toBe(true);
        step(engine, 0.2);
        expect(hasUnitTag(unit, UnitTag.Invincible)).toBe(false);
        expect(peekPhaseState(unit)!.transition).not.toBeNull();
        step(engine, 0.5);
        expect(peekPhaseState(unit)!.transition).toBeNull();
        expect(hit(engine, unit, 10)).toBeGreaterThan(0);
        engine.destroy();
    });

    it('does not remove an Invincible tag the unit already had', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            {
                id: 'a',
                enterWhen: { kind: 'elapsed_seconds', seconds: 0.1 },
                transition: { kind: 'none', durationSeconds: 0.3, invulnerableSeconds: 0.3 },
            },
        ]);
        unit.tags = [...unit.tags, UnitTag.Invincible];
        step(engine, 0.8);
        expect(hasUnitTag(unit, UnitTag.Invincible)).toBe(true);
        engine.destroy();
    });

    it('timeStop: world pace 0 for the duration, then resumes', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            {
                id: 'a',
                enterWhen: { kind: 'health_below_percent', threshold: 0.5 },
                transition: { kind: 'timeStop', durationSeconds: 1, invulnerableSeconds: 1 },
            },
        ]);
        const stops: string[] = [];
        engine.eventBus.on('time_stop_started', (e) => stops.push(e.id));
        hit(engine, unit, 60);
        expect(stops).toHaveLength(1);
        const t0 = engine.gameTime;
        step(engine, 0.5);
        expect(engine.worldPace).toBe(0);
        expect(engine.gameTime).toBe(t0);
        expect(hasUnitTag(unit, UnitTag.Invincible)).toBe(true);
        step(engine, 0.8);
        expect(engine.worldPace).toBe(1);
        expect(engine.state.timeManager.timeStops).toHaveLength(0);
        expect(engine.gameTime).toBeGreaterThan(t0);
        expect(hasUnitTag(unit, UnitTag.Invincible)).toBe(false);
        engine.destroy();
    });

    it('storyPause: halts the sim for the duration, then resumes', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            {
                id: 'a',
                enterWhen: { kind: 'health_below_percent', threshold: 0.5 },
                transition: { kind: 'storyPause', durationSeconds: 1 },
            },
        ]);
        hit(engine, unit, 60);
        expect(engine.storyPauseActive).toBe(true);
        step(engine, 1.3);
        expect(engine.storyPauseActive).toBe(false);
        engine.destroy();
    });

    it('a later phase in the same hit supersedes the earlier transition and releases its invulnerability', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            { id: 'a', enterWhen: { kind: 'health_below_percent', threshold: 0.75 }, transition: { kind: 'none', durationSeconds: 5, invulnerableSeconds: 5, banner: 'A' } },
            { id: 'b', enterWhen: { kind: 'health_below_percent', threshold: 0.5 }, transition: { kind: 'none', durationSeconds: 1, invulnerableSeconds: 1, banner: 'B' } },
        ]);
        hit(engine, unit, 60);
        const tr = peekPhaseState(unit)!.transition!;
        expect(tr.phaseId).toBe('b');
        expect(tr.banner).toBe('B');
        expect(hasUnitTag(unit, UnitTag.Invincible)).toBe(true);
        step(engine, 1.2);
        expect(hasUnitTag(unit, UnitTag.Invincible)).toBe(false);
        engine.destroy();
    });
});

describe('serialization', () => {
    const transitionPhase: UnitPhaseDef = {
        id: 'a',
        label: 'Furious',
        enterWhen: { kind: 'health_below_percent', threshold: 0.5 },
        tags: { add: [UnitTag.Enraged] },
        transition: { kind: 'timeStop', durationSeconds: 1, invulnerableSeconds: 1 },
    };

    function restore(engine: GameEngine): GameEngine {
        const json = JSON.parse(JSON.stringify(engine.toJSON()));
        return GameEngine.fromJSON(json, P, engine.terrainManager, {
            checkpointRuntimeFingerprintHex: engine.getRuntimeFingerprintHex(),
        });
    }

    it('a unit with no phase progress adds no keys to its JSON', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [transitionPhase]);
        const json = engine.toJSON().units.find((u) => u.id === unit.id)!;
        expect(Object.keys(json).filter((k) => k.startsWith('phase'))).toEqual([]);
        engine.destroy();
    });

    it('checkpoint save and restore partway through a transition continues identically', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [transitionPhase]);
        hit(engine, unit, 60);
        step(engine, 0.3);

        const restored = restore(engine);
        const rUnit = restored.getUnit(unit.id)!;
        const rState = peekPhaseState(rUnit)!;
        expect(rState.index).toBe(1);
        expect(rState.transition).toEqual(peekPhaseState(unit)!.transition);
        expect(hasUnitTag(rUnit, UnitTag.Invincible)).toBe(true);
        expect(restored.state.timeManager.timeStops).toHaveLength(1);

        const events: string[] = [];
        restored.eventBus.on('unit_phase_entered', (e) => events.push(e.phaseId));
        step(engine, 1.2);
        step(restored, 1.2);
        expect(events).toEqual([]); // no re-entry after restore
        for (const e of [engine, restored]) {
            const u = e.getUnit(unit.id)!;
            expect(peekPhaseState(u)!.transition).toBeNull();
            expect(hasUnitTag(u, UnitTag.Invincible)).toBe(false);
            expect(e.state.timeManager.timeStops).toHaveLength(0);
        }
        expect(restored.gameTick).toBe(engine.gameTick);
        expect(restored.gameTime).toBe(engine.gameTime);
        // Not compared: the runtime fingerprint of ANY engine restored mid Time Stop diverges once the stop ends (the
        // restored hero forms its parallel order pause a tick differently; reproducible with a bare engine.startTimeStop).
        engine.destroy();
        restored.destroy();
    });

    it('an old checkpoint with an already-enraged unit (no phase state) does not re-enter the phase', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            {
                id: 'enrage',
                enterWhen: { kind: 'health_below_percent', threshold: 0.5 },
                tags: { add: [UnitTag.Enraged] },
                onEnter: [{ type: 'spawnUnits', characterId: 'swarmling', count: 2, spawnBehaviour: 'anywhere' }],
            },
        ]);
        hit(engine, unit, 60);
        const swarmlings = (e: GameEngine) => e.units.filter((u) => u.characterId === 'swarmling').length;
        expect(swarmlings(engine)).toBe(2);

        // Make the checkpoint look like the previous build's: Enraged tag present, no phase keys.
        const json = JSON.parse(JSON.stringify(engine.toJSON()));
        const unitJson = json.units.find((u: Record<string, unknown>) => u.id === unit.id);
        expect(unitJson.phaseIndex).toBe(1);
        for (const key of Object.keys(unitJson)) if (key.startsWith('phase')) delete unitJson[key];
        expect(unitJson.tags).toContain(UnitTag.Enraged);

        const restored = GameEngine.fromJSON(json, P, engine.terrainManager);
        const events: string[] = [];
        restored.eventBus.on('unit_phase_entered', (e) => events.push(e.phaseId));
        const rUnit = restored.getUnit(unit.id)!;
        expect(peekPhaseState(rUnit)!.index).toBe(0);
        const before = swarmlings(restored);
        step(restored, 0.3);
        hit(restored, rUnit, 5);
        expect(events).toEqual([]);
        expect(swarmlings(restored)).toBe(before);
        expect(peekPhaseState(rUnit)!.index).toBe(1); // recognised from its tag
        engine.destroy();
        restored.destroy();
    });

    it('an old checkpoint with a not-yet-enraged unit still enters the phase later', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [enragePreset(0.5)]);
        const restored = restore(engine);
        const rUnit = restored.getUnit(unit.id)!;
        hit(restored, rUnit, 60);
        expect(hasUnitTag(rUnit, UnitTag.Enraged)).toBe(true);
        engine.destroy();
        restored.destroy();
    });

    it('new checkpoints only add keys an older build ignores (phase keys on the unit JSON)', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [transitionPhase]);
        hit(engine, unit, 60);
        const unitJson = engine.toJSON().units.find((u) => u.id === unit.id)!;
        expect(Object.keys(unitJson).filter((k) => k.startsWith('phase')).sort()).toEqual([
            'phaseEnteredAtGameTime',
            'phaseHpFractionAtDamage',
            'phaseIndex',
            'phaseTransition',
        ]);
        // Everything else the older build reads is still plain: tags carry the Enraged flag it keys off.
        expect(unitJson.tags).toContain(UnitTag.Enraged);
        engine.destroy();
    });
});

describe('Alpha Wolf and Displacer migration', () => {
    function spawnBoss(engine: GameEngine, def: typeof ENEMY_ALPHA_WOLF | typeof ENEMY_DISPLACER_SPIRIT): Unit {
        const [unit] = engine.spawnUnit(
            {
                ...enemySpawnDefToSpawnDefinition({ ...def, position: { x: cell(18), y: cell(8) } }, 'ai'),
                unitAITreeId: 'static_test_no_ai',
            },
            'initialGameSpawn',
        );
        initializeAbilityRuntimeForUnit(unit!);
        return unit!;
    }

    it.each([
        ['alpha_wolf', ENEMY_ALPHA_WOLF],
        ['displacer_spirit', ENEMY_DISPLACER_SPIRIT],
    ] as const)('%s: enrages once at half health with the same tag and events as before', (characterId, def) => {
        expect(getUnitPhases(characterId)).toEqual([enragePreset(0.5)]);
        const engine = makeEngine();
        const boss = spawnBoss(engine, def);
        const enraged: unknown[] = [];
        engine.eventBus.on('unit_enraged', (e) => enraged.push(e));
        const phases = recordPhaseEvents(engine);

        hit(engine, boss, boss.maxHp * 0.49);
        expect(hasUnitTag(boss, UnitTag.Enraged)).toBe(false);
        hit(engine, boss, boss.maxHp * 0.02);
        expect(hasUnitTag(boss, UnitTag.Enraged)).toBe(true);
        hit(engine, boss, 1);
        expect(enraged).toEqual([{ unitId: boss.id, tag: UnitTag.Enraged }]);
        expect(phases).toEqual(['enraged']);
        expect(boss.abilities.length).toBeGreaterThan(0); // untouched: abilities swap via requiredTags, not lists
        engine.destroy();
    });

    it('a boss restored from a checkpoint after enraging stays enraged and does not re-fire', () => {
        const engine = makeEngine();
        const boss = spawnBoss(engine, ENEMY_ALPHA_WOLF);
        hit(engine, boss, boss.maxHp * 0.6);
        const restored = GameEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())), P, engine.terrainManager);
        const rBoss = restored.getUnit(boss.id)!;
        const fired: unknown[] = [];
        restored.eventBus.on('unit_enraged', (e) => fired.push(e));
        hit(restored, rBoss, 1);
        expect(hasUnitTag(rBoss, UnitTag.Enraged)).toBe(true);
        expect(fired).toEqual([]);
        engine.destroy();
        restored.destroy();
    });
});

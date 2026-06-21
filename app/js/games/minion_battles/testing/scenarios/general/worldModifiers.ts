/**
 * World Modifiers E2E scenarios.
 *
 * Scenario A — world_modifier_dark_swarm:
 *   Player kills a swarmling in real combat (hp=1 for determinism). The Dark Swarm
 *   modifier should spawn exactly one active dark-light source at the victim tile
 *   with a 5-round lifetime.
 *
 * Scenario B — world_modifier_mid_battle_add:
 *   No modifiers at start. A setWorldModifiers level event fires at round 3 and
 *   dynamically adds rainyStormModifier. The modifier's on_round_start rule
 *   increments storm_ticks; assertPass verifies the counter reaches 1.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { installWorldModifiersForTest } from '../../harness/installWorldModifiers';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { darkSwarmModifier, rainyStormModifier } from '../../../worldModifiers/presets';
import type { WorldModifierDef } from '../../../worldModifiers/types';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

// ============================================================================
// Scenario A — world_modifier_dark_swarm
// ============================================================================

const PLAYER_POS_A = { x: 3 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 }; // (140, 100)
// 40 px from player — well within Strong Punch max range (~50 px)
const SWARMLING_POS = { x: PLAYER_POS_A.x + 40, y: PLAYER_POS_A.y };      // (180, 100)
const SWARMLING_ID = 'wm_dark_swarm_swarmling';

export const worldModifierDarkSwarmScenario: ScenarioDefinition = {
    id: 'world_modifier_dark_swarm',
    title: 'World Modifiers: swarmling death spawns darklight at victim tile for 5 rounds',
    category: 'general',
    generalSection: 'World Modifiers',
    renderLighting: true,
    maxDurationMs: 10000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 6, localPlayerId: P });
        engine.setMissionLightConfig(true, 0);
        installWorldModifiersForTest(engine, [darkSwarmModifier()]);

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS_A.x,
            y: PLAYER_POS_A.y,
            abilities: ['0117'],
        });

        const swarmling = createUnitFromSpawnConfig(
            {
                id: SWARMLING_ID,
                characterId: 'swarmling',
                name: 'Swarmling',
                x: SWARMLING_POS.x,
                y: SWARMLING_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: ['0013'],
                aiSettings: { minRange: 0, maxRange: 70 },
            },
            engine.eventBus,
            engine,
        );
        swarmling.hp = 1; // guaranteed one-hit kill so death fires in one pass
        initializeAbilityRuntimeForUnit(swarmling);
        engine.addUnit(swarmling, 'initialGameSpawn');

        // Keep runner alive while the punch animation resolves (prevents premature idle exit).
        engine.state.orderMgr.queueOrder(120, { unitId: player.id, abilityId: 'wait', targets: [] });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: '0117', targets: [{ type: 'pixel', position: SWARMLING_POS }] }];
    },

    assertPass(engine) {
        const darkLights = engine.lightSources.filter((ls) => ls.active && ls.lightAmount < 0);
        return darkLights.length === 1 && darkLights[0]!.decay.roundsTotal === 5;
    },

    failureMessage(engine) {
        const darkLights = engine.lightSources.filter((ls) => ls.active && ls.lightAmount < 0);
        const swarmling = engine.getUnit(SWARMLING_ID);
        return `dark lights=${darkLights.length} (expected 1 with roundsTotal=5) | swarmling alive=${swarmling?.isAlive() ?? false} | swarmling hp=${swarmling?.hp ?? 'gone'}`;
    },
};

// ============================================================================
// Scenario B — world_modifier_mid_battle_add
// ============================================================================

export const worldModifierMidBattleAddScenario: ScenarioDefinition = {
    id: 'world_modifier_mid_battle_add',
    title: 'Mid-battle modifier add — boss phase enables storm modifier',
    category: 'general',
    generalSection: 'World Modifiers',
    // 3 rounds × 10 s/round = 30 s minimum; 25 s budget covers 2+ rounds + one on_round_start tick.
    maxDurationMs: 25000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 6, localPlayerId: P });
        installWorldModifiersForTest(engine, []);

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 4 * CELL + CELL / 2,
            y: 3 * CELL + CELL / 2,
            abilities: [],
        });

        // Fire at round 3 — modifier adds on the tick when roundNumber becomes 3;
        // storm_ticks increments on the very next on_round_start (round 3 start).
        engine.registerLevelEvents([
            {
                type: 'setWorldModifiers',
                trigger: { atRound: 3 },
                actions: [{ action: 'add', modifier: rainyStormModifier({ startsDisabled: false }) }],
            },
        ]);

        // Queue wait orders every 90 ticks (1.5 s) through 22+ seconds so pendingOrders stays
        // non-empty and isScenarioRunnerBattleIdle never fires before round 3 fires.
        for (let tick = 90; tick <= 1350; tick += 90) {
            engine.state.orderMgr.queueOrder(tick, { unitId: player.id, abilityId: 'wait', targets: [] });
        }

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const instances = engine.state.worldModifierManager.toJSON();
        const storm = instances.find((i) => i.id === 'rainy_storm');
        return storm !== undefined && (storm.counters['storm_ticks'] ?? 0) >= 1;
    },

    failureMessage(engine) {
        const instances = engine.state.worldModifierManager.toJSON();
        const storm = instances.find((i) => i.id === 'rainy_storm');
        return `rainy_storm=${JSON.stringify(storm)} | round=${engine.roundNumber}`;
    },
};

// ============================================================================
// Scenario C — world_effect_visual_effects_fire
// ============================================================================

const TEST_VFX_EFFECT_TYPE = 'TestWorldEffectVFX';

/** Minimal modifier that fires a DirectEffectVFXDef when any unit dies. */
const visualEffectsTestModifier: WorldModifierDef = {
    id: 'test_visual_effects_modifier',
    name: 'Test Visual Effects Modifier',
    description: 'Fires a DirectEffectVFXDef on any unit death.',
    icon: '',
    rules: {
        on_unit_died: [
            {
                id: 'test_vfx_on_death',
                conditions: [{ type: 'always' }],
                effects: [
                    {
                        type: 'incrementCounter',
                        counterId: 'death_count',
                        visualEffects: [
                            {
                                type: 'effect',
                                effectType: TEST_VFX_EFFECT_TYPE,
                                duration: 1,
                            },
                        ],
                    },
                ],
            },
        ],
    },
};

const VFX_PLAYER_POS_C = { x: 3 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 }; // (140, 100)
const TARGET_POS_C = { x: VFX_PLAYER_POS_C.x + 40, y: VFX_PLAYER_POS_C.y };  // (180, 100)
const TARGET_ID_C = 'wm_vfx_target';

export const worldEffectVisualEffectsFireScenario: ScenarioDefinition = {
    id: 'world_effect_visual_effects_fire',
    title: 'World Modifiers: DirectEffectVFXDef on WorldEffect fires on unit death',
    category: 'general',
    generalSection: 'World Modifiers',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 6, localPlayerId: P });
        installWorldModifiersForTest(engine, [visualEffectsTestModifier]);

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: VFX_PLAYER_POS_C.x,
            y: VFX_PLAYER_POS_C.y,
            abilities: ['0117'],
        });

        const target = createUnitFromSpawnConfig(
            {
                id: TARGET_ID_C,
                characterId: 'swarmling',
                name: 'VFX Target',
                x: TARGET_POS_C.x,
                y: TARGET_POS_C.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                aiSettings: { minRange: 0, maxRange: 70 },
            },
            engine.eventBus,
            engine,
        );
        target.hp = 1; // guaranteed one-hit kill
        initializeAbilityRuntimeForUnit(target);
        engine.addUnit(target, 'initialGameSpawn');

        // Keep runner alive while the punch animation resolves.
        engine.state.orderMgr.queueOrder(120, { unitId: player.id, abilityId: 'wait', targets: [] });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: '0117', targets: [{ type: 'pixel', position: TARGET_POS_C }] }];
    },

    assertPass(engine) {
        return engine.effects.some((e) => e.effectType === TEST_VFX_EFFECT_TYPE);
    },

    failureMessage(engine) {
        const target = engine.getUnit(TARGET_ID_C);
        const effectTypes = [...new Set(engine.effects.map((e) => e.effectType))].join(', ');
        return (
            `No "${TEST_VFX_EFFECT_TYPE}" effect found` +
            ` | effectTypes=[${effectTypes}]` +
            ` | target alive=${target?.isAlive() ?? false} hp=${target?.hp ?? 'gone'}`
        );
    },
};

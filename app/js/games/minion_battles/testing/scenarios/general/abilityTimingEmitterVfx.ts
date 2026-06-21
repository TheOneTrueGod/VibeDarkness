/**
 * Ability Timing Emitter VFX scenario — Step 2 of visual-effect-def-followon plan.
 *
 * Scenario: ability_timing_emitter_visual_effects_fire
 *   A minimal ability has a timing emitter with a `visualEffects: [DirectEffectVFXDef]`.
 *   The player casts the ability; on window entry the engine should call
 *   `applyVisualEffectDefs` and spawn an effect with `effectType === TEST_EMITTER_VFX_TYPE`.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { registerAbilityForTest } from '../../../abilities/AbilityRegistry';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { AbilityStatic } from '../../../abilities/Ability';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

const TEST_EMITTER_VFX_TYPE = 'TestTimingEmitterVFX';
const TEST_ABILITY_ID = '__test_timing_emitter_vfx__';

const testTimingEmitterAbility: AbilityStatic = {
    id: TEST_ABILITY_ID,
    name: 'Test Timing Emitter VFX',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    targets: [],
    prefireTime: 0,
    abilityTimings: [
        {
            id: 'active',
            start: 0,
            end: 0.5,
            abilityPhase: AbilityPhase.Active,
            emitterDef: {
                mode: 'instant',
                effectType: '',
                visualEffects: [
                    {
                        type: 'effect',
                        effectType: TEST_EMITTER_VFX_TYPE,
                        duration: 1,
                    },
                ],
            },
        },
        {
            id: 'cooldown',
            start: 0.5,
            end: 1.0,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    getTooltipText: () => ['Test ability for timing emitter VFX.'],
    getAbilityStates: () => [],
    onAttackBlocked: () => {},
};

// Register once at module load (idempotent).
registerAbilityForTest(testTimingEmitterAbility);

const PLAYER_POS = { x: 4 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };

export const abilityTimingEmitterVisualEffectsFireScenario: ScenarioDefinition = {
    id: 'ability_timing_emitter_visual_effects_fire',
    title: 'Ability Timing Emitter: DirectEffectVFXDef on emitterDef fires on window entry',
    category: 'general',
    generalSection: 'Ability Emitter VFX',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 6, localPlayerId: P });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: [TEST_ABILITY_ID],
        });

        // Keep runner alive while the ability resolves.
        engine.state.orderMgr.queueOrder(60, { unitId: player.id, abilityId: 'wait', targets: [] });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: TEST_ABILITY_ID, targets: [] }];
    },

    assertPass(engine) {
        return engine.effects.some((e) => e.effectType === TEST_EMITTER_VFX_TYPE);
    },

    failureMessage(engine) {
        const effectTypes = [...new Set(engine.effects.map((e) => e.effectType))].join(', ');
        return (
            `No "${TEST_EMITTER_VFX_TYPE}" effect found` +
            ` | effectTypes=[${effectTypes}]`
        );
    },
};

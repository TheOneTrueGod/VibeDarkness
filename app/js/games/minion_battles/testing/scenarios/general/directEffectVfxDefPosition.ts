/**
 * DirectEffectVFXDef positional variants scenario — Step 3 of visual-effect-def-followon plan.
 *
 * Scenario: direct_effect_vfx_def_target_position
 *   A minimal ability has a timing emitter with a `DirectEffectVFXDef` carrying
 *   `position: 'target'`. The player casts the ability targeting a dummy unit.
 *   On window entry the engine should spawn an effect at the dummy's coordinates
 *   (not the caster's coordinates).
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { registerAbilityForTest } from '../../../abilities/AbilityRegistry';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { AbilityStatic } from '../../../abilities/Ability';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

const TEST_TARGET_VFX_TYPE = 'TestDirectEffectVFXTargetPos';
const TEST_ABILITY_ID = '__test_direct_effect_vfx_target_pos__';

const testTargetPositionAbility: AbilityStatic = {
    id: TEST_ABILITY_ID,
    name: 'Test DirectEffectVFX target position',
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
                        effectType: TEST_TARGET_VFX_TYPE,
                        duration: 1,
                        position: 'target',
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
    getTooltipText: () => ['Test ability for DirectEffectVFX target position.'],
    getAbilityStates: () => [],
    onAttackBlocked: () => {},
};

// Register once at module load (idempotent).
registerAbilityForTest(testTargetPositionAbility);

const PLAYER_POS = { x: 4 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };
const DUMMY_POS = { x: 6 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };
const DUMMY_ID = 'vfx_target_pos_dummy';

// Tolerance in px — effect should spawn within 1 px of the dummy's centre.
const TOLERANCE = 1;

export const directEffectVfxDefTargetPositionScenario: ScenarioDefinition = {
    id: 'direct_effect_vfx_def_target_position',
    title: 'DirectEffectVFXDef: position:target spawns effect at target coordinates',
    category: 'general',
    generalSection: 'Ability Emitter VFX',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 8, localPlayerId: P });

        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: [TEST_ABILITY_ID],
        });

        const dummy = createTargetDummyAtWorld(engine, DUMMY_POS.x, DUMMY_POS.y, { id: DUMMY_ID });
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const dummy = engine.getUnit(DUMMY_ID)!;
        return [
            {
                unitId: player.id,
                abilityId: TEST_ABILITY_ID,
                targets: [{ type: 'unit', unitId: dummy.id }],
            },
        ];
    },

    assertPass(engine) {
        const match = engine.effects.find((e) => e.effectType === TEST_TARGET_VFX_TYPE);
        if (!match) return false;
        const dx = match.x - DUMMY_POS.x;
        const dy = match.y - DUMMY_POS.y;
        return Math.sqrt(dx * dx + dy * dy) <= TOLERANCE;
    },

    failureMessage(engine) {
        const match = engine.effects.find((e) => e.effectType === TEST_TARGET_VFX_TYPE);
        const effectTypes = [...new Set(engine.effects.map((e) => e.effectType))].join(', ');
        if (!match) {
            return (
                `No "${TEST_TARGET_VFX_TYPE}" effect found` +
                ` | effectTypes=[${effectTypes}]`
            );
        }
        return (
            `Effect found at (${match.x.toFixed(1)}, ${match.y.toFixed(1)})` +
            ` but expected (${DUMMY_POS.x}, ${DUMMY_POS.y}) ± ${TOLERANCE}` +
            ` | effectTypes=[${effectTypes}]`
        );
    },
};

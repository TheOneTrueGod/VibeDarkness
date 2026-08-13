import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import { computeAbilityModifiersFromResearch } from '../../../../../researchTrees/evaluator';
import { getAbilityTagsForId } from '../../../abilities/Ability';
import {
    EARTH_NODE_RAPID_THROW,
    EARTH_TREE_ID,
} from '../../../../../researchTrees/trees/earth';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';

const P = TINY_BATTLE_PLAYER_ID;
const THROW_ROCK_ABILITY_ID = 'throw_rock';
const RAPID_THROW_LEVEL_TWO = 2;

export const rapidThrowComboScenarioState = {
    firstPause: false,
    secondThrow: false,
    secondPause: false,
    finalComboCount: 0,
};

/** Rapid Throw rank 2: two chained throws, no third Combo Cancel pause. */
export const rapidThrowComboScenario: ScenarioDefinition = {
    id: 'earth_rapid_throw_combo_chain',
    title: 'Rapid Throw Combo Chain (rank 2)',
    category: 'ability',
    maxDurationMs: 8000,
    buildEngine() {
        rapidThrowComboScenarioState.firstPause = false;
        rapidThrowComboScenarioState.secondThrow = false;
        rapidThrowComboScenarioState.secondPause = false;
        rapidThrowComboScenarioState.finalComboCount = 0;

        const researchByPlayer = {
            [P]: { [EARTH_TREE_ID]: [EARTH_NODE_RAPID_THROW] },
        };
        const researchNodeLevels = {
            [P]: { [EARTH_TREE_ID]: { [EARTH_NODE_RAPID_THROW]: RAPID_THROW_LEVEL_TWO } },
        };
        const engine = buildTinyBattleEngine({
            gridW: 14,
            gridH: 10,
            localPlayerId: P,
            grass: true,
            playerResearchTreesByPlayer: researchByPlayer,
        });
        const { player } = placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: { x: 120, y: 200 },
            dummyWorld: { x: 280, y: 200 },
            abilities: [THROW_ROCK_ABILITY_ID],
            playerResearchTreesByPlayer: researchByPlayer,
        });
        player.abilityModifiers = computeAbilityModifiersFromResearch(
            researchByPlayer[P],
            getAbilityTagsForId,
            player.abilities,
            researchNodeLevels[P],
        );
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        return [{
            unitId: u.id,
            abilityId: THROW_ROCK_ABILITY_ID,
            targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }],
        }];
    },
    onConditionalCancelPause(engine) {
        const player = engine.getLocalPlayerUnit();
        const dummy = engine.getUnit('target_dummy');
        if (!player || !dummy) return;

        const paused = player.activeAbilities.find((a) => a.conditionalCancelPaused);
        if (!paused || paused.abilityId !== THROW_ROCK_ABILITY_ID) return;

        if (!rapidThrowComboScenarioState.firstPause) {
            rapidThrowComboScenarioState.firstPause = true;
            engine.state.orderMgr.applyOrder({
                unitId: player.id,
                abilityId: THROW_ROCK_ABILITY_ID,
                targets: [{ type: 'pixel', position: { x: dummy.x, y: dummy.y } }],
                endTurn: true,
            });
            rapidThrowComboScenarioState.secondThrow = true;
            return;
        }

        rapidThrowComboScenarioState.secondPause = true;
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
            endTurn: true,
        });
    },
    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return false;
        const active = player.activeAbilities.find((a) => a.abilityId === THROW_ROCK_ABILITY_ID);
        if (active?.comboCount !== undefined) {
            rapidThrowComboScenarioState.finalComboCount = active.comboCount;
        }
        return (
            rapidThrowComboScenarioState.firstPause
            && rapidThrowComboScenarioState.secondThrow
            && !rapidThrowComboScenarioState.secondPause
        );
    },
    failureMessage(engine: GameEngine) {
        const parts: string[] = [];
        if (!rapidThrowComboScenarioState.firstPause) parts.push('first Combo Cancel pause never fired');
        if (!rapidThrowComboScenarioState.secondThrow) parts.push('second throw never submitted');
        if (rapidThrowComboScenarioState.secondPause) parts.push('unexpected third Combo Cancel pause');
        const player = engine.getLocalPlayerUnit();
        const active = player?.activeAbilities.find((a) => a.abilityId === THROW_ROCK_ABILITY_ID);
        if (active?.comboCount !== RAPID_THROW_LEVEL_TWO) {
            parts.push(`comboCount=${active?.comboCount ?? 'none'} expected ${RAPID_THROW_LEVEL_TWO}`);
        }
        return parts.length > 0 ? parts.join('; ') : 'assertPass returned false';
    },
};

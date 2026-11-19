import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import { computeAbilityModifiersFromResearch } from '../../../../../researchTrees/evaluator';
import { getAbilityTagsForId } from '../../../abilities/Ability';
import { NODE_KNIFE_COMBO, WEAPONS_TREE_ID } from '../../../../../researchTrees/trees/weaponTreeIds';
import { ThrowKnife } from '../../../card_defs/0109_ThrowKnife/0109Ability';
import { BurstAbility_0302 } from '../../../card_defs/03_blood_mage/0302_Burst/0302Ability';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';

const P = TINY_BATTLE_PLAYER_ID;
const THROW_KNIFE_ABILITY_ID = ThrowKnife.id!;
const BURST_ABILITY_ID = BurstAbility_0302.id!;
const KNIFE_CHAIN_PAUSES = 3;
const BURST_COMBO_COUNT = KNIFE_CHAIN_PAUSES + 1;

export const throwKnifeComboScenarioState = {
    knifePauses: 0,
    burstSubmitted: false,
    burstComboCount: 0,
    burstPaused: false,
};

/** Flurry (unlimited Throw Knife Combo): Knife x3 then Burst; the chain ends at Burst (no Combo). */
export const throwKnifeComboScenario: ScenarioDefinition = {
    id: 'weapons_throw_knife_combo_chain',
    title: 'Throw Knife Combo Chain (Flurry into Burst)',
    category: 'ability',
    maxDurationMs: 12000,
    buildEngine() {
        throwKnifeComboScenarioState.knifePauses = 0;
        throwKnifeComboScenarioState.burstSubmitted = false;
        throwKnifeComboScenarioState.burstComboCount = 0;
        throwKnifeComboScenarioState.burstPaused = false;

        const researchByPlayer = {
            [P]: { [WEAPONS_TREE_ID]: [NODE_KNIFE_COMBO] },
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
            abilities: [THROW_KNIFE_ABILITY_ID, BURST_ABILITY_ID],
            playerResearchTreesByPlayer: researchByPlayer,
        });
        player.abilityModifiers = computeAbilityModifiersFromResearch(
            researchByPlayer[P],
            getAbilityTagsForId,
            player.abilities,
        );
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        return [{
            unitId: u.id,
            abilityId: THROW_KNIFE_ABILITY_ID,
            targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }],
        }];
    },
    onConditionalCancelPause(engine) {
        const player = engine.getLocalPlayerUnit();
        const dummy = engine.getUnit('target_dummy');
        if (!player || !dummy) return;

        const paused = player.activeAbilities.find((a) => a.conditionalCancelPaused);
        if (!paused) return;
        if (paused.abilityId === BURST_ABILITY_ID) {
            throwKnifeComboScenarioState.burstPaused = true;
            return;
        }
        if (paused.abilityId !== THROW_KNIFE_ABILITY_ID) return;

        throwKnifeComboScenarioState.knifePauses++;
        const isLastPause = throwKnifeComboScenarioState.knifePauses >= KNIFE_CHAIN_PAUSES;
        if (isLastPause) throwKnifeComboScenarioState.burstSubmitted = true;
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: isLastPause ? BURST_ABILITY_ID : THROW_KNIFE_ABILITY_ID,
            targets: [{ type: 'pixel', position: { x: dummy.x, y: dummy.y } }],
            endTurn: true,
        });
    },
    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return false;
        const burst = player.activeAbilities.find((a) => a.abilityId === BURST_ABILITY_ID);
        if (burst?.comboCount !== undefined) {
            throwKnifeComboScenarioState.burstComboCount = burst.comboCount;
        }
        return (
            throwKnifeComboScenarioState.knifePauses === KNIFE_CHAIN_PAUSES
            && throwKnifeComboScenarioState.burstSubmitted
            && throwKnifeComboScenarioState.burstComboCount === BURST_COMBO_COUNT
            && !throwKnifeComboScenarioState.burstPaused
            // Burst must have run to completion without a Combo pause.
            && burst === undefined
            && player.activeAbilities.every((a) => !a.conditionalCancelPaused)
        );
    },
    failureMessage(engine: GameEngine) {
        const s = throwKnifeComboScenarioState;
        const parts: string[] = [];
        if (s.knifePauses !== KNIFE_CHAIN_PAUSES) {
            parts.push(`knife pauses=${s.knifePauses} expected ${KNIFE_CHAIN_PAUSES}`);
        }
        if (!s.burstSubmitted) parts.push('Burst never submitted');
        if (s.burstComboCount !== BURST_COMBO_COUNT) {
            parts.push(`Burst comboCount=${s.burstComboCount} expected ${BURST_COMBO_COUNT}`);
        }
        if (s.burstPaused) parts.push('unexpected Combo pause after Burst');
        const player = engine.getLocalPlayerUnit();
        if (player?.activeAbilities.some((a) => a.conditionalCancelPaused)) {
            parts.push('battle still paused on a conditional cancel');
        }
        return parts.length > 0 ? parts.join('; ') : 'assertPass returned false';
    },
};

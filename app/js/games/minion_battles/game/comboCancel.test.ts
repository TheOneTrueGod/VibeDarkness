/**
 * Combo Cancel runtime: chain depth, pause windows, and comboCount propagation.
 */
import { describe, it, expect } from 'vitest';
import { getAbility } from '../abilities/AbilityRegistry';
import {
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
    AbilityPhase as Phase,
} from '../abilities/abilityTimings';
import { initializeAbilityRuntimeForUnit, syncNestedCardAbilityState, unitAbilityHasTag } from '../abilities/abilityUses';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { withComboCancelAtPhaseStart } from '../abilities/comboCancel/comboCancelTimings';
import { buildThrowBaseTimings } from '../card_defs/throwSharedTimings';
import { CastBehaviours } from '../abilities/CastBehaviours';
import { THROW_PROJECTILE_SPEED, THROW_RANGE } from '../card_defs/throwSharedTimings';
import { expandAbilityIdsForResearchModifiers } from '../abilities/abilityModifierHelpers';
import { computeAbilityModifiersFromResearch } from '../../../researchTrees/evaluator';
import { getAbilityTagsForId } from '../abilities/Ability';
import {
    EARTH_NODE_RAPID_THROW,
    EARTH_TREE_ID,
} from '../../../researchTrees/trees/earth';
import { ThrowKnife } from '../card_defs/0109_ThrowKnife/0109Ability';
import { BurstAbility_0302, BURST_HP_COST } from '../card_defs/03_blood_mage/0302_Burst/0302Ability';
import { hasConditionalCancelFollowUp } from './units/unitAbilityQueries';
import { Unit } from './units/Unit';
import { buildComboCancelDef } from '../abilities/comboCancel/comboCancelDef';
import { ENTOMB_WALL_CONDITIONAL_CANCEL } from '../abilities/entombed/entombedWallCancel';

const THROW_ROCK_ABILITY_ID = 'throw_rock';
const THROW_CHARGED_ROCK_ABILITY_ID = 'throw_charged_rock';
const COMBO_MAX_TWO = 2;
const THROW_KNIFE_ABILITY_ID = ThrowKnife.id!;
const BURST_ABILITY_ID = BurstAbility_0302.id!;
const KNIFE_CHAIN_PAUSES = 3;
const KNIFE_CHAIN_BURST_COMBO_COUNT = KNIFE_CHAIN_PAUSES + 1;
const MAX_CHAIN_TICKS = 1500;

describe('Combo Cancel runtime', () => {
    it('chains two throws via Combo Cancel then skips a third pause at comboMax', () => {
        const engine = buildTinyBattleEngine({
            gridW: 16,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const { player, dummy } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 120, y: 200 },
            dummyWorld: { x: 280, y: 200 },
            abilities: [THROW_ROCK_ABILITY_ID],
        });
        player.abilityModifiers = {
            [THROW_ROCK_ABILITY_ID]: { comboMax: COMBO_MAX_TWO },
        };
        initializeAbilityRuntimeForUnit(player);

        const target = { type: 'pixel' as const, position: { x: dummy.x, y: dummy.y } };

        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: THROW_ROCK_ABILITY_ID,
            targets: [target],
        });

        let firstPauseSeen = false;
        let secondThrowSubmitted = false;
        let secondPauseSeen = false;
        let waitSubmitted = false;

        for (let i = 0; i < 500; i++) {
            const paused = player.activeAbilities.find((a) => a.conditionalCancelPaused);
            if (paused?.abilityId === THROW_ROCK_ABILITY_ID) {
                if (!firstPauseSeen) {
                    firstPauseSeen = true;
                    expect(paused.comboCount ?? 1).toBe(1);
                    engine.state.orderMgr.applyOrder({
                        unitId: player.id,
                        abilityId: THROW_ROCK_ABILITY_ID,
                        targets: [target],
                    });
                    secondThrowSubmitted = true;
                } else if (secondThrowSubmitted && !waitSubmitted) {
                    secondPauseSeen = true;
                    engine.state.orderMgr.applyOrder({
                        unitId: player.id,
                        abilityId: 'wait',
                        targets: [],
                    });
                    waitSubmitted = true;
                }
            }

            engine.stepSimulationFixedTicks(1);
        }

        expect(firstPauseSeen).toBe(true);
        expect(secondThrowSubmitted).toBe(true);
        expect(secondPauseSeen).toBe(false);

        const lastActive = player.activeAbilities.find((a) => a.abilityId === THROW_ROCK_ABILITY_ID);
        if (lastActive) {
            expect(lastActive.comboCount).toBe(COMBO_MAX_TWO);
        }

        engine.destroy();
    });

    it('withComboCancelAtPhaseStart timings omit pause when comboCount >= comboMax', () => {
        const base = buildThrowBaseTimings({
            launchBehaviour: CastBehaviours.ProjectileLaunch()
                .withSpeed(THROW_PROJECTILE_SPEED)
                .withMaxRange(THROW_RANGE),
        });
        const timings = withComboCancelAtPhaseStart(base, Phase.Cooldown, { cooldownIntervalId: 'cooldown' });
        const ability = getAbility(THROW_ROCK_ABILITY_ID)!;
        const originalGetTimings = ability.getAbilityTimings;
        ability.getAbilityTimings = () => timings;

        const engine = buildTinyBattleEngine({
            gridW: 16,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const { player, dummy } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 120, y: 200 },
            dummyWorld: { x: 280, y: 200 },
            abilities: [THROW_ROCK_ABILITY_ID],
        });
        player.abilityModifiers = { [THROW_ROCK_ABILITY_ID]: { comboMax: COMBO_MAX_TWO } };
        player.activeAbilities = [{
            abilityId: THROW_ROCK_ABILITY_ID,
            startTime: engine.gameTime - 0.39,
            targets: [{ type: 'pixel', position: { x: dummy.x, y: dummy.y } }],
            comboCount: COMBO_MAX_TWO,
        }];

        const intervals = normalizeAbilityTimingsToIntervals(
            resolveAbilityTimingEntries(ability, player, engine),
        );
        const cancelInterval = intervals.find((t) => t.conditionalCancel != null);
        expect(cancelInterval).toBeDefined();
        const fires = cancelInterval!.conditionalCancel!.condition({
            caster: player,
            engine,
            targets: player.activeAbilities[0]!.targets,
            abilityId: THROW_ROCK_ABILITY_ID,
        });
        expect(fires).toBe(false);

        ability.getAbilityTimings = originalGetTimings;
        engine.destroy();
    });

    it('Throw Rock gets combo pause when modifiers come from bar-only throw_charged_rock + Rapid Throw', () => {
        const engine = buildTinyBattleEngine({
            gridW: 16,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const { player, dummy } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 120, y: 200 },
            dummyWorld: { x: 280, y: 200 },
            abilities: [THROW_CHARGED_ROCK_ABILITY_ID],
        });
        player.abilityModifiers = computeAbilityModifiersFromResearch(
            { [EARTH_TREE_ID]: [EARTH_NODE_RAPID_THROW] },
            getAbilityTagsForId,
            expandAbilityIdsForResearchModifiers(player.abilities),
            { [EARTH_TREE_ID]: { [EARTH_NODE_RAPID_THROW]: 2 } },
        );
        initializeAbilityRuntimeForUnit(player);
        syncNestedCardAbilityState(player);
        player.abilities[0] = THROW_ROCK_ABILITY_ID;

        const target = { type: 'pixel' as const, position: { x: dummy.x, y: dummy.y } };
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: THROW_ROCK_ABILITY_ID,
            targets: [target],
        });

        let pauseSeen = false;
        for (let i = 0; i < 500 && !pauseSeen; i++) {
            pauseSeen = player.activeAbilities.some(
                (a) => a.abilityId === THROW_ROCK_ABILITY_ID && a.conditionalCancelPaused,
            );
            engine.stepSimulationFixedTicks(1);
        }

        expect(pauseSeen).toBe(true);
        expect(player.abilityModifiers[THROW_ROCK_ABILITY_ID]?.comboMax).toBe(3);
        engine.destroy();
    });

    it('unlimited Throw Knife combo chains knife x3 into Burst, which ends the chain', () => {
        const engine = buildTinyBattleEngine({
            gridW: 16,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const { player, dummy } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 120, y: 200 },
            dummyWorld: { x: 280, y: 200 },
            abilities: [THROW_KNIFE_ABILITY_ID, BURST_ABILITY_ID],
        });
        player.abilityModifiers = { [THROW_KNIFE_ABILITY_ID]: { comboUnlimited: true } };
        initializeAbilityRuntimeForUnit(player);
        expect(player.hp).toBeGreaterThan(BURST_HP_COST);

        const target = { type: 'pixel' as const, position: { x: dummy.x, y: dummy.y } };
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: THROW_KNIFE_ABILITY_ID,
            targets: [target],
        });

        const pauseComboCounts: number[] = [];
        let burstComboCount: number | undefined;
        let burstPaused = false;
        let lastPauseTick = -1;

        for (let i = 0; i < MAX_CHAIN_TICKS; i++) {
            const pausedKnife = player.activeAbilities.find(
                (a) => a.abilityId === THROW_KNIFE_ABILITY_ID && a.conditionalCancelPaused,
            );
            if (pausedKnife && lastPauseTick !== i) {
                lastPauseTick = i;
                pauseComboCounts.push(pausedKnife.comboCount ?? 1);
                const followUp = pauseComboCounts.length < KNIFE_CHAIN_PAUSES
                    ? THROW_KNIFE_ABILITY_ID
                    : BURST_ABILITY_ID;
                engine.state.orderMgr.applyOrder({
                    unitId: player.id,
                    abilityId: followUp,
                    endTurn: true,
                    targets: [target],
                });
            }
            const burst = player.activeAbilities.find((a) => a.abilityId === BURST_ABILITY_ID);
            if (burst) {
                burstComboCount ??= burst.comboCount;
                if (burst.conditionalCancelPaused) burstPaused = true;
            }
            engine.stepSimulationFixedTicks(1);
        }

        expect(pauseComboCounts).toEqual([1, 2, 3]);
        expect(burstComboCount).toBe(KNIFE_CHAIN_BURST_COMBO_COUNT);
        expect(burstPaused).toBe(false);
        engine.destroy();
    });

    it('Rapid Throw combo window now offers a non-Combo ability (Burst) as a follow-up', () => {
        const engine = buildTinyBattleEngine({
            gridW: 16,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const { player, dummy } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 120, y: 200 },
            dummyWorld: { x: 280, y: 200 },
            abilities: [THROW_ROCK_ABILITY_ID, BURST_ABILITY_ID],
        });
        player.abilityModifiers = { [THROW_ROCK_ABILITY_ID]: { comboMax: COMBO_MAX_TWO } };
        initializeAbilityRuntimeForUnit(player);
        expect(unitAbilityHasTag(player, BURST_ABILITY_ID, 'Combo')).toBe(false);

        const target = { type: 'pixel' as const, position: { x: dummy.x, y: dummy.y } };
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: THROW_ROCK_ABILITY_ID,
            targets: [target],
        });

        let paused = player.activeAbilities.find((a) => a.conditionalCancelPaused);
        for (let i = 0; i < MAX_CHAIN_TICKS && !paused; i++) {
            engine.stepSimulationFixedTicks(1);
            paused = player.activeAbilities.find((a) => a.conditionalCancelPaused);
        }
        expect(paused?.abilityId).toBe(THROW_ROCK_ABILITY_ID);
        expect(hasConditionalCancelFollowUp(player, paused!, undefined, engine)).toBe(true);

        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: BURST_ABILITY_ID,
            endTurn: true,
            targets: [target],
        });
        engine.stepSimulationFixedTicks(1);
        expect(player.activeAbilities.some((a) => a.abilityId === BURST_ABILITY_ID)).toBe(true);
        engine.destroy();
    });

    it('exhausted throw_rock slot passes Combo tag filter after charged rock uses run out', () => {
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const { player } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 120, y: 160 },
            dummyWorld: { x: 280, y: 160 },
            abilities: [THROW_CHARGED_ROCK_ABILITY_ID],
        });
        player.abilityModifiers = computeAbilityModifiersFromResearch(
            { [EARTH_TREE_ID]: [EARTH_NODE_RAPID_THROW] },
            getAbilityTagsForId,
            expandAbilityIdsForResearchModifiers(player.abilities),
            { [EARTH_TREE_ID]: { [EARTH_NODE_RAPID_THROW]: 1 } },
        );
        initializeAbilityRuntimeForUnit(player);
        player.abilityRuntime[THROW_CHARGED_ROCK_ABILITY_ID]!.currentUses = 0;
        syncNestedCardAbilityState(player);

        // Throw Rock is reached through the Charged Rock slot's toggle, not by exhausting into it.
        expect(player.abilities[0]).toBe(THROW_CHARGED_ROCK_ABILITY_ID);
        expect(unitAbilityHasTag(player, THROW_ROCK_ABILITY_ID, 'Combo')).toBe(true);
        expect(player.abilityRuntime[THROW_ROCK_ABILITY_ID]?.currentUses ?? 0).toBeGreaterThan(0);

        engine.destroy();
    });

    it('Throw Knife combo pause carries conditionalCancelFollowUp and survives a unit JSON round trip', () => {
        const engine = buildTinyBattleEngine({
            gridW: 16,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const { player, dummy } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 120, y: 200 },
            dummyWorld: { x: 280, y: 200 },
            abilities: [THROW_KNIFE_ABILITY_ID, BURST_ABILITY_ID],
        });
        player.abilityModifiers = { [THROW_KNIFE_ABILITY_ID]: { comboUnlimited: true } };
        initializeAbilityRuntimeForUnit(player);
        expect(buildComboCancelDef().followUpDefault).toBe('same_ability');

        const target = { type: 'pixel' as const, position: { x: dummy.x, y: dummy.y } };
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: THROW_KNIFE_ABILITY_ID,
            targets: [target],
        });

        const findPaused = () => player.activeAbilities.find(
            (a) => a.abilityId === THROW_KNIFE_ABILITY_ID && a.conditionalCancelPaused,
        );
        for (let i = 0; i < MAX_CHAIN_TICKS && !findPaused(); i++) engine.stepSimulationFixedTicks(1);
        const paused = findPaused();
        expect(paused).toBeDefined();
        expect(paused!.conditionalCancelFollowUp).toBe('same_ability');

        const restored = Unit.fromJSON(
            JSON.parse(JSON.stringify(player.toJSON())) as Record<string, unknown>,
            engine.eventBus,
        );
        const restoredPaused = restored.activeAbilities.find((a) => a.abilityId === THROW_KNIFE_ABILITY_ID);
        expect(restoredPaused?.conditionalCancelPaused).toBe(true);
        expect(restoredPaused?.conditionalCancelFollowUp).toBe('same_ability');

        // The follow-up applies: the paused cast is replaced, so no cast keeps the stale hint.
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: THROW_KNIFE_ABILITY_ID,
            endTurn: true,
            targets: [target],
        });
        expect(player.activeAbilities.some((a) => a.conditionalCancelPaused)).toBe(false);
        expect(player.activeAbilities.some((a) => a.conditionalCancelFollowUp !== undefined)).toBe(false);
        engine.destroy();
    });

    it('wait at a combo pause clears conditionalCancelFollowUp', () => {
        const engine = buildTinyBattleEngine({
            gridW: 16,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const { player, dummy } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 120, y: 200 },
            dummyWorld: { x: 280, y: 200 },
            abilities: [THROW_KNIFE_ABILITY_ID],
        });
        player.abilityModifiers = { [THROW_KNIFE_ABILITY_ID]: { comboUnlimited: true } };
        initializeAbilityRuntimeForUnit(player);
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: THROW_KNIFE_ABILITY_ID,
            targets: [{ type: 'pixel', position: { x: dummy.x, y: dummy.y } }],
        });
        const findPaused = () => player.activeAbilities.find(
            (a) => a.abilityId === THROW_KNIFE_ABILITY_ID && a.conditionalCancelPaused,
        );
        for (let i = 0; i < MAX_CHAIN_TICKS && !findPaused(); i++) engine.stepSimulationFixedTicks(1);
        const paused = findPaused()!;
        expect(paused.conditionalCancelFollowUp).toBe('same_ability');
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: 'wait',
            endTurn: true,
            targets: [],
        });
        expect(paused.conditionalCancelPaused).toBe(false);
        expect(paused.conditionalCancelFollowUp).toBeUndefined();
        engine.destroy();
    });

    it('Entombed conditional cancel does not set a follow-up default', () => {
        expect(ENTOMB_WALL_CONDITIONAL_CANCEL.followUpDefault).toBeUndefined();
    });
});

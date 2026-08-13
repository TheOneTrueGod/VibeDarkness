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

const THROW_ROCK_ABILITY_ID = 'throw_rock';
const THROW_CHARGED_ROCK_ABILITY_ID = 'throw_charged_rock';
const COMBO_MAX_TWO = 2;

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

        expect(player.abilities[0]).toBe(THROW_ROCK_ABILITY_ID);
        expect(unitAbilityHasTag(player, THROW_ROCK_ABILITY_ID, 'Combo')).toBe(true);
        expect(player.abilityRuntime[THROW_ROCK_ABILITY_ID]?.currentUses ?? 0).toBeGreaterThan(0);

        engine.destroy();
    });
});

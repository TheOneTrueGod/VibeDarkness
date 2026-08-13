import { describe, it, expect } from 'vitest';
import { getAbility } from '../abilities/AbilityRegistry';
import {
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../abilities/abilityTimings';
import { buildTinyBattleEngine, placePlayerAndDummy, TINY_BATTLE_PLAYER_ID } from '../testing/harness/buildTinyBattleEngine';

const THROW_ROCK_ABILITY_ID = 'throw_rock';
const THROW_CHARGED_ROCK_ABILITY_ID = 'throw_charged_rock';

describe('throw Combo Cancel timings', () => {
    it('includes conditionalCancel when comboMax > 0', () => {
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
            abilities: [THROW_ROCK_ABILITY_ID],
        });
        player.abilityModifiers = { [THROW_ROCK_ABILITY_ID]: { comboMax: 2 } };

        const ability = getAbility(THROW_ROCK_ABILITY_ID)!;
        const intervals = normalizeAbilityTimingsToIntervals(
            resolveAbilityTimingEntries(ability, player, engine),
        );
        expect(intervals.some((t) => t.conditionalCancel?.abilityTagFilter?.includes('Combo'))).toBe(true);
        engine.destroy();
    });

    it('Throw Charged Rock includes conditionalCancel when comboMax > 0', () => {
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
        player.abilityModifiers = { [THROW_CHARGED_ROCK_ABILITY_ID]: { comboMax: 2 } };

        const ability = getAbility(THROW_CHARGED_ROCK_ABILITY_ID)!;
        const intervals = normalizeAbilityTimingsToIntervals(
            resolveAbilityTimingEntries(ability, player, engine),
        );
        expect(intervals.some((t) => t.conditionalCancel?.abilityTagFilter?.includes('Combo'))).toBe(true);
        engine.destroy();
    });

    it('omits combo conditionalCancel when comboMax is zero', () => {
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
            abilities: [THROW_ROCK_ABILITY_ID],
        });

        const ability = getAbility(THROW_ROCK_ABILITY_ID)!;
        const intervals = normalizeAbilityTimingsToIntervals(
            resolveAbilityTimingEntries(ability, player, engine),
        );
        const comboCancel = intervals.find(
            (t) => t.conditionalCancel?.abilityTagFilter?.includes('Combo'),
        );
        expect(comboCancel).toBeUndefined();
        engine.destroy();
    });
});

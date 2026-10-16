import { describe, it, expect } from 'vitest';
import { getAbility } from '../abilities/AbilityRegistry';
import { AbilityState } from '../abilities/Ability';
import {
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../abilities/abilityTimings';
import { buildTinyBattleEngine, placePlayerAndDummy, TINY_BATTLE_PLAYER_ID } from '../testing/harness/buildTinyBattleEngine';
import {
    BASE_THROW_PROFILE,
    BASE_THROW_WINDUP_END,
    ROCK_THROW_PROFILE,
    beginThrowCastPayload,
    throwMovementPenaltyStatesForActive,
} from './throwSharedTimings';
import type { ActiveAbility } from '../game/types';

const ROCK_THROW_IDS = ['throw_rock', 'throw_charged_rock', 'earth_core_throw_rock'] as const;

function penaltyAt(active: ActiveAbility, t: number): number | null {
    const entry = throwMovementPenaltyStatesForActive(t, active).find(
        (e) => e.state === AbilityState.MOVEMENT_PENALTY,
    );
    return entry && entry.state === AbilityState.MOVEMENT_PENALTY ? entry.data.amount : null;
}

describe('rock throw timing profile', () => {
    it('winds up 20% longer than the base throw', () => {
        expect(ROCK_THROW_PROFILE.windupEnd).toBeCloseTo(BASE_THROW_WINDUP_END * 1.2);
        expect(ROCK_THROW_PROFILE.prefireTime).toBeCloseTo(ROCK_THROW_PROFILE.windupEnd);
    });

    it('slows (never stops) movement, harder during the windup than the base throw', () => {
        expect(ROCK_THROW_PROFILE.windupMovementPenalty).toBeGreaterThan(0);
        expect(ROCK_THROW_PROFILE.windupMovementPenalty).toBeLessThan(BASE_THROW_PROFILE.windupMovementPenalty);

        const active = { castPayload: beginThrowCastPayload(false, ROCK_THROW_PROFILE) } as ActiveAbility;
        expect(penaltyAt(active, 0.1)).toBe(ROCK_THROW_PROFILE.windupMovementPenalty);
        expect(penaltyAt(active, ROCK_THROW_PROFILE.windupEnd + 0.01)).toBe(ROCK_THROW_PROFILE.movementPenalty);
        expect(penaltyAt(active, ROCK_THROW_PROFILE.movementPenaltyUntil + 0.01)).toBeNull();
    });

    it.each(ROCK_THROW_IDS)('%s uses the rock profile windup in its live timeline', (abilityId) => {
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
            abilities: [abilityId],
        });
        const ability = getAbility(abilityId)!;
        const intervals = normalizeAbilityTimingsToIntervals(
            resolveAbilityTimingEntries(ability, player, engine),
        );
        const windup = intervals.find((t) => t.id === 'windup');
        expect(windup?.end).toBeCloseTo(ROCK_THROW_PROFILE.windupEnd);
        expect(ability.prefireTime).toBeCloseTo(ROCK_THROW_PROFILE.windupEnd);
        engine.destroy();
    });

    it('Throw Knife keeps the base throw windup', () => {
        const knife = getAbility('throw_knife');
        if (!knife) return;
        expect(knife.prefireTime).toBeCloseTo(BASE_THROW_WINDUP_END);
    });
});

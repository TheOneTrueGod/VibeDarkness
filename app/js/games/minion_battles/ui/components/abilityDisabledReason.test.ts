import { describe, expect, it } from 'vitest';
import { Unit } from '../../game/units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import { getAbility } from '../../abilities/AbilityRegistry';
import { getAbilityDisabledReason, getDisabledReasonDisplay } from './abilityDisabledReason';

const THROW_CHARGED_ROCK_ID = 'throw_charged_rock';

function makePlayer(lightChargesPerRound: number): Unit {
    return new Unit({
        id: 'player',
        x: 0,
        y: 0,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'Player',
        abilities: [THROW_CHARGED_ROCK_ID],
        radius: DEFAULT_UNIT_RADIUS,
        roundStartRecoveryCharges: lightChargesPerRound > 0
            ? [{ chargeType: 'lightCharge', amount: lightChargesPerRound }]
            : [],
    });
}

function noUsesText(player: Unit): string {
    const reason = getAbilityDisabledReason({
        playerUnit: player,
        ability: getAbility(THROW_CHARGED_ROCK_ID)!,
        abilityId: THROW_CHARGED_ROCK_ID,
        currentUses: 0,
        isMyTurn: true,
        allUnits: [player],
    });
    expect(reason?.reason_id).toBe('no_uses_remaining');
    return getDisabledReasonDisplay(reason!).description;
}

describe('no uses remaining on a charge-recovered ability', () => {
    it('names the Light charge needed and the Light charges gained per round', () => {
        expect(noUsesText(makePlayer(1))).toBe('Requires 1 Light charge. You gain 1 per round.');
    });

    it('reports zero per-round gain when no equipment grants the charge', () => {
        expect(noUsesText(makePlayer(0))).toBe('Requires 1 Light charge. You gain 0 per round.');
    });
});

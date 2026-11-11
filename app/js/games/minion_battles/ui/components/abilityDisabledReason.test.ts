import { describe, expect, it } from 'vitest';
import { Unit } from '../../game/units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import { getAbility } from '../../abilities/AbilityRegistry';
import { getAbilityDisabledReason, getDisabledReasonDisplay } from './abilityDisabledReason';
import { AbilityPhase, normalizeAbilityTimingsToIntervals } from '../../abilities/abilityTimings';
import { petStateOf } from '../../game/units/components/petComponent';
import { CAST_PRIORITY } from '../../game/units/castPriority';
import { FLING_THORN_ABILITY_ID } from '../../card_defs/07_command_core/0705_FlingThorn/0705Ability';
import { FLING_THORN_COMMAND_ID } from '../../card_defs/07_command_core/0714_FlingThornCommand/0714Ability';
import type { ActiveAbility } from '../../game/types';

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

describe('requireFree pet-sourced abilities', () => {
    function scene(withPet = true) {
        const owner = makePlayer(0);
        const units: Unit[] = [owner];
        let pet: Unit | null = null;
        if (withPet) {
            pet = new Unit({
                id: 'pet', x: 40, y: 0, hp: 100, maxHp: 100, speed: 100, teamId: 'player', ownerId: 'p1',
                characterId: 'dog', name: 'Spirit', radius: DEFAULT_UNIT_RADIUS,
            });
            petStateOf(pet).ownerUnitId = owner.id;
            petStateOf(pet).defId = 'dog';
            petStateOf(owner).unitIds.push(pet.id);
            units.push(pet);
        }
        return { owner, pet, units, engine: { gameTime: 0 } };
    }

    /** A commanded (Major) Fling Thorns cast on the pet, started at t=0. */
    function commandFlingThorns(pet: Unit): void {
        pet.activeAbilities.push({
            abilityId: FLING_THORN_ABILITY_ID, startTime: 0, targets: [], castBehaviourPayloads: {}, evadeFired: false,
            castPriority: CAST_PRIORITY.Major,
        } as unknown as ActiveAbility);
    }

    function reasonFor(owner: Unit, units: Unit[], engine: { gameTime: number }) {
        return getAbilityDisabledReason({
            playerUnit: owner,
            ability: getAbility(FLING_THORN_COMMAND_ID)!,
            abilityId: FLING_THORN_COMMAND_ID,
            currentUses: 1,
            isMyTurn: true,
            allUnits: units,
            engine,
        });
    }

    it('is disabled as no_free_spirit while the only spirit is busy', () => {
        const { owner, pet, units, engine } = scene();
        commandFlingThorns(pet!);
        const reason = reasonFor(owner, units, engine);
        expect(reason?.reason_id).toBe('no_free_spirit');
        expect(getDisabledReasonDisplay(reason!)).toEqual({
            title: 'Not Available',
            description: 'Requires an unoccupied spirit animal.',
        });
    });

    it('is enabled while the spirit is in a Major cooldown', () => {
        const { owner, pet, units, engine } = scene();
        commandFlingThorns(pet!);
        const cooldown = normalizeAbilityTimingsToIntervals(getAbility(FLING_THORN_ABILITY_ID)!.abilityTimings!)
            .find((t) => t.abilityPhase === AbilityPhase.Cooldown)!;
        engine.gameTime = cooldown.start + 0.01;
        expect(reasonFor(owner, units, engine)).toBeNull();
    });

    it('is still no_pet_source without a pet', () => {
        const { owner, units, engine } = scene(false);
        expect(reasonFor(owner, units, engine)?.reason_id).toBe('no_pet_source');
    });
});

/**
 * `abilitySource.requireFree`: only free pets (not `isUnitBusy`) count as sources, and the caster-pet
 * anchor honours the same rule (a pet the caster's own cast holds comes first).
 */
import { describe, expect, it } from 'vitest';
import './AbilityRegistry';
import { getAbility } from './AbilityRegistry';
import { AbilityPhase, normalizeAbilityTimingsToIntervals } from './abilityTimings';
import { Unit } from '../game/units/Unit';
import { petStateOf } from '../game/units/components/petComponent';
import { CAST_PRIORITY } from '../game/units/castPriority';
import { resolveAbilitySourceUnits, resolveMidCastSourceUnit } from './abilitySourceUnits';
import { resolveCasterPetAnchor } from './targeting';
import { PetSpinBehaviour } from './CastBehaviours/PetBehaviours';
import { FLING_THORN_ABILITY_ID } from '../card_defs/07_command_core/0705_FlingThorn/0705Ability';
import type { ActiveAbility } from '../game/types';

function makeUnit(id: string, x: number, teamId: 'player' | 'enemy', characterId = 'target_dummy'): Unit {
    return new Unit({ id, x, y: 0, hp: 100, maxHp: 100, speed: 100, teamId, ownerId: teamId === 'player' ? 'p1' : 'ai', characterId, name: id });
}

function petOf(owner: Unit, id: string, x: number): Unit {
    const pet = makeUnit(id, x, 'player', 'dog');
    petStateOf(pet).ownerUnitId = owner.id;
    petStateOf(pet).defId = 'dog';
    petStateOf(owner).unitIds.push(pet.id);
    return pet;
}

/** A commanded Fling Thorns windup on the pet: Major, so the pet is busy. */
function makeBusy(pet: Unit): void {
    pet.activeAbilities.push({
        abilityId: FLING_THORN_ABILITY_ID, startTime: 0, targets: [], castBehaviourPayloads: {}, evadeFired: false,
        castPriority: CAST_PRIORITY.Major,
    } as unknown as ActiveAbility);
}

function scene() {
    const owner = makeUnit('owner', 0, 'player', 'hero');
    const near = petOf(owner, 'near', 40);
    const far = petOf(owner, 'far', 300);
    const units = [owner, near, far];
    const engine = { units, gameTime: 0, getUnit: (id: string) => units.find((u) => u.id === id) };
    return { owner, near, far, units, engine };
}

const FREE_NEAREST = { abilitySource: { type: 'pet' as const, selector: 'nearest' as const, requireFree: true as const } };
const FREE_ALL = { abilitySource: { type: 'pet' as const, selector: 'all' as const, requireFree: true as const } };
const NEAREST = { abilitySource: { type: 'pet' as const, selector: 'nearest' as const } };

describe('resolveAbilitySourceUnits with requireFree', () => {
    it('picks the free pet even when the busy one is nearer', () => {
        const { owner, near, far, units, engine } = scene();
        makeBusy(near);
        expect(resolveAbilitySourceUnits(FREE_NEAREST, owner, units, undefined, engine)).toEqual([far]);
        expect(resolveAbilitySourceUnits(FREE_ALL, owner, units, undefined, engine)).toEqual([far]);
        // Without requireFree the nearest pet is used, busy or not (Order: Move, Guard, Attack).
        expect(resolveAbilitySourceUnits(NEAREST, owner, units, undefined, engine)).toEqual([near]);
    });

    it('resolves to nothing when every pet is busy', () => {
        const { owner, near, far, units, engine } = scene();
        makeBusy(near);
        makeBusy(far);
        expect(resolveAbilitySourceUnits(FREE_NEAREST, owner, units, undefined, engine)).toEqual([]);
    });

    it('a pet in a Major cooldown is free', () => {
        const { owner, near, units, engine } = scene();
        makeBusy(near);
        const cooldown = normalizeAbilityTimingsToIntervals(getAbility(FLING_THORN_ABILITY_ID)!.abilityTimings!)
            .find((t) => t.abilityPhase === AbilityPhase.Cooldown)!;
        engine.gameTime = cooldown.start + 0.01;
        const pets = resolveAbilitySourceUnits(FREE_NEAREST, owner, units, undefined, engine);
        expect(pets).toEqual([near]);
    });
});

describe('resolveCasterPetAnchor with requireFree', () => {
    it('skips a busy pet, and prefers a pet the caster already holds', () => {
        const { owner, near, far, engine } = scene();
        expect(resolveCasterPetAnchor(owner, engine, { requireFree: true })).toBe(near);
        makeBusy(near);
        expect(resolveCasterPetAnchor(owner, engine, { requireFree: true })).toBe(far);
        expect(resolveCasterPetAnchor(owner, engine)).toBe(near);

        near.activeAbilities = [];
        // The owner's storm holds the far pet: it is the owner's, so it comes first even though it is farther.
        const active = { abilityId: '0713', castBehaviourPayloads: { storm_1: { petId: far.id, cx: 300, cy: 0, seconds: 1 } } } as unknown as ActiveAbility;
        owner.activeCastBehaviours.set('storm_1', {
            entry: { timingStart: 'start', timingEnd: 'end', behaviour: new PetSpinBehaviour() },
            intervalStart: 0, intervalEnd: 1, caster: owner, active,
        });
        expect(resolveCasterPetAnchor(owner, engine, { requireFree: true })).toBe(far);
    });
});

describe('resolveMidCastSourceUnit', () => {
    it('keeps the busy pet the cast already committed (a mid-cast confirm step), not the caster', () => {
        const { owner, near, units, engine } = scene();
        makeBusy(near);
        const ability = { abilitySource: { type: 'pet' as const, selector: 'nearest' as const, requireFree: true as const } };
        expect(resolveAbilitySourceUnits(ability, owner, units, undefined, engine)[0]?.id).toBe('far');
        expect(resolveMidCastSourceUnit(ability, owner, units).id).toBe('near');
    });

    it('falls back to the caster with no pet', () => {
        const owner = makeUnit('owner', 0, 'player', 'hero');
        const ability = { abilitySource: { type: 'pet' as const, selector: 'nearest' as const, requireFree: true as const } };
        expect(resolveMidCastSourceUnit(ability, owner, [owner]).id).toBe('owner');
    });
});

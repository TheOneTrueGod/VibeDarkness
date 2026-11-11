import { describe, expect, it } from 'vitest';
import { registerAbilityForTest } from '../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { PetSpinBehaviour } from '../../abilities/CastBehaviours/PetBehaviours';
import { EventBus } from '../EventBus';
import type { ActiveAbility } from '../types';
import { Unit } from './Unit';
import {
    CAST_PRIORITY,
    canPreempt,
    getCastEffectivePriority,
    getUnitEffectivePriority,
    isUnitBusy,
} from './castPriority';

/** Windup [0,1), active [1,2), cooldown [2,3). */
const PHASED: AbilityStatic = {
    id: 'test_cast_priority_phased',
    name: 'Phased',
    image: '',
    cooldownTime: 0,
    resourceCost: null,
    rechargeTurns: 0,
    targets: [],
    abilityTimings: [
        { id: 'windup', start: 0, end: 1, abilityPhase: AbilityPhase.Windup },
        { id: 'active', start: 1, end: 2, abilityPhase: AbilityPhase.Active },
        { id: 'cooldown', start: 2, end: 3, abilityPhase: AbilityPhase.Cooldown },
    ],
} as unknown as AbilityStatic;
registerAbilityForTest(PHASED);

function makeUnit(id: string): Unit {
    return new Unit({
        id, x: 0, y: 0, hp: 100, maxHp: 100, speed: 100,
        teamId: 'player', ownerId: 'p1', characterId: 'target_dummy', name: id,
    });
}

function cast(castPriority?: number): ActiveAbility {
    return {
        abilityId: PHASED.id,
        startTime: 0,
        targets: [],
        ...(castPriority !== undefined ? { castPriority } : {}),
    };
}

const at = (gameTime: number) => ({ gameTime });

describe('cast priority', () => {
    it('an idle unit is Idle (0)', () => {
        const u = makeUnit('u');
        expect(CAST_PRIORITY.Idle).toBe(0);
        expect(getUnitEffectivePriority(u, [u], at(0))).toBe(CAST_PRIORITY.Idle);
        expect(isUnitBusy(u, [u], at(0))).toBe(false);
    });

    it('an unstamped cast counts as Minor', () => {
        const u = makeUnit('u');
        u.activeAbilities.push(cast());
        expect(getCastEffectivePriority(u, u.activeAbilities[0], at(0.5))).toBe(CAST_PRIORITY.Minor);
        expect(getUnitEffectivePriority(u, [u], at(0.5))).toBe(CAST_PRIORITY.Minor);
    });

    it('a Major cast is Major in windup and active, Minor in cooldown', () => {
        const u = makeUnit('u');
        u.activeAbilities.push(cast(CAST_PRIORITY.Major));
        expect(getUnitEffectivePriority(u, [u], at(0.5))).toBe(CAST_PRIORITY.Major);
        expect(getUnitEffectivePriority(u, [u], at(1.5))).toBe(CAST_PRIORITY.Major);
        expect(isUnitBusy(u, [u], at(1.5))).toBe(true);
        expect(getUnitEffectivePriority(u, [u], at(2.5))).toBe(CAST_PRIORITY.Minor);
        expect(isUnitBusy(u, [u], at(2.5))).toBe(false);
    });

    it('takes the highest cast', () => {
        const u = makeUnit('u');
        u.activeAbilities.push(cast(), cast(CAST_PRIORITY.Major));
        expect(getUnitEffectivePriority(u, [u], at(0.5))).toBe(CAST_PRIORITY.Major);
    });

    it("a unit held by another unit's cast is Major", () => {
        const owner = makeUnit('owner');
        const pet = makeUnit('pet');
        const key = 'storm_1';
        const active = { abilityId: '0713', castBehaviourPayloads: { [key]: { petId: pet.id, cx: 0, cy: 0, seconds: 1 } } } as unknown as ActiveAbility;
        owner.activeCastBehaviours.set(key, {
            entry: { timingStart: 'start', timingEnd: 'end', behaviour: new PetSpinBehaviour() },
            intervalStart: 0, intervalEnd: 1, caster: owner, active,
        });
        expect(getUnitEffectivePriority(pet, [owner, pet], at(0))).toBe(CAST_PRIORITY.Major);
        expect(isUnitBusy(pet, [owner, pet], at(0))).toBe(true);
        expect(canPreempt(pet, CAST_PRIORITY.Major, [owner, pet], at(0))).toBe(false);
    });

    it('preempting needs strictly greater priority', () => {
        const u = makeUnit('u');
        expect(canPreempt(u, CAST_PRIORITY.Minor, [u], at(0))).toBe(true);
        u.activeAbilities.push(cast());
        expect(canPreempt(u, CAST_PRIORITY.Minor, [u], at(0.5))).toBe(false);
        expect(canPreempt(u, CAST_PRIORITY.Major, [u], at(0.5))).toBe(true);
        u.activeAbilities[0].castPriority = CAST_PRIORITY.Major;
        expect(canPreempt(u, CAST_PRIORITY.Major, [u], at(0.5))).toBe(false);
        // Cooldown caps it at Minor: Major preempts, Minor still can't.
        expect(canPreempt(u, CAST_PRIORITY.Major, [u], at(2.5))).toBe(true);
        expect(canPreempt(u, CAST_PRIORITY.Minor, [u], at(2.5))).toBe(false);
    });

    it('castPriority survives a unit toJSON / fromJSON round trip, and is omitted when undefined', () => {
        const u = makeUnit('u');
        u.activeAbilities.push(cast(CAST_PRIORITY.Major), cast());
        const json = u.toJSON();
        const serialized = json.activeAbilities as Record<string, unknown>[];
        expect(serialized[0].castPriority).toBe(CAST_PRIORITY.Major);
        expect('castPriority' in serialized[1]).toBe(false);

        const restored = Unit.fromJSON(JSON.parse(JSON.stringify(json)) as Record<string, unknown>, new EventBus());
        expect(restored.activeAbilities[0].castPriority).toBe(CAST_PRIORITY.Major);
        expect(restored.activeAbilities[1].castPriority).toBeUndefined();
        expect('castPriority' in restored.activeAbilities[1]).toBe(false);
    });
});

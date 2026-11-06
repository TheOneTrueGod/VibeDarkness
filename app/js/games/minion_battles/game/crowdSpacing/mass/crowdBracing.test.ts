import { describe, expect, it } from 'vitest';
import { Unit } from '../../units/Unit';
import { UnitTag } from '../../units/unitTag';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { getAbility } from '../../../abilities/AbilityRegistry';
import type { ActiveAbility } from '../../types';
import { isCrowdBraced, isInBracingWindup } from './crowdBracing';

/** Alpha Wolf Charge (a ChargeAttack): windup [0, 1), lunge [1, 1.3), cooldown after. */
const CHARGE_ID = '0007';
const CHARGE_WINDUP_END = 1;
const CAST_START_LOCAL = 10;
const FAR_WORLD_TIME = 100;

function makeUnit(tags: UnitTag[] = []): Unit {
    const unit = new Unit({
        id: 'w1',
        x: 0,
        y: 0,
        hp: 10,
        speed: 40,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'alpha_wolf',
        name: 'Bracing Test',
        radius: 20,
        abilities: [],
    });
    unit.tags = [...tags];
    return unit;
}

function startCast(unit: Unit, abilityId: string, startTime = 0): void {
    unit.activeAbilities.push({ abilityId, startTime, targets: [] } as unknown as ActiveAbility);
}

describe('isCrowdBraced', () => {
    it('a plain idle unit is not braced', () => {
        expect(isCrowdBraced(makeUnit(), { gameTime: 0 })).toBe(false);
    });

    it('Structure and CrowdSpacingAnchor tags brace', () => {
        expect(isCrowdBraced(makeUnit([UnitTag.Structure]), { gameTime: 0 })).toBe(true);
        expect(isCrowdBraced(makeUnit([UnitTag.CrowdSpacingAnchor]), { gameTime: 0 })).toBe(true);
    });

    it('forced movers (knockback, controlled) brace', () => {
        const kb = makeUnit();
        kb.knockback = {
            knockbackVector: { x: CELL_SIZE, y: 0 },
            knockbackAirTime: 0.5,
            knockbackSlideTime: 0.2,
            knockbackSource: { unitId: 'src', abilityId: 'test' },
            knockbackElapsed: 0,
        };
        expect(isCrowdBraced(kb, { gameTime: 0 })).toBe(true);
        const ctl = makeUnit();
        ctl.controlled = true;
        expect(isCrowdBraced(ctl, { gameTime: 0 })).toBe(true);
    });

    it('a ChargeAttack wolf is braced during windup only', () => {
        expect(getAbility(CHARGE_ID)).toBeDefined();
        const wolf = makeUnit();
        startCast(wolf, CHARGE_ID, 0);
        expect(isCrowdBraced(wolf, { gameTime: 0 })).toBe(true);
        expect(isCrowdBraced(wolf, { gameTime: CHARGE_WINDUP_END * 0.5 })).toBe(true);
        // Lunge (Active) and cooldown are not windup.
        expect(isCrowdBraced(wolf, { gameTime: CHARGE_WINDUP_END + 0.1 })).toBe(false);
        expect(isCrowdBraced(wolf, { gameTime: CHARGE_WINDUP_END + 1 })).toBe(false);
    });

    it('reads cast elapsed from the unit local clock when it is running', () => {
        const wolf = makeUnit();
        startCast(wolf, CHARGE_ID, CAST_START_LOCAL);
        wolf.localClockActive = true;
        wolf.localTime = CAST_START_LOCAL + CHARGE_WINDUP_END * 0.5;
        // World time is far past the windup; the local clock is what counts.
        expect(isInBracingWindup(wolf, { gameTime: FAR_WORLD_TIME })).toBe(true);
        wolf.localTime = CAST_START_LOCAL + CHARGE_WINDUP_END + 0.1;
        expect(isInBracingWindup(wolf, { gameTime: FAR_WORLD_TIME })).toBe(false);
    });

    it('crowdBraceDuringWindup: false opts the windup out', () => {
        const ability = getAbility(CHARGE_ID)!;
        const wolf = makeUnit();
        startCast(wolf, CHARGE_ID, 0);
        const prev = Object.getOwnPropertyDescriptor(ability, 'crowdBraceDuringWindup');
        Object.defineProperty(ability, 'crowdBraceDuringWindup', { value: false, configurable: true });
        try {
            expect(isCrowdBraced(wolf, { gameTime: CHARGE_WINDUP_END * 0.5 })).toBe(false);
        } finally {
            if (prev) Object.defineProperty(ability, 'crowdBraceDuringWindup', prev);
            else delete (ability as { crowdBraceDuringWindup?: boolean }).crowdBraceDuringWindup;
        }
        expect(isCrowdBraced(wolf, { gameTime: CHARGE_WINDUP_END * 0.5 })).toBe(true);
    });

    it('unknown ability ids are ignored', () => {
        const unit = makeUnit();
        startCast(unit, 'no_such_ability', 0);
        expect(isCrowdBraced(unit, { gameTime: 0 })).toBe(false);
    });
});

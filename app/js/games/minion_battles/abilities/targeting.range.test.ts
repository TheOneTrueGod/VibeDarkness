import { describe, expect, it } from 'vitest';
import {
    clampResolvedTargetToAbilityRange,
    getAbilityMaxRange,
} from './targeting';
import { resolveCastBehaviourTarget } from './resolveCastBehaviourTarget';
import type { AbilityStatic } from './Ability';
import type { ActiveAbility, ResolvedTarget } from '../game/types';
import type { Unit } from '../game/units/Unit';
import type { AbilityTimingInterval } from './abilityTimings';
import { AbilityPhase } from './abilityTimings';
import type { CastBehaviourEntry } from './castBehaviourTypes';

const TEST_MAX_RANGE = 200;

const rangedPixelAbility = {
    id: 'test_ranged',
    getRange: () => ({ minRange: 0, maxRange: TEST_MAX_RANGE }),
} as AbilityStatic;

const mockCaster = { id: 'caster', x: 100, y: 100, teamId: 'p1' } as Unit;
const mockEngine = {
    getUnit(id: string) {
        if (id === 'far_enemy') return { x: 100 + TEST_MAX_RANGE + 80, y: 100 };
        return null;
    },
};

describe('getAbilityMaxRange', () => {
    it('reads maxRange from getRange', () => {
        expect(getAbilityMaxRange(rangedPixelAbility, mockCaster)).toBe(TEST_MAX_RANGE);
    });

    it('falls back to aiSettings.maxRange', () => {
        const ability = {
            id: 'ai_ranged',
            aiSettings: { minRange: 0, maxRange: 150 },
        } as AbilityStatic;
        expect(getAbilityMaxRange(ability, mockCaster)).toBe(150);
    });
});

describe('clampResolvedTargetToAbilityRange', () => {
    it('leaves in-range pixel targets unchanged', () => {
        const target: ResolvedTarget = {
            type: 'pixel',
            position: { x: mockCaster.x + 50, y: mockCaster.y },
        };
        expect(clampResolvedTargetToAbilityRange(rangedPixelAbility, mockCaster, target, mockEngine))
            .toEqual(target);
    });

    it('clamps out-of-range pixel targets to max range along click direction', () => {
        const beyond = { x: mockCaster.x + TEST_MAX_RANGE + 100, y: mockCaster.y };
        const clamped = clampResolvedTargetToAbilityRange(
            rangedPixelAbility,
            mockCaster,
            { type: 'pixel', position: beyond },
            mockEngine,
        );
        expect(clamped).toEqual({
            type: 'pixel',
            position: { x: mockCaster.x + TEST_MAX_RANGE, y: mockCaster.y },
        });
    });

    it('clamps out-of-range unit targets to a pixel at max range', () => {
        const clamped = clampResolvedTargetToAbilityRange(
            rangedPixelAbility,
            mockCaster,
            { type: 'unit', unitId: 'far_enemy' },
            mockEngine,
        );
        expect(clamped.type).toBe('pixel');
        expect(clamped.position).toEqual({
            x: mockCaster.x + TEST_MAX_RANGE,
            y: mockCaster.y,
        });
    });
});

describe('resolveCastBehaviourTarget range clamp', () => {
    it('clamps stored pixel targets when resolving cast behaviour', () => {
        const beyond = { x: mockCaster.x + TEST_MAX_RANGE + 100, y: mockCaster.y };
        const active: ActiveAbility = {
            abilityId: rangedPixelAbility.id,
            startTime: 0,
            targets: [{ type: 'pixel', position: beyond }],
            targetsByLabel: { Target: { type: 'pixel', position: beyond } },
        };
        const interval: AbilityTimingInterval = {
            id: 'active',
            start: 0,
            end: 1,
            abilityPhase: AbilityPhase.Active,
            targetDef: { kind: 'select', label: 'Target', hitbox: { numTargets: 1 } as never, filter: 'any', allowMiss: true },
        };
        const entry: CastBehaviourEntry = {
            timingStart: 'start',
            timingEnd: 'end',
            behaviour: { onTick: () => {} },
        };
        const target = resolveCastBehaviourTarget(
            entry,
            interval,
            active,
            mockCaster,
            rangedPixelAbility,
            mockEngine,
        );
        expect(target).toEqual({
            type: 'pixel',
            position: { x: mockCaster.x + TEST_MAX_RANGE, y: mockCaster.y },
        });
    });
});

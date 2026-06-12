/**
 * Unit tests for defineAbility() factory.
 *
 * Covers:
 *  - getRange derived from the first interval's targetDef.hitbox.maxRange
 *  - movementLock generating MOVEMENT_PENALTY until `until`
 *  - aiSettings.maxRange synthesised from hitbox when omitted
 *  - fallback error when no hitbox is found and getRange is not provided
 *  - explicit getRange / getAbilityStates override still honoured
 */

import { describe, expect, it } from 'vitest';
import { defineAbility, type AbilityDefInput } from './defineAbility';
import { AbilityState } from './Ability';
import { AbilityPhase } from './abilityTimings';
import type { HitboxSpec } from '../hitboxes/HitboxSpec';

// ---------------------------------------------------------------------------
// Minimal HitboxSpec stub
// ---------------------------------------------------------------------------

function makeHitboxStub(maxRange: number): HitboxSpec {
    return {
        maxRange,
        numTargets: 1,
        renderTargetingPreview: () => [],
        resolveTargets: () => [],
        resolveHits: () => [],
    } as unknown as HitboxSpec;
}

// ---------------------------------------------------------------------------
// Minimal AbilityDefInput factory
// ---------------------------------------------------------------------------

function makeMinimalDef(overrides: Partial<AbilityDefInput> = {}): AbilityDefInput {
    return {
        id: 'test_ability',
        name: 'Test Ability',
        image: '',
        resourceCost: null,
        rechargeTurns: 1,
        prefireTime: 0.2,
        targets: [],
        abilityTimings: [
            {
                id: 'windup',
                start: 0,
                end: 0.2,
                abilityPhase: AbilityPhase.Windup,
            },
            {
                id: 'active',
                start: 0.2,
                end: 0.4,
                abilityPhase: AbilityPhase.Active,
                targetDef: {
                    kind: 'select',
                    label: 'Target',
                    hitbox: makeHitboxStub(50),
                    filter: 'enemy',
                },
            },
            { id: 'cooldown', start: 0.4, end: 1.2, abilityPhase: AbilityPhase.Cooldown },
        ],
        getTooltipText: () => ['Test tooltip'],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests: getRange derivation from hitbox
// ---------------------------------------------------------------------------

describe('defineAbility — getRange from hitbox', () => {
    it('returns { minRange: 0, maxRange: hitbox.maxRange } for any caster', () => {
        const ability = defineAbility(makeMinimalDef());
        const range = ability.getRange!({} as never);
        expect(range).toEqual({ minRange: 0, maxRange: 50 });
    });

    it('uses the first interval that has a targetDef.hitbox (skips windup with no targetDef)', () => {
        // windup has no targetDef; active has hitbox maxRange=75
        const def = makeMinimalDef({
            abilityTimings: [
                { id: 'windup', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
                {
                    id: 'active',
                    start: 0.2,
                    end: 0.5,
                    abilityPhase: AbilityPhase.Active,
                    targetDef: { kind: 'select', label: 'T', hitbox: makeHitboxStub(75), filter: 'enemy' },
                },
            ],
        });
        const ability = defineAbility(def);
        expect(ability.getRange!({} as never)).toEqual({ minRange: 0, maxRange: 75 });
    });

    it('honours an explicit getRange when provided', () => {
        const customGetRange = () => ({ minRange: 10, maxRange: 200 });
        const ability = defineAbility(makeMinimalDef({ getRange: customGetRange }));
        expect(ability.getRange!({} as never)).toEqual({ minRange: 10, maxRange: 200 });
    });

    it('throws when no targetDef hitbox is present and getRange is not provided', () => {
        const def: AbilityDefInput = {
            ...makeMinimalDef(),
            abilityTimings: [
                { id: 'windup', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
                { id: 'active', start: 0.2, end: 0.5, abilityPhase: AbilityPhase.Active },
            ],
        };
        expect(() => defineAbility(def)).toThrow(/no explicit getRange/);
    });
});

// ---------------------------------------------------------------------------
// Tests: movementLock → getAbilityStates
// ---------------------------------------------------------------------------

describe('defineAbility — movementLock generates getAbilityStates', () => {
    it('returns MOVEMENT_PENALTY while currentTime < until', () => {
        const ability = defineAbility(makeMinimalDef({ movementLock: { until: 0.4 } }));
        const states = ability.getAbilityStates(0.2);
        expect(states).toHaveLength(1);
        expect(states[0].state).toBe(AbilityState.MOVEMENT_PENALTY);
        expect((states[0] as { data: { amount: number } }).data.amount).toBe(0);
    });

    it('returns [] once currentTime >= until', () => {
        const ability = defineAbility(makeMinimalDef({ movementLock: { until: 0.4 } }));
        expect(ability.getAbilityStates(0.4)).toEqual([]);
        expect(ability.getAbilityStates(1.0)).toEqual([]);
    });

    it('returns [] at every time when movementLock is omitted', () => {
        const ability = defineAbility(makeMinimalDef());
        expect(ability.getAbilityStates(0)).toEqual([]);
        expect(ability.getAbilityStates(0.1)).toEqual([]);
    });

    it('honours explicit getAbilityStates over movementLock', () => {
        const customStates = () => [{ state: AbilityState.IFRAMES as const }];
        const ability = defineAbility(
            makeMinimalDef({ movementLock: { until: 0.4 }, getAbilityStates: customStates }),
        );
        const states = ability.getAbilityStates(0.1);
        expect(states[0].state).toBe(AbilityState.IFRAMES);
    });
});

// ---------------------------------------------------------------------------
// Tests: aiSettings defaults
// ---------------------------------------------------------------------------

describe('defineAbility — aiSettings defaulted from hitbox', () => {
    it('synthesises aiSettings when omitted and hitbox is present', () => {
        const ability = defineAbility(makeMinimalDef({ aiSettings: undefined }));
        expect(ability.aiSettings).toEqual({ minRange: 0, maxRange: 50 });
    });

    it('leaves aiSettings as-is when the caller provides it', () => {
        const ability = defineAbility(
            makeMinimalDef({ aiSettings: { minRange: 5, maxRange: 100 } }),
        );
        expect(ability.aiSettings).toEqual({ minRange: 5, maxRange: 100 });
    });
});

// ---------------------------------------------------------------------------
// Tests: onAttackBlocked is optional (no default no-op)
// ---------------------------------------------------------------------------

describe('defineAbility — onAttackBlocked is optional', () => {
    it('is undefined when not provided', () => {
        const ability = defineAbility(makeMinimalDef());
        expect(ability.onAttackBlocked).toBeUndefined();
    });

    it('honours a custom onAttackBlocked when provided', () => {
        let called = false;
        const ability = defineAbility(makeMinimalDef({
            onAttackBlocked: () => { called = true; },
        }));
        ability.onAttackBlocked!({} as never, {} as never, {} as never);
        expect(called).toBe(true);
    });
});

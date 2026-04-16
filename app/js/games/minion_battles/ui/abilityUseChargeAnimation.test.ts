import { describe, expect, it } from 'vitest';
import {
    ABILITY_USE_CHARGE_ANIM_MS,
    buildChargeAnimFrames,
    buildUsesOnlyAnimFrames,
    computeAnimatedChargeDisplay,
    getChargeTransitionKind,
    simulateApplyOneCharge,
    snapshotChargeAnimState,
} from './abilityUseChargeAnimation';
import type { UnitAbilityRuntimeState } from '../game/units/Unit';

describe('simulateApplyOneCharge', () => {
    it('fills then rolls over when buffer reaches N', () => {
        const s = simulateApplyOneCharge({ uses: 1, charge: 2, maxUses: 5 }, 3, 1);
        expect(s).toEqual({ uses: 2, charge: 0, maxUses: 5 });
    });

    it('increments charge without rollover', () => {
        const s = simulateApplyOneCharge({ uses: 2, charge: 0, maxUses: 5 }, 3, 1);
        expect(s).toEqual({ uses: 2, charge: 1, maxUses: 5 });
    });

    it('respects usesRecovered > 1', () => {
        const s = simulateApplyOneCharge({ uses: 1, charge: 1, maxUses: 5 }, 2, 2);
        expect(s.uses).toBe(3);
        expect(s.charge).toBe(0);
    });
});

describe('buildChargeAnimFrames', () => {
    it('builds the example path from (1,2) to (3,1) with N=3', () => {
        const frames = buildChargeAnimFrames({ uses: 1, charge: 2, maxUses: 5 }, { uses: 3, charge: 1, maxUses: 5 }, 3, 1);
        expect(frames[0]).toEqual({ uses: 1, charge: 2, maxUses: 5 });
        expect(frames[1]).toEqual({ uses: 1, charge: 3, maxUses: 5 });
        expect(frames[2]).toEqual({ uses: 2, charge: 0, maxUses: 5 });
        expect(frames[frames.length - 1]).toEqual({ uses: 3, charge: 1, maxUses: 5 });
    });

    it('reverses spend then charge gain', () => {
        const frames = buildChargeAnimFrames({ uses: 3, charge: 1, maxUses: 5 }, { uses: 1, charge: 2, maxUses: 5 }, 3, 1);
        expect(frames[0]).toEqual({ uses: 3, charge: 1, maxUses: 5 });
        expect(frames[1]).toEqual({ uses: 2, charge: 1, maxUses: 5 });
        expect(frames[2]).toEqual({ uses: 1, charge: 1, maxUses: 5 });
        expect(frames[3]).toEqual({ uses: 1, charge: 2, maxUses: 5 });
    });

    it('returns a single frame when unchanged', () => {
        const a = { uses: 2, charge: 1, maxUses: 3 };
        const frames = buildChargeAnimFrames(a, a, 3, 1);
        expect(frames).toEqual([a]);
    });
});

describe('computeAnimatedChargeDisplay', () => {
    it('distributes duration across transitions', () => {
        const frames = buildChargeAnimFrames({ uses: 1, charge: 2, maxUses: 5 }, { uses: 3, charge: 1, maxUses: 5 }, 3, 1);
        const transitions = frames.length - 1;
        const d0 = computeAnimatedChargeDisplay(frames, 0, ABILITY_USE_CHARGE_ANIM_MS, 3);
        expect(d0.fillingSegmentIndex).toBe(2);
        expect(d0.chargeFloor).toBe(2);

        const midFirst = computeAnimatedChargeDisplay(frames, (ABILITY_USE_CHARGE_ANIM_MS / transitions) * 0.5, ABILITY_USE_CHARGE_ANIM_MS, 3);
        expect(midFirst.fillProgress).toBeGreaterThan(0.3);

        const atSecond = computeAnimatedChargeDisplay(frames, (ABILITY_USE_CHARGE_ANIM_MS / transitions) * 1.01, ABILITY_USE_CHARGE_ANIM_MS, 3);
        expect(getChargeTransitionKind(frames[1]!, frames[2]!, 3)).toBe('rollover');
        expect(atSecond.uses).toBe(1);
        expect(atSecond.chargeFloor).toBe(3);
    });
});

describe('buildUsesOnlyAnimFrames', () => {
    it('steps uses up and down', () => {
        const up = buildUsesOnlyAnimFrames({ uses: 1, charge: 0, maxUses: 3 }, { uses: 3, charge: 0, maxUses: 3 });
        expect(up.map((f) => f.uses)).toEqual([1, 2, 3]);
        const down = buildUsesOnlyAnimFrames({ uses: 3, charge: 0, maxUses: 3 }, { uses: 1, charge: 0, maxUses: 3 });
        expect(down.map((f) => f.uses)).toEqual([3, 2, 1]);
    });
});

describe('snapshotChargeAnimState', () => {
    it('reads stamina charge from runtime', () => {
        const runtime: UnitAbilityRuntimeState = {
            maxUses: 2,
            currentUses: 1,
            recoveryChargesByType: { staminaCharge: 1, lightCharge: 0, energyCharge: 0 },
        };
        const snap = snapshotChargeAnimState(runtime, {
            chargeType: 'staminaCharge',
            chargesPerRecovery: 2,
            usesRecovered: 1,
        });
        expect(snap).toEqual({ uses: 1, charge: 1, maxUses: 2 });
    });
});

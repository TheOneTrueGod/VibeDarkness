import { describe, expect, it } from 'vitest';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { FLING_THORN_ABILITY_ID, FLING_THORN_COUNT, FLING_THORN_DAMAGE, FLING_THORN_SPREAD_DEG } from './0705Ability';
import { ProjectileLaunchBehaviour } from '../../../abilities/CastBehaviours/ProjectileLaunchBehaviour';
import { SpellCircleBehaviour } from '../../../abilities/CastBehaviours/SpellCircleBehaviour';
import type { AbilityTimingInterval } from '../../../abilities/abilityTimings';

describe('Fling Thorns 0705', () => {
    it('is a pet-only ordered shot: no aiSettings, restored by commandCharge', () => {
        const ability = getAbility(FLING_THORN_ABILITY_ID);
        expect(ability).toBeDefined();
        expect(ability!.name).toBe('Fling Thorns');
        expect(ability!.aiSettings).toBeUndefined();
        expect(ability!.recoveries).toEqual([{ chargeType: 'commandCharge', chargesPerRecovery: 1, usesRecovered: 1 }]);
        expect(FLING_THORN_DAMAGE).toBe(2);
        expect(FLING_THORN_COUNT).toBe(5);
    });

    it('winds up under a spell circle, then flings each thorn at its own time and random angle', () => {
        const ability = getAbility(FLING_THORN_ABILITY_ID)!;
        const [windup, fire, cooldown] = ability.abilityTimings as AbilityTimingInterval[];
        expect(windup!.castBehaviours![0]!.behaviour).toBeInstanceOf(SpellCircleBehaviour);

        const launches = fire!.castBehaviours!;
        expect(launches).toHaveLength(FLING_THORN_COUNT);
        const offsets = launches.map((e) => e.timingStart as number);
        expect(new Set(offsets).size).toBe(FLING_THORN_COUNT);
        expect(Math.max(...offsets)).toBeLessThan(fire!.end - fire!.start);
        for (const entry of launches) {
            expect(entry.behaviour).toBeInstanceOf(ProjectileLaunchBehaviour);
            expect((entry.behaviour as unknown as { randomSpreadDeg: number }).randomSpreadDeg).toBe(FLING_THORN_SPREAD_DEG);
        }
        // A visible recovery after the last thorn.
        expect(cooldown!.end - cooldown!.start).toBeGreaterThanOrEqual(0.5);
    });
});

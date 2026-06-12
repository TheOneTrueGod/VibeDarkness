import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../../../testing/runner/SimulationRunner';
import { earthCoreKnockScenario } from '../../../testing/scenarios/abilities/earthCoreScenarios';
import { getAbility } from '../../../abilities/AbilityRegistry';
import {
    AbilityPhase,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
    getEffectiveCastBehaviours,
} from '../../../abilities/abilityTimings';
import { ProjectileLaunchBehaviour } from '../../../abilities/CastBehaviours/ProjectileLaunchBehaviour';

describe('Knock', () => {
    it('ability is registered and has an active interval with ProjectileLaunch', () => {
        const ability = getAbility('0531');
        expect(ability).toBeDefined();
        const activeInterval = ability!.abilityTimings.find(
            (t) => 'abilityPhase' in t && t.abilityPhase === AbilityPhase.Active,
        );
        expect(activeInterval).toBeDefined();
        expect('behaviour' in activeInterval! && activeInterval.behaviour).toBeInstanceOf(ProjectileLaunchBehaviour);
    });

    it('projectile hits enemy (scenario)', () => {
        const r = runScenarioHeadless(earthCoreKnockScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('debug: normalized intervals have behaviour field', () => {
        const knockAbility = getAbility('0531')!;
        const knockIntervals = normalizeAbilityTimingsToIntervals(resolveAbilityTimingEntries(knockAbility));
        console.log('Knock intervals:', JSON.stringify(knockIntervals.map(it => ({
            id: it.id,
            start: it.start,
            end: it.end,
            abilityPhase: it.abilityPhase,
            hasBehaviour: 'behaviour' in it,
            effectiveBehaviours: getEffectiveCastBehaviours(it)?.length ?? 0,
        }))));

        const activeInterval = knockIntervals.find(it => it.abilityPhase === AbilityPhase.Active);
        expect(activeInterval, 'active interval exists after normalization').toBeDefined();
        const behaviours = getEffectiveCastBehaviours(activeInterval!);
        expect(behaviours, 'active interval has effective behaviours').toBeDefined();
        expect(behaviours![0]?.behaviour, 'active interval behaviour is ProjectileLaunchBehaviour').toBeInstanceOf(ProjectileLaunchBehaviour);
    });
});

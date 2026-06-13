import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../../../testing/runner/SimulationRunner';
import { earthCoreKnockScenario } from '../../../testing/scenarios/abilities/earthCoreScenarios';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { AbilityPhase } from '../../../abilities/abilityTimings';
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
});

import { describe, it, expect } from 'vitest';
import { runScenarioHeadless } from './SimulationRunner';
import { getScenarioById } from '../scenarios/registry';
import { pathShortCommuteScenario } from '../scenarios/general/pathfinding';
import {
    punchBaselineScenario,
    punchNEWBaselineScenario,
    punchStrongScenario,
    punchDoubleScenario,
    punchSneakyScenario,
    punchChargingScenario,
    bashRangeBoundaryHitScenario,
    bashRangeBoundaryMissScenario,
    doublePunchTwoTargetsScenario,
} from '../scenarios/abilities/punchResearch';
import { swingSwordExtraUsesScenario } from '../scenarios/abilities/swingSwordResearch';
import { swingBatHitsThreeTargetsScenario } from '../scenarios/abilities/swingBatScenarios';
import { absorptionShieldEnergyChargeScenario } from '../scenarios/abilities/absorptionShieldScenario';
import {
    raiseShieldBlocksScenario,
    raiseShieldAllyStaminaSurgeScenario,
    shiningBlockRetaliationScenario,
    shiningBlockStrengtheningLightScenario,
} from '../scenarios/abilities/techShieldScenarios';
import { lanterniteNestBuildScenario, lanterniteNestDualSpawnScenario, lanterniteDefenderAttackScenario } from '../scenarios/general/lanternites';
import { alphaWolfEnrageTriggersScenario, alphaWolfSummonScenario, exposedDurationExtensionScenario } from '../scenarios/general/enemies';
import { swarmlingHuntAndBiteScenario } from '../scenarios/general/swarmlings';
import { lightingIlluminatesAreaScenario, lightDelayedFadeScenario, campfireDecayScenario } from '../scenarios/general/lightingSystem';
import {
    earthCoreEarthernPunchScenario,
    earthCoreShakingGroundScenario,
    earthCoreShatterScenario,
    earthCoreStoneTombScenario,
    earthCoreKnockScenario,
    earthCoreAnchoredTremorScenario,
    earthCoreStoneyPunchBaselineScenario,
    earthCoreStoneyPunchArmourScenario,
    earthCoreBoarClawsScenario,
    earthCoreImpactConversionScenario,
    earthCoreBedrockScavengerScenario,
    earthCoreDeepResonanceScenario,
} from '../scenarios/abilities/earthCoreScenarios';

describe('runScenarioHeadless', () => {
    it('passes short pathfinding commute', () => {
        const r = runScenarioHeadless(pathShortCommuteScenario);
        expect(r.passed).toBe(true);
        expect(r.ticks).toBeGreaterThan(0);
    });

    it('passes punch baseline damage scenario', () => {
        const r = runScenarioHeadless(punchBaselineScenario);
        expect(r.passed).toBe(true);
    });

    it('passes strong punch stun scenario', () => {
        const r = runScenarioHeadless(punchStrongScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes double punch two-strike scenario', () => {
        const r = runScenarioHeadless(punchDoubleScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes sneaky punch bonus damage scenario', () => {
        const r = runScenarioHeadless(punchSneakyScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes charging punch light charge scenario', () => {
        const r = runScenarioHeadless(punchChargingScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes PunchNEW (0120) baseline damage scenario', () => {
        const r = runScenarioHeadless(punchNEWBaselineScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes Bash range boundary hit scenario (dummy at maxRange-1)', () => {
        const r = runScenarioHeadless(bashRangeBoundaryHitScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes Bash range boundary miss scenario (dummy at maxRange+5)', () => {
        const r = runScenarioHeadless(bashRangeBoundaryMissScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes Double Punch two-targets scenario (each timing hits a different dummy)', () => {
        const r = runScenarioHeadless(doublePunchTwoTargetsScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes swing sword extra uses research scenario', () => {
        const r = runScenarioHeadless(swingSwordExtraUsesScenario);
        expect(r.passed).toBe(true);
    });

    it('passes swing bat hits 3 of 4 targets with knockback scenario', () => {
        const r = runScenarioHeadless(swingBatHitsThreeTargetsScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes absorption shield energy charge on block scenario', () => {
        const r = runScenarioHeadless(absorptionShieldEnergyChargeScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('getScenarioById returns registered scenario', () => {
        const s = getScenarioById('path_short_commute');
        expect(s?.id).toBe('path_short_commute');
    });

    it('passes raise shield blocks attack scenario', () => {
        const r = runScenarioHeadless(raiseShieldBlocksScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes raise shield ally stamina surge on block scenario', () => {
        const r = runScenarioHeadless(raiseShieldAllyStaminaSurgeScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes shining block retaliation on block scenario', () => {
        const r = runScenarioHeadless(shiningBlockRetaliationScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes shining block strengthening light heal scenario', () => {
        const r = runScenarioHeadless(shiningBlockStrengtheningLightScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes lanternite light-pulse attack scenario', () => {
        const r = runScenarioHeadless(lanterniteDefenderAttackScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes lanternite nest build scenario', () => {
        const r = runScenarioHeadless(lanterniteNestBuildScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes lanternite nest dual-spawn scenario (scout builds + defender guards)', () => {
        const r = runScenarioHeadless(lanterniteNestDualSpawnScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core earthern punch scenario', () => {
        const r = runScenarioHeadless(earthCoreEarthernPunchScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core shaking ground scenario', () => {
        const r = runScenarioHeadless(earthCoreShakingGroundScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core shatter with armour bonus scenario', () => {
        const r = runScenarioHeadless(earthCoreShatterScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core stone tomb scenario', () => {
        const r = runScenarioHeadless(earthCoreStoneTombScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core knock scenario', () => {
        const r = runScenarioHeadless(earthCoreKnockScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core anchored tremor scenario', () => {
        const r = runScenarioHeadless(earthCoreAnchoredTremorScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core stoney punch baseline scenario', () => {
        const r = runScenarioHeadless(earthCoreStoneyPunchBaselineScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core stoney punch armour bonus scenario', () => {
        const r = runScenarioHeadless(earthCoreStoneyPunchArmourScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core boar claws dash scenario', () => {
        const r = runScenarioHeadless(earthCoreBoarClawsScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core impact conversion resonance scenario', () => {
        const r = runScenarioHeadless(earthCoreImpactConversionScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core bedrock scavenger round start scenario', () => {
        const r = runScenarioHeadless(earthCoreBedrockScavengerScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core deep resonance tremorsense radius scenario', () => {
        const r = runScenarioHeadless(earthCoreDeepResonanceScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes alpha wolf enrage triggers scenario', () => {
        const r = runScenarioHeadless(alphaWolfEnrageTriggersScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes alpha wolf summon scenario (spawned wolves attack and damage player)', () => {
        const r = runScenarioHeadless(alphaWolfSummonScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes exposed duration extension scenario (absorbed stuns extend the exposed window)', () => {
        const r = runScenarioHeadless(exposedDurationExtensionScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes lighting illuminates area scenario', () => {
        const r = runScenarioHeadless(lightingIlluminatesAreaScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes light delayed fade scenario', () => {
        const r = runScenarioHeadless(lightDelayedFadeScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes campfire light decay scenario', () => {
        const r = runScenarioHeadless(campfireDecayScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes swarmling hunt-and-bite scenario (4 swarmlings land 4 bites)', () => {
        const r = runScenarioHeadless(swarmlingHuntAndBiteScenario);
        expect(r.passed, r.message).toBe(true);
    });
});

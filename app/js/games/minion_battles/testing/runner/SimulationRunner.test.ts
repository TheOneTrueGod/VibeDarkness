import { describe, it, expect } from 'vitest';
import { runScenarioHeadless } from './SimulationRunner';
import { getScenarioById } from '../scenarios/registry';
import { pathShortCommuteScenario, dodgeIFrameProtectionScenario } from '../scenarios/general/pathfinding';
import {
    punchNEWBaselineScenario,
    punchStrongScenario,
    punchDoubleScenario,
    punchSneakyScenario,
    punchChargingScenario,
    bashRangeBoundaryHitScenario,
    bashRangeBoundaryMissScenario,
    doublePunchTwoTargetsScenario,
    doublePunchMovementReplanScenario,
} from '../scenarios/abilities/punchResearch';
import { doublePunchDeathFallbackScenario } from '../scenarios/abilities/doublePunchScenario';
import { swingSwordExtraUsesScenario } from '../scenarios/abilities/swingSwordResearch';
import { swingBatHitsThreeTargetsScenario } from '../scenarios/abilities/swingBatScenarios';
import { swingBatSequentialAimPixelScenario } from '../scenarios/abilities/swingBatSequentialAim';
import { beastClawFrontHitBackMissScenario } from '../scenarios/abilities/beastClawScenarios';
import { throwKnifePiercingBleedScenario } from '../scenarios/abilities/throwKnifeScenarios';
import { throwRockExactlyOnceScenario } from '../scenarios/abilities/throwRockResearch';
import { clawMovementDistanceScenario } from '../scenarios/abilities/clawScenarios';
import { absorptionShieldEnergyChargeScenario } from '../scenarios/abilities/absorptionShieldScenario';
import {
    raiseShieldBlocksScenario,
    raiseShieldAllyStaminaSurgeScenario,
    shiningBlockRetaliationScenario,
    shiningBlockStrengtheningLightScenario,
    shiningBlockStaminaOnBlockScenario,
    absorptionShieldStaminaOnBlockScenario,
} from '../scenarios/abilities/techShieldScenarios';
import { lanterniteNestBuildScenario, lanterniteNestDualSpawnScenario, lanterniteSharedConstructionScenario, lanterniteDefenderAttackScenario, lanterniteDefenderTracksMovingTargetScenario } from '../scenarios/general/lanternites';
import { lanterniteDeathBehaviorsScenario, lanterniteNestOwnedNoRespawnScenario } from '../scenarios/general/lanterniteDeath';
import { alphaWolfEnrageTriggersScenario, alphaWolfSummonScenario } from '../scenarios/general/enemies';
import { npcControlScenario } from '../scenarios/general/npcControl';
import {
    swarmlingHuntAndBiteScenario,
    swarmlingSharedConstructionScenario,
    swarmlingContestsOccupiedNestScenario,
} from '../scenarios/general/swarmlings';
import { petAutoEngageScenario, petHeelScenario, petSicEmPounceScenario } from '../scenarios/general/pets';
import { lightingIlluminatesAreaScenario, lightDelayedFadeScenario, campfireDecayScenario } from '../scenarios/general/lightingSystem';
import { aiPlanHoldStabilityScenario } from '../scenarios/ai/ai_plan_hold_stability';
import { aiTerrainInterruptScenario } from '../scenarios/ai/ai_terrain_interrupt';
import { worldModifierDarkSwarmScenario, worldModifierMidBattleAddScenario } from '../scenarios/general/worldModifiers';
import { deathVfxUnitDefEffectsFireScenario, deathVfxAlphaWolfUnchangedScenario } from '../scenarios/general/deathVfx';
import { aiReplanStaggerScenario } from '../scenarios/ai/ai_replan_stagger';
import { aiSerializationRoundtripScenario } from '../scenarios/ai/ai_serialization_roundtrip';
import { throwTorchHitsDummyScenario } from '../scenarios/abilities/throwTorchScenario';
import { lightImbuementAndImbuedBatScenario } from '../scenarios/abilities/lightImbuementScenario';
import { lightBlastCommittedScenario } from '../scenarios/abilities/lightBlastScenario';
import { gatherLightCommittedScenario } from '../scenarios/abilities/gatherLightScenario';
import { gravityGrazeScenario } from '../scenarios/abilities/gravityGrazeScenario';
import { gravityLocusScenario } from '../scenarios/abilities/gravityLocusScenario';
import { forcePushScenario } from '../scenarios/abilities/forcePushScenario';
import { gravityInversionScenario } from '../scenarios/abilities/gravityInversionScenario';
import { gravityShieldScenario } from '../scenarios/abilities/gravityShieldScenario';
import {
    energyBlastStrictPriorityFillScenario,
    imbuedBatConeStrictFillScenario,
    liftStrictPriorityFillScenario,
    lightBlastStrictPriorityFillScenario,
} from '../scenarios/abilities/strictLockOnScenarios';
import { pistolHitsDummyScenario, smgHitsDummyScenario, shotgunHitsDummyScenario } from '../scenarios/abilities/gunScenarios';
import {
    earthCoreEarthernPunchScenario,
    earthCoreShakingGroundScenario,
    earthCoreShatterScenario,
    earthCoreStoneTombScenario,
    earthCoreKnockScenario,
    earthCoreAnchoredTremorScenario,
    earthCoreStoneyPunchBaselineScenario,
    earthCoreStoneyPunchArmourScenario,
    earthCoreDiggingClawsScenario,
    earthCoreDiggingClawsRetargetScenario,
    earthCoreDiggingClawsThrowRockEntombScenario,
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

    it('dodge iframes block wolf charge and slime projectile', () => {
        const r = runScenarioHeadless(dodgeIFrameProtectionScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes punch baseline damage scenario', () => {
        const r = runScenarioHeadless(punchNEWBaselineScenario);
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

    it('passes Double Punch movement re-plan scenario (movePath + movementByLabel committed run)', () => {
        const r = runScenarioHeadless(doublePunchMovementReplanScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes Double Punch death-fallback scenario (punch2 hits when punch1 kills target)', () => {
        const r = runScenarioHeadless(doublePunchDeathFallbackScenario);
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

    it('passes swing bat sequential aim pixel: lock-on hit + lunge toward click pixel', () => {
        const r = runScenarioHeadless(swingBatSequentialAimPixelScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes beast claw: front dummy hit, back dummy missed scenario', () => {
        const r = runScenarioHeadless(beastClawFrontHitBackMissScenario);
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

    it('passes shining block stamina on block scenario', () => {
        const r = runScenarioHeadless(shiningBlockStaminaOnBlockScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes absorption shield stamina on block scenario', () => {
        const r = runScenarioHeadless(absorptionShieldStaminaOnBlockScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes lanternite light-pulse attack scenario', () => {
        const r = runScenarioHeadless(lanterniteDefenderAttackScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes lanternite light-pulse tracks moving target scenario', () => {
        const r = runScenarioHeadless(lanterniteDefenderTracksMovingTargetScenario);
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

    it('passes lanternite shared construction scenario (two scouts, one nest, faster build)', () => {
        const r = runScenarioHeadless(lanterniteSharedConstructionScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes lanternite death: torch off and respawn fires', () => {
        const r = runScenarioHeadless(lanterniteDeathBehaviorsScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes lanternite death: nest-owned skips respawn', () => {
        const r = runScenarioHeadless(lanterniteNestOwnedNoRespawnScenario);
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

    it('passes earth core digging claws wall-dash scenario', () => {
        const r = runScenarioHeadless(earthCoreDiggingClawsScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes earth core digging claws conditional-cancel retarget scenario', () => {
        const r = runScenarioHeadless(earthCoreDiggingClawsRetargetScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Entomb Chain (Digging Claws & Throw Rock)', () => {
        const r = runScenarioHeadless(earthCoreDiggingClawsThrowRockEntombScenario);
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

    it('passes NPC control scenario (player-owned wolf scratches team-player dummy)', () => {
        const r = runScenarioHeadless(npcControlScenario);
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

    it('passes swarmling shared construction scenario (two swarmlings, one nest, faster build)', () => {
        const r = runScenarioHeadless(swarmlingSharedConstructionScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes swarmling contests occupied nest scenario (nearest node wins, always contests)', () => {
        const r = runScenarioHeadless(swarmlingContestsOccupiedNestScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes throw knife piercing bleed scenario', () => {
        const r = runScenarioHeadless(throwKnifePiercingBleedScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('throw rock deals damage exactly once (not twice)', () => {
        const r = runScenarioHeadless(throwRockExactlyOnceScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes Claw (0111): caster moves full max distance on open terrain', () => {
        const r = runScenarioHeadless(clawMovementDistanceScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes pet auto-engage scenario (dog bites enemy within leash)', () => {
        const r = runScenarioHeadless(petAutoEngageScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes pet Heel scenario (0703): heals 30% max HP', () => {
        const r = runScenarioHeadless(petHeelScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it("passes pet Sic 'em + Pounce scenario (0704/0702): dog dashes, stops on hit, stuns enemy", () => {
        const r = runScenarioHeadless(petSicEmPounceScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('AI: hunt unit keeps same targetUnitId across rounds (plan hold stability)', () => {
        const r = runScenarioHeadless(aiPlanHoldStabilityScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('AI: terrain-stone-damaged event near waypoint triggers replan (terrain interrupt)', () => {
        const r = runScenarioHeadless(aiTerrainInterruptScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('AI: 6 hunt units get at least 3 distinct holdUntilTick values (replan stagger)', () => {
        const r = runScenarioHeadless(aiReplanStaggerScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('AI: tactical plan survives toJSON / fromJSON round-trip (serialization roundtrip)', () => {
        const r = runScenarioHeadless(aiSerializationRoundtripScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('World Modifiers: swarmling death spawns dark light for 5 rounds', () => {
        const r = runScenarioHeadless(worldModifierDarkSwarmScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('World Modifiers: mid-battle level event adds storm modifier and increments counter', () => {
        const r = runScenarioHeadless(worldModifierMidBattleAddScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Death VFX: slime produces DarkCreatureIconDeath, boar produces ParticleImage', () => {
        const r = runScenarioHeadless(deathVfxUnitDefEffectsFireScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Death VFX: alpha wolf death triggers story pause (world modifier path unchanged)', () => {
        const r = runScenarioHeadless(deathVfxAlphaWolfUnchangedScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Throw Torch (0601) creates a light source at the target location', () => {
        const r = runScenarioHeadless(throwTorchHitsDummyScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Light Imbuement (0802) + Imbued Bat (0803): full cast flow deals damage', () => {
        const r = runScenarioHeadless(lightImbuementAndImbuedBatScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Light Blast (0801): committed cast damages dummy and leaves torch light', () => {
        const r = runScenarioHeadless(lightBlastCommittedScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Gather Light (0804): grants Light and darkens caster tile by exactly one step', () => {
        const r = runScenarioHeadless(gatherLightCommittedScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Gravity graze: proximity fills gravity faster than isolation', () => {
        const r = runScenarioHeadless(gravityGrazeScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Gravity Locus (0901): push nudges outward and pull draws inward without interrupting windup', () => {
        const r = runScenarioHeadless(gravityLocusScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Force Push (0902): unit-unit collision and terrain bounce deal authored damage', () => {
        const r = runScenarioHeadless(forcePushScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Lift (0903): lift lock, slam damage, and pull lands at caster', () => {
        const r = runScenarioHeadless(gravityInversionScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Gravity Shield (0904): grants a high-armour shield that drains in one round', () => {
        const r = runScenarioHeadless(gravityShieldScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Lift (0903): strict priority fill drops leavers', () => {
        const r = runScenarioHeadless(liftStrictPriorityFillScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Light Blast (0801): strict priority fill drops leavers', () => {
        const r = runScenarioHeadless(lightBlastStrictPriorityFillScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Energy Blast (0114): explosion priority fill drops leavers', () => {
        const r = runScenarioHeadless(energyBlastStrictPriorityFillScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Imbued Bat (0803): cone strict fill drops leavers', () => {
        const r = runScenarioHeadless(imbuedBatConeStrictFillScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Pistol (0203): dummy at mid range takes damage from at least one shot', () => {
        const r = runScenarioHeadless(pistolHitsDummyScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('SMG (0204): dummy at mid range takes damage from the spray', () => {
        const r = runScenarioHeadless(smgHitsDummyScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('Shotgun (0205): dummy at close range takes damage from the pellet blast', () => {
        const r = runScenarioHeadless(shotgunHitsDummyScenario);
        expect(r.passed, r.message).toBe(true);
    });
});

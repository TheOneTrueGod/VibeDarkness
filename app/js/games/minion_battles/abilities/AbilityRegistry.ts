/**
 * AbilityRegistry - Central map of all abilities keyed by ID.
 *
 * Import and register every ability here so that the rest of the
 * system can look them up by ID string.
 */

import { setAbilityTagResolver, type AbilityStatic } from './Ability';
import { ThrowRock } from '../card_defs/0107_ThrowRock/0107Ability';
import { ThrowChargedRock } from '../card_defs/0108_ThrowChargedRock/0108Ability';
import { ThrowKnife } from '../card_defs/0109_ThrowKnife/0109Ability';
import { DodgeAbility } from '../card_defs/0101_Dodge/0101Ability';
import { SlimeShotAbility } from '../card_defs/0001_SlimeShot/0001Ability';
import { EnemyMeleeAttackAbility } from '../card_defs/0002_EnemyMeleeAttack/0002Ability';
import { DoublePunchAbility } from '../card_defs/0116_DoublePunch/0116Ability';
import { StrongPunchAbility } from '../card_defs/0117_StrongPunch/0117Ability';
import { SneakyPunchAbility } from '../card_defs/0118_SneakyPunch/0118Ability';
import { ChargingPunchAbility } from '../card_defs/0119_ChargingPunch/0119Ability';
import { PunchNEWAbility } from '../card_defs/0120_PunchNEW/0120Ability';
import { SwingStickAbility_0103 } from '../card_defs/0103_SwingStick/0103Ability';
import { SwingBatAbility_0115 } from '../card_defs/0115_SwingBat/0115Ability';
import { LaserSwordAbility } from '../card_defs/0105_LaserSword/0105Ability';
import { DarkWolfBiteAbility } from '../card_defs/dark_animals/0003_DarkWolfBite/0003Ability';
import { AlphaWolfClawAbility } from '../card_defs/dark_animals/0004_AlphaWolfClaw/0004Ability';
import { AlphaWolfSummonAbility } from '../card_defs/dark_animals/0005_AlphaWolfSummon/0005Ability';
import { BoarChargeAbility } from '../card_defs/dark_animals/0006_BoarCharge/0006Ability';
import { AlphaWolfChargeAbility } from '../card_defs/dark_animals/0007_AlphaWolfCharge/0007Ability';
import { AlphaWolfTripleChargeAbility } from '../card_defs/dark_animals/0011_AlphaWolfTripleCharge/0011Ability';
import { AlphaWolfScratchAbility } from '../card_defs/dark_animals/0012_AlphaWolfScratch/0012Ability';
import { SwarmlingBiteAbility } from '../card_defs/dark_animals/0013_SwarmlingBite/0013Ability';
import { RaiseShieldAbility } from '../card_defs/0104_RaiseShield/0104Ability';
import { LaserShieldAbility } from '../card_defs/0106_LaserShield/0106Ability';
import { ThrowTorchAbility } from '../card_defs/utility/0601_ThrowTorch/0601Ability';
import { PistolAbility } from '../card_defs/0203_Pistol/0203Ability';
import { SMGAbility } from '../card_defs/0204_SMG/0204Ability';
import { ShotgunAbility } from '../card_defs/0205_Shotgun/0205Ability';
import { ShiningBlockAbility } from '../card_defs/0110_ShiningBlock/0110Ability';
import { BeastClawAbility } from '../card_defs/utility/0611_BeastClaw/0611Ability';
import { ClawAbility } from '../card_defs/0111_Claw/0111Ability';
import { SwingSwordAbility } from '../card_defs/0112_SwingSword/0112Ability';
import { AbsorptionShieldAbility } from '../card_defs/0113_AbsorptionShield/0113Ability';
import { EnergyBlastAbility } from '../card_defs/0114_EnergyBlast/0114Ability';
import { ConeOfLightAbility } from '../card_defs/0121_ConeOfLight/0121Ability';
import { ImpactConversionAbility } from '../card_defs/05_earth_core/0521_ImpactConversion/0521Ability';
import { BedrockScavengerAbility } from '../card_defs/05_earth_core/0522_BedrockScavenger/0522Ability';
import { DeepResonanceAbility } from '../card_defs/05_earth_core/0523_DeepResonance/0523Ability';
import { EarthernPunchAbility } from '../card_defs/05_earth_core/0524_EarthernPunch/0524Ability';
import { ShakingGroundAbility } from '../card_defs/05_earth_core/0525_ShakingGround/0525Ability';
import { ShatterAbility } from '../card_defs/05_earth_core/0526_Shatter/0526Ability';
import { FaultHarvest } from '../card_defs/05_earth_core/0528_FaultHarvest/0528Ability';
import { SeismicGuard } from '../card_defs/05_earth_core/0529_SeismicGuard/0529Ability';
import { StoneTomb } from '../card_defs/05_earth_core/0530_StoneTomb/0530Ability';
import { KnockAbility } from '../card_defs/05_earth_core/0531_Knock/0531Ability';
import { AnchoredTremor } from '../card_defs/05_earth_core/0532_AnchoredTremor/0532Ability';
import { StoneyPunch } from '../card_defs/05_earth_core/0533_StoneyPunch/0533Ability';
import { DiggingClawsAbility } from '../card_defs/05_earth_core/0534_DiggingClaws/0534Ability';
import { EarthCoreThrowRock } from '../card_defs/05_earth_core/0535_EarthCoreThrowRock/0535Ability';
import { ThornbinderBrambleAbility } from '../card_defs/0008_ThornbinderBramble/0008Ability';
import { ThornStompAbility } from '../card_defs/0016_ThornStomp/0016Ability';
import { HuskSeedBarrageAbility } from '../card_defs/0009_HuskSeedBarrage/0009Ability';
import { LanterniteStrikeAbility } from '../card_defs/0010_LanterniteStrike/0010Ability';
import { LanterniteNestAuraAbility } from '../card_defs/dark_animals/0014_LanterniteNestAura/0014Ability';
import { ThornlingBiteAbility } from '../card_defs/dark_animals/0015_ThornlingBite/0015Ability';
import { DogBiteAbility } from '../card_defs/07_command_core/0701_DogBite/0701Ability';
import { PounceAbility } from '../card_defs/07_command_core/0702_Pounce/0702Ability';
import { PetAbility } from '../card_defs/07_command_core/0703_Pet/0703Ability';
import { SicEmAbility } from '../card_defs/07_command_core/0704_SicEm/0704Ability';
import { FlingThornAbility_0705 } from '../card_defs/07_command_core/0705_FlingThorn/0705Ability';
import { BramblePatchStrikeAbility_0706 } from '../card_defs/07_command_core/0706_BramblePatch/0706Ability';
import { BramblePatchCommandAbility_0707 } from '../card_defs/07_command_core/0707_BramblePatchCommand/0707Ability';
import { OrderAttackAbility } from '../card_defs/07_command_core/0708_OrderAttack/0708Ability';
import { OrderMoveAbility } from '../card_defs/07_command_core/0709_OrderMove/0709Ability';
import { LightBlastAbility } from '../card_defs/08_light_core/0801_LightBlast/0801Ability';
import { LightImbuementAbility } from '../card_defs/08_light_core/0802_LightImbuement/0802Ability';
import { ImbuedBatAbility } from '../card_defs/08_light_core/0803_ImbuedBat/0803Ability';
import { GatherLightAbility } from '../card_defs/08_light_core/0804_GatherLight/0804Ability';
import { GravityLocusAbility } from '../card_defs/09_gravity_core/0901_GravityLocus/0901Ability';
import { ForcePushAbility } from '../card_defs/09_gravity_core/0902_ForcePush/0902Ability';
import { GravityInversionAbility } from '../card_defs/09_gravity_core/0903_GravityInversion/0903Ability';
import { BloodMendAbility_0301 } from '../card_defs/03_blood_mage/0301_BloodMend/0301Ability';
import { BurstAbility_0302 } from '../card_defs/03_blood_mage/0302_Burst/0302Ability';
import { ProtectAbility_0303 } from '../card_defs/03_blood_mage/0303_Protect/0303Ability';
import { WaitAbility } from './WaitAbility';

const ABILITY_MAP: Map<string, AbilityStatic> = new Map();

function register(ability: AbilityStatic): void {
    if (!ability.getTargets) {
        ability.getTargets = () => ability.targets;
    }
    if (!ability.getMaxUses) {
        ability.getMaxUses = () => ability.maxUses ?? 1;
    }
    ABILITY_MAP.set(ability.id, ability);
}

// -- Register all abilities --
register(WaitAbility);
register(ThrowKnife);
register(ThrowRock);
register(ThrowChargedRock);
register(DodgeAbility);
register(SlimeShotAbility);
register(EnemyMeleeAttackAbility);
register(DoublePunchAbility);
register(StrongPunchAbility);
register(SneakyPunchAbility);
register(ChargingPunchAbility);
register(PunchNEWAbility);
register(SwingStickAbility_0103);
register(SwingBatAbility_0115);
register(LaserSwordAbility);
register(DarkWolfBiteAbility);
register(AlphaWolfClawAbility);
register(AlphaWolfSummonAbility);
register(BoarChargeAbility);
register(AlphaWolfChargeAbility);
register(AlphaWolfTripleChargeAbility);
register(AlphaWolfScratchAbility);
register(SwarmlingBiteAbility);
register(RaiseShieldAbility);
register(LaserShieldAbility);
register(ThrowTorchAbility);
register(PistolAbility);
register(SMGAbility);
register(ShotgunAbility);
register(ShiningBlockAbility);
register(BeastClawAbility);
register(ClawAbility);
register(SwingSwordAbility);
register(AbsorptionShieldAbility);
register(EnergyBlastAbility);
register(ConeOfLightAbility);
register(ImpactConversionAbility);
register(BedrockScavengerAbility);
register(DeepResonanceAbility);
register(EarthernPunchAbility);
register(ShakingGroundAbility);
register(ShatterAbility);
register(FaultHarvest);
register(SeismicGuard);
register(StoneTomb);
register(KnockAbility);
register(AnchoredTremor);
register(StoneyPunch);
register(DiggingClawsAbility);
register(EarthCoreThrowRock);
register(ThornbinderBrambleAbility);
register(ThornStompAbility);
register(HuskSeedBarrageAbility);
register(LanterniteStrikeAbility);
register(LanterniteNestAuraAbility);
register(ThornlingBiteAbility);
register(DogBiteAbility);
register(PounceAbility);
register(PetAbility);
register(SicEmAbility);
register(FlingThornAbility_0705);
register(BramblePatchStrikeAbility_0706);
register(BramblePatchCommandAbility_0707);
register(OrderAttackAbility);
register(OrderMoveAbility);
register(LightBlastAbility);
register(LightImbuementAbility);
register(ImbuedBatAbility);
register(GatherLightAbility);
register(GravityLocusAbility);
register(ForcePushAbility);
register(GravityInversionAbility);
register(BloodMendAbility_0301);
register(BurstAbility_0302);
register(ProtectAbility_0303);

setAbilityTagResolver((id) => ABILITY_MAP.get(id)?.tags ?? []);

/** Look up an ability by its ID. */
export function getAbility(id: string): AbilityStatic | undefined {
    return ABILITY_MAP.get(id);
}

/**
 * Register an ability for use in test scenarios.
 * Only call from test scenario files — this mutates the global registry.
 * Idempotent: re-registering the same id overwrites the previous entry.
 */
export function registerAbilityForTest(ability: AbilityStatic): void {
    register(ability);
}

/** Get all registered abilities. */
export function getAllAbilities(): AbilityStatic[] {
    return Array.from(ABILITY_MAP.values());
}

/** Check if an ability ID is registered. */
export function hasAbility(id: string): boolean {
    return ABILITY_MAP.has(id);
}

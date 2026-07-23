import type { CardDef } from './types';
import { asCardDefId } from './types';
import { ThrowRockCard } from './0107_ThrowRock/0107Ability';
import { ThrowChargedRockCard } from './0108_ThrowChargedRock/0108Ability';
import { ThrowKnifeCard } from './0109_ThrowKnife/0109Ability';
import { DodgeCard } from './0101_Dodge/0101Ability';
import { SlimeShotCard } from './0001_SlimeShot/0001Ability';
import { EnemyMeleeAttackCard } from './0002_EnemyMeleeAttack/0002Ability';
import { DoublePunchCard } from './0116_DoublePunch/0116Card';
import { StrongPunchCard } from './0117_StrongPunch/0117Ability';
import { SneakyPunchCard } from './0118_SneakyPunch/0118Ability';
import { ChargingPunchCard } from './0119_ChargingPunch/0119Ability';
import { PunchNEWCard } from './0120_PunchNEW/0120Ability';
import { SwingStickCard } from './0103_SwingStick/0103Ability';
import { LaserSwordCard } from './0105_LaserSword/0105Ability';
import { DarkWolfBiteCard } from './dark_animals/0003_DarkWolfBite/0003Ability';
import { AlphaWolfClawCard } from './dark_animals/0004_AlphaWolfClaw/0004Ability';
import { AlphaWolfSummonCard } from './dark_animals/0005_AlphaWolfSummon/0005Ability';
import { BoarChargeCard } from './dark_animals/0006_BoarCharge/0006Ability';
import { AlphaWolfChargeCard } from './dark_animals/0007_AlphaWolfCharge/0007Ability';
import { AlphaWolfTripleChargeCard } from './dark_animals/0011_AlphaWolfTripleCharge/0011Ability';
import { AlphaWolfScratchCard } from './dark_animals/0012_AlphaWolfScratch/0012Ability';
import { SwarmlingBiteCard } from './dark_animals/0013_SwarmlingBite/0013Ability';
import { ThornlingBiteCard } from './dark_animals/0015_ThornlingBite/0015Ability';
import { ThornStompCard } from './0016_ThornStomp/0016Ability';
import { RaiseShieldCard } from './0104_RaiseShield/0104Ability';
import { LaserShieldCard } from './0106_LaserShield/0106Ability';
import { ThrowTorchCard } from './utility/0601_ThrowTorch/0601Ability';
import { PistolCard } from './0203_Pistol/0203Ability';
import { SMGCard } from './0204_SMG/0204Ability';
import { ShotgunCard } from './0205_Shotgun/0205Ability';
import { ShiningBlockCard } from './0110_ShiningBlock/0110Ability';
import { BeastClawCard } from './utility/0611_BeastClaw/0611Ability';
import { ClawCard } from './0111_Claw/0111Ability';
import { SwingSwordCard } from './0112_SwingSword/0112Ability';
import { SwingBatCard as SwingBatPipeBatCard } from './0115_SwingBat/0115Ability';
import { AbsorptionShieldCard } from './0113_AbsorptionShield/0113Ability';
import { EnergyBlastCard } from './0114_EnergyBlast/0114Ability';
import { ConeOfLightCard } from './0121_ConeOfLight/0121Ability';
import { ImpactConversionCard } from './05_earth_core/0521_ImpactConversion/0521Ability';
import { BedrockScavengerCard } from './05_earth_core/0522_BedrockScavenger/0522Ability';
import { DeepResonanceCard } from './05_earth_core/0523_DeepResonance/0523Ability';
import { EarthernPunchCard } from './05_earth_core/0524_EarthernPunch/0524Ability';
import { ShakingGroundCard } from './05_earth_core/0525_ShakingGround/0525Ability';
import { ShatterCard } from './05_earth_core/0526_Shatter/0526Ability';
import { FaultHarvestCard } from './05_earth_core/0528_FaultHarvest/0528Ability';
import { SeismicGuardCard } from './05_earth_core/0529_SeismicGuard/0529Ability';
import { StoneTombCard } from './05_earth_core/0530_StoneTomb/0530Ability';
import { KnockCard } from './05_earth_core/0531_Knock/0531Ability';
import { AnchoredTremorCard } from './05_earth_core/0532_AnchoredTremor/0532Ability';
import { StoneyPunchCard } from './05_earth_core/0533_StoneyPunch/0533Ability';
import { DiggingClawsCard } from './05_earth_core/0534_DiggingClaws/0534Ability';
import { EarthCoreThrowRockCard } from './05_earth_core/0535_EarthCoreThrowRock/0535Ability';
import { DogBiteCard } from './07_command_core/0701_DogBite/0701Ability';
import { PetCard } from './07_command_core/0703_Pet/0703Ability';
import { SicEmCard } from './07_command_core/0704_SicEm/0704Ability';
import { OrderAttackCard } from './07_command_core/0708_OrderAttack/0708Ability';
import { OrderMoveCard } from './07_command_core/0709_OrderMove/0709Ability';
import { BramblePatchCommandCard_0707 } from './07_command_core/0707_BramblePatchCommand/0707Ability';
import { LightBlastCard } from './08_light_core/0801_LightBlast/0801Ability';
import { LightImbuementCard } from './08_light_core/0802_LightImbuement/0802Card';
import { ImbuedBatCard } from './08_light_core/0803_ImbuedBat/0803Card';
import { GatherLightCard } from './08_light_core/0804_GatherLight/0804Card';
import { GravityLocusCard } from './09_gravity_core/0901_GravityLocus/0901Ability';
import { ForcePushCard } from './09_gravity_core/0902_ForcePush/0902Ability';
import { GravityInversionCard } from './09_gravity_core/0903_GravityInversion/0903Ability';
import { BloodMendCard_0301 } from './03_blood_mage/0301_BloodMend/0301Ability';
import { BurstCard_0302 } from './03_blood_mage/0302_Burst/0302Ability';
import { ProtectCard_0303 } from './03_blood_mage/0303_Protect/0303Ability';

const cardDefs: CardDef[] = [
    ThrowKnifeCard,
    ThrowRockCard,
    ThrowChargedRockCard,
    DodgeCard,
    SlimeShotCard,
    EnemyMeleeAttackCard,
    DoublePunchCard,
    StrongPunchCard,
    SneakyPunchCard,
    ChargingPunchCard,
    PunchNEWCard,
    SwingStickCard,
    LaserSwordCard,
    DarkWolfBiteCard,
    AlphaWolfClawCard,
    AlphaWolfSummonCard,
    BoarChargeCard,
    AlphaWolfChargeCard,
    AlphaWolfTripleChargeCard,
    AlphaWolfScratchCard,
    SwarmlingBiteCard,
    ThornlingBiteCard,
    ThornStompCard,
    RaiseShieldCard,
    LaserShieldCard,
    ThrowTorchCard,
    PistolCard,
    SMGCard,
    ShotgunCard,
    ShiningBlockCard,
    BeastClawCard,
    ClawCard,
    SwingSwordCard,
    SwingBatPipeBatCard,
    AbsorptionShieldCard,
    EnergyBlastCard,
    ConeOfLightCard,
    ImpactConversionCard,
    BedrockScavengerCard,
    DeepResonanceCard,
    EarthernPunchCard,
    ShakingGroundCard,
    ShatterCard,
    FaultHarvestCard,
    SeismicGuardCard,
    StoneTombCard,
    KnockCard,
    AnchoredTremorCard,
    StoneyPunchCard,
    DiggingClawsCard,
    EarthCoreThrowRockCard,
    DogBiteCard,
    PetCard,
    SicEmCard,
    OrderAttackCard,
    OrderMoveCard,
    BramblePatchCommandCard_0707,
    LightBlastCard,
    LightImbuementCard,
    ImbuedBatCard,
    GatherLightCard,
    GravityLocusCard,
    ForcePushCard,
    GravityInversionCard,
    BloodMendCard_0301,
    BurstCard_0302,
    ProtectCard_0303,
];

export const CARD_DEF_MAP: Map<string, CardDef> = new Map(cardDefs.map((c) => [c.abilityId, c]));

export function getCardDef(abilityId: string): CardDef | undefined {
    return CARD_DEF_MAP.get(abilityId);
}

export { asCardDefId };
export type { CardDef, CardDefId } from './types';

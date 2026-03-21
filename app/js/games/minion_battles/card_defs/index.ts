import type { CardDef, CardDefId } from './types';
import { asCardDefId } from './types';
import { ThrowRockCard } from './0107_ThrowRock/0107Ability';
import { ThrowChargedRockCard } from './0108_ThrowChargedRock/0108Ability';
import { ThrowKnifeCard } from './0109_ThrowKnife/0109Ability';
import { DodgeCard } from './0101_Dodge/0101Ability';
import { EnemyArcherShotCard } from './0001_EnemyArcherShot/0001Ability';
import { EnemyMeleeAttackCard } from './0002_EnemyMeleeAttack/0002Ability';
import { PunchCard } from './0102_Punch/0102Ability';
import { SwingBatCard } from './0103_SwingBat/0103Ability';
import { LaserSwordCard } from './0105_LaserSword/0105Ability';
import { DarkWolfBiteCard } from './dark_animals/0003_DarkWolfBite/0003Ability';
import { AlphaWolfClawCard } from './dark_animals/0004_AlphaWolfClaw/0004Ability';
import { AlphaWolfSummonCard } from './dark_animals/0005_AlphaWolfSummon/0005Ability';
import { BoarChargeCard } from './dark_animals/0006_BoarCharge/0006Ability';
import { RaiseShieldCard } from './0104_RaiseShield/0104Ability';
import { LaserShieldCard } from './0106_LaserShield/0106Ability';
import { ThrowTorchCard } from './0501_ThrowTorch/0501Ability';
import { PistolCard } from './0203_Pistol/0203Ability';
import { SMGCard } from './0204_SMG/0204Ability';
import { ShotgunCard } from './0205_Shotgun/0205Ability';
import { ShiningBlockCard } from './0110_ShiningBlock/0110Ability';

const cardDefs: CardDef[] = [
    ThrowKnifeCard,
    ThrowRockCard,
    ThrowChargedRockCard,
    DodgeCard,
    EnemyArcherShotCard,
    EnemyMeleeAttackCard,
    PunchCard,
    SwingBatCard,
    LaserSwordCard,
    DarkWolfBiteCard,
    AlphaWolfClawCard,
    AlphaWolfSummonCard,
    BoarChargeCard,
    RaiseShieldCard,
    LaserShieldCard,
    ThrowTorchCard,
    PistolCard,
    SMGCard,
    ShotgunCard,
    ShiningBlockCard,
];

/** Map card ID -> card definition for resolving hands (arrays of card IDs) to card data. */
export const CARD_DEF_MAP: Map<CardDefId, CardDef> = new Map(cardDefs.map((c) => [c.id, c]));

export function getCardDef(id: CardDefId): CardDef | undefined {
    return CARD_DEF_MAP.get(id);
}

export { asCardDefId };
export type { CardDef, CardDefId } from './types';

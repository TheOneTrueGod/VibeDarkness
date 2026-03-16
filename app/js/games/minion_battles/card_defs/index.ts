import type { CardDef, CardDefId } from './types';
import { asCardDefId } from './types';
import throwKnifeCard from './throw_knife_card';
import throwRockCard from './throw_rock_card';
import { DodgeCard } from './0101_Dodge/0101Ability';
import { EnemyArcherShotCard } from './0001_EnemyArcherShot/0001Ability';
import { EnemyMeleeAttackCard } from './0002_EnemyMeleeAttack/0002Ability';
import { BashCard } from './0102_Bash/0102Ability';
import { SwingBatCard } from './0103_SwingBat/0103Ability';
import { DarkWolfBiteCard } from './dark_animals/0003_DarkWolfBite/0003Ability';
import { RaiseShieldCard } from './0104_RaiseShield/0104Ability';
import { ThrowTorchCard } from './0501_ThrowTorch/0501Ability';
import { PistolCard } from './0203_Pistol/0203Ability';
import { SMGCard } from './0204_SMG/0204Ability';
import { ShotgunCard } from './0205_Shotgun/0205Ability';

const cardDefs: CardDef[] = [
    throwKnifeCard,
    throwRockCard,
    DodgeCard,
    EnemyArcherShotCard,
    EnemyMeleeAttackCard,
    BashCard,
    SwingBatCard,
    DarkWolfBiteCard,
    RaiseShieldCard,
    ThrowTorchCard,
    PistolCard,
    SMGCard,
    ShotgunCard,
];

/** Map card ID -> card definition for resolving hands (arrays of card IDs) to card data. */
export const CARD_DEF_MAP: Map<CardDefId, CardDef> = new Map(cardDefs.map((c) => [c.id, c]));

export function getCardDef(id: CardDefId): CardDef | undefined {
    return CARD_DEF_MAP.get(id);
}

export { asCardDefId };
export type { CardDef, CardDefId } from './types';

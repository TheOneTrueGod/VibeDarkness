import type { CardDef } from './types';
import throwKnifeCard from './throw_knife_card';
import throwRockCard from './throw_rock_card';
import { DodgeCard } from './0101_Dodge/0101Ability';
import { EnemyArcherShotCard } from './0001_EnemyArcherShot/0001Ability';
import { EnemyMeleeAttackCard } from './0002_EnemyMeleeAttack/0002Ability';
import { BashCard } from './0102_Bash/0102Ability';
import { DarkWolfBiteCard } from './dark_animals/0003_DarkWolfBite/0003Ability';
import { ChannelDarknessCard } from './special/ChannelDarkness/ChannelDarknessAbility';

const cardDefs: CardDef[] = [throwKnifeCard, throwRockCard, DodgeCard, EnemyArcherShotCard, EnemyMeleeAttackCard, BashCard, DarkWolfBiteCard, ChannelDarknessCard];

/** Map card ID -> card definition for resolving hands (arrays of card IDs) to card data. */
export const CARD_DEF_MAP: Map<string, CardDef> = new Map(cardDefs.map((c) => [c.id, c]));

export function getCardDef(id: string): CardDef | undefined {
    return CARD_DEF_MAP.get(id);
}

export type { CardDef } from './types';

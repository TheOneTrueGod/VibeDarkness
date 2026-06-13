/**
 * DogBite — the dog's basic melee attack.
 * A quick snap that the pet AI auto-uses when engaging. Slightly faster windup
 * than a swarmling bite so the dog feels reactive rather than lumbering. Deals
 * modest damage; its value comes from the AI chaining it on every engage tick.
 */

import { BasicAttackBuilder } from '../../../abilities/archetypes/BasicAttackBuilder';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

const CARD_ID = `${formatGroupId(AbilityGroupId.Command)}01`;
const DAMAGE = 5;

const BITE_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#1a1205" stroke="#3d2a0a" stroke-width="2"/>
  <path d="M18 24 L23 32 M27 22 L31 30 M35 22 L31 30 M41 24 L37 32" stroke="#c8822a" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M18 38 Q32 50 46 38" stroke="#c8822a" stroke-width="2" fill="none"/>
  <circle cx="32" cy="32" r="4" fill="none" stroke="#c8822a" stroke-width="1.5" stroke-dasharray="2,2"/>
</svg>`;

const { ability: DogBiteAbility, card: DogBiteCard } = BasicAttackBuilder({
    id: CARD_ID,
    name: 'Dog Bite',
    description: `Snap at the target for {${DAMAGE}} damage.`,
    damage: DAMAGE,
    image: BITE_IMAGE,
    windupDuration: 0.6,
    cooldownDuration: 0.9,
    telegraphColor: 0xff8800,
}).build();

export { DogBiteAbility, DogBiteCard };

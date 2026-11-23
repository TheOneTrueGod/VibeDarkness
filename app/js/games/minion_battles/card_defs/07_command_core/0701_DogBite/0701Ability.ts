/**
 * DogBite — the spirit animal's basic attack, which the pet AI auto-uses when engaging.
 * Fires instantly: the spirit dashes straight through the target, leaving a slash, and the target takes
 * damage as it passes (one strike of Spirit Flurry, 0711). Deals modest damage; its value comes from the
 * AI chaining it on every engage tick.
 */

import { BasicAttackBuilder } from '../../../abilities/archetypes/BasicAttackBuilder';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { themedSlashTrail } from '../../../game/effects/slashTrail';

const CARD_ID = `${formatGroupId(AbilityGroupId.Command)}01`;
const DAMAGE = 1;
/**
 * Seconds after the dash before the next bite. With no windup, this keeps the old bite's cadence
 * (0.6 s windup + 0.1 s strike + 0.9 s cooldown = 1.6 s per bite).
 */
const COOLDOWN_SECONDS = 1.48;

const BITE_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#1a1205" stroke="#3d2a0a" stroke-width="2"/>
  <path d="M18 24 L23 32 M27 22 L31 30 M35 22 L31 30 M41 24 L37 32" stroke="#c8822a" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M18 38 Q32 50 46 38" stroke="#c8822a" stroke-width="2" fill="none"/>
  <circle cx="32" cy="32" r="4" fill="none" stroke="#c8822a" stroke-width="1.5" stroke-dasharray="2,2"/>
</svg>`;

// Damage includes abilityModifiers.damageFlat (Empower Pet → PassiveStatKey.Ability0701Damage).
const { ability: DogBiteAbility, card: DogBiteCard } = BasicAttackBuilder({
    id: CARD_ID,
    name: 'Dog Bite',
    description: `Dash through the target for {{DAMAGE}} damage.`,
    damage: DAMAGE,
    image: BITE_IMAGE,
    windupDuration: 0,
    cooldownDuration: COOLDOWN_SECONDS,
    strike: { kind: 'dashThrough', trail: themedSlashTrail('command') },
}).build();

export { DogBiteAbility, DogBiteCard };

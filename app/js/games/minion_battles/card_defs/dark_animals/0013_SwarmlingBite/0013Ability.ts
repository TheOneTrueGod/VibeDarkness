/**
 * SwarmlingBite - Swarmling melee bite attack.
 * A quick snapping bite; the swarmling carries two copies per round so it
 * can nip twice before cycling back to the start of its deck.
 */

import { BasicAttackBuilder } from '../../../abilities/archetypes/BasicAttackBuilder';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}13`;
const DAMAGE = 1;

const BITE_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#1a1a2e" stroke="#2a1a1a" stroke-width="2"/>
  <path d="M16 22 L20 30 M24 20 L28 28 M32 19 L32 27 M40 20 L36 28 M48 22 L44 30" stroke="#8b3a3a" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M16 36 Q32 48 48 36" stroke="#8b3a3a" stroke-width="2" fill="none"/>
</svg>`;

const { ability: SwarmlingBiteAbility, card: SwarmlingBiteCard } = BasicAttackBuilder({
    id: CARD_ID,
    name: 'Swarmling Bite',
    description: `Snap at the target for {${DAMAGE}} damage.`,
    damage: DAMAGE,
    image: BITE_IMAGE,
    windupDuration: 1.5,
    cooldownDuration: 1.1,
    telegraphColor: 0xff0000,
    // Full AI range accounts for unit radius: line 30 + thickness 20 + default unit radius 20.
    aiMaxRange: 70,
}).build();

export { SwarmlingBiteAbility, SwarmlingBiteCard };

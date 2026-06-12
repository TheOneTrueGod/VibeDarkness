/**
 * DogBite — the dog's basic melee attack.
 * A quick snap that the pet AI auto-uses when engaging. Slightly faster windup
 * than a swarmling bite so the dog feels reactive rather than lumbering. Deals
 * modest damage; its value comes from the AI chaining it on every engage tick.
 */

import { defineMeleeStrike } from '../../../abilities/archetypes/defineMeleeStrike';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { meleeLineHitbox } from '../../../hitboxes';
import { type CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Command)}01`;
const PREFIRE_TIME = 0.6;
const MAX_RANGE = 30;
const LINE_THICKNESS = 20;
const DAMAGE = 2;
const CIRCLE_START_RADIUS = 18;

const BITE_HITBOX = meleeLineHitbox(MAX_RANGE, LINE_THICKNESS);

const BITE_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#1a1205" stroke="#3d2a0a" stroke-width="2"/>
  <path d="M18 24 L23 32 M27 22 L31 30 M35 22 L31 30 M41 24 L37 32" stroke="#c8822a" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M18 38 Q32 50 46 38" stroke="#c8822a" stroke-width="2" fill="none"/>
  <circle cx="32" cy="32" r="4" fill="none" stroke="#c8822a" stroke-width="1.5" stroke-dasharray="2,2"/>
</svg>`;

export const DogBiteAbility = defineMeleeStrike({
    id: CARD_ID,
    name: 'Dog Bite',
    image: BITE_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: 4,
    damage: DAMAGE,
    hitbox: BITE_HITBOX,
    impactType: 'punch',
    forwardDistance: 8,
    backwardDistance: 0,
    windupDuration: PREFIRE_TIME,
    activeDuration: 0.1,
    cooldownDuration: 0.9,
    aiPriority: 0,
    telegraph: { kind: 'shrinkingCircle', startRadius: CIRCLE_START_RADIUS, color: 0xff8800 },

    getTooltipText(): string[] {
        return [`Snap at the target for {${DAMAGE}} damage.`];
    },
});

export const DogBiteCard: CardDef = {
    abilityId: CARD_ID,
};

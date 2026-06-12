/**
 * SwarmlingBite - Swarmling melee bite attack.
 * A quick snapping bite; the swarmling carries two copies per round so it
 * can nip twice before cycling back to the start of its deck.
 */

import { defineMeleeStrike } from '../../../abilities/archetypes/defineMeleeStrike';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}13`;
const PREFIRE_TIME = 1.0;
const MAX_RANGE = 30;
const LINE_THICKNESS = 20;
const DAMAGE = 2;
const CIRCLE_START_RADIUS = 18;

const BITE_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#1a1a2e" stroke="#2a1a1a" stroke-width="2"/>
  <path d="M16 22 L20 30 M24 20 L28 28 M32 19 L32 27 M40 20 L36 28 M48 22 L44 30" stroke="#8b3a3a" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M16 36 Q32 48 48 36" stroke="#8b3a3a" stroke-width="2" fill="none"/>
</svg>`;

export const SwarmlingBiteAbility = defineMeleeStrike({
    id: CARD_ID,
    name: 'Swarmling Bite',
    image: BITE_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    damage: DAMAGE,
    range: MAX_RANGE,
    thickness: LINE_THICKNESS,
    impactType: 'punch',
    forwardDistance: 8,
    backwardDistance: 0,
    windupDuration: PREFIRE_TIME,
    activeDuration: 0.1,
    cooldownDuration: 1.1,
    // Full AI range accounts for unit radius: line MAX_RANGE + LINE_THICKNESS + default unit radius (20).
    aiMaxRange: MAX_RANGE + LINE_THICKNESS + 20,
    aiPriority: 0,
    telegraph: { kind: 'shrinkingCircle', startRadius: CIRCLE_START_RADIUS, color: 0xff0000 },

    getTooltipText(): string[] {
        return [`Snap at the target for {${DAMAGE}} damage.`];
    },
});

export const SwarmlingBiteCard: CardDef = {
    abilityId: CARD_ID,
};

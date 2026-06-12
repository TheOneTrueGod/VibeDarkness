/**
 * AlphaWolfScratch - Alpha Wolf fallback melee ability.
 * A desperate raking swipe the wolf uses after its primary toolkit is exhausted.
 * Slow 1s windup telegraphed by a narrowing red circle at the target; deals minimal
 * damage, but gives the boss a reliable filler attack so it is never truly passive.
 */

import { defineMeleeStrike } from '../../../abilities/archetypes/defineMeleeStrike';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}12`;
const PREFIRE_TIME = 1.0;
const MAX_RANGE = 30;
const LINE_THICKNESS = 20;
const DAMAGE = 2;
/** Starting radius of the shrinking windup circle (px). */
const CIRCLE_START_RADIUS = 18;

const SCRATCH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#1a1a2e" stroke="#3a1a1a" stroke-width="2"/>
  <path d="M20 18 L36 38 M26 16 L38 36 M32 14 L40 34" stroke="#8b3a3a" stroke-width="2.5" stroke-linecap="round" fill="none"/>
</svg>`;

export const AlphaWolfScratchAbility = defineMeleeStrike({
    id: CARD_ID,
    name: 'Alpha Wolf Scratch',
    image: SCRATCH_IMAGE,
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
    // maxRange: line extends MAX_RANGE (30) from caster; target is hit when within target.radius + LINE_THICKNESS (20+20=40) of that endpoint.
    // Full hit range from caster centre = 30 + 20 + 20 = 70. Use that so the AI actually tries the ability.
    aiMaxRange: MAX_RANGE + LINE_THICKNESS + 20,
    aiPriority: -10,
    telegraph: { kind: 'shrinkingCircle', startRadius: CIRCLE_START_RADIUS, color: 0xff0000 },

    getTooltipText(): string[] {
        return [`Rake the target for {${DAMAGE}} damage.`];
    },
});

export const AlphaWolfScratchCard: CardDef = {
    abilityId: CARD_ID,
};

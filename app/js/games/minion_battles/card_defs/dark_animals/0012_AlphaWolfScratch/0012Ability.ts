/**
 * AlphaWolfScratch - Alpha Wolf fallback melee ability.
 * A desperate raking swipe the wolf uses after its primary toolkit is exhausted.
 * Slow 1s windup telegraphed by a narrowing red circle at the target; deals minimal
 * damage, but gives the boss a reliable filler attack so it is never truly passive.
 */

import { BasicAttackBuilder } from '../../../abilities/archetypes/BasicAttackBuilder';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}12`;
const DAMAGE = 2;

const SCRATCH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#1a1a2e" stroke="#3a1a1a" stroke-width="2"/>
  <path d="M20 18 L36 38 M26 16 L38 36 M32 14 L40 34" stroke="#8b3a3a" stroke-width="2.5" stroke-linecap="round" fill="none"/>
</svg>`;

const { ability: AlphaWolfScratchAbility, card: AlphaWolfScratchCard } = BasicAttackBuilder({
    id: CARD_ID,
    name: 'Alpha Wolf Scratch',
    description: `Rake the target for {${DAMAGE}} damage.`,
    damage: DAMAGE,
    image: SCRATCH_IMAGE,
    windupDuration: 1.0,
    cooldownDuration: 1.1,
    telegraphColor: 0xff0000,
    // Full hit range from caster centre = line 30 + thickness 20 + unit radius 20 = 70.
    aiMaxRange: 70,
    aiPriority: -10,
    aiNinjutsu: { ignore: true },
}).build();

export { AlphaWolfScratchAbility, AlphaWolfScratchCard };

import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { AttackBlockedInfo } from '../../../abilities/Ability';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import type { Unit } from '../../../game/units/Unit';
import { type CardDef } from '../../types';

const ABILITY_ID = '0531';
const RANGE = 220;
const DAMAGE = 6;

const KNOCK_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="5" width="30" height="30" rx="6" fill="#5a5a5a"/>
  <path d="M10 20 L30 20 M24 14 L30 20 L24 26" stroke="#d9d9d9" stroke-width="3" fill="none"/>
</svg>`;

export const KnockAbility = defineAbility({
    id: ABILITY_ID,
    name: 'Knock',
    image: KNOCK_IMAGE,
    resourceCost: null, // TODO: Earth Core resonance cost pending balance pass.
    rechargeTurns: 1,
    prefireTime: 0.25,
    abilityTimings: [
        { id: 'windup',   start: 0,    end: 0.25, abilityPhase: AbilityPhase.Windup },
        {
            id: 'active',
            start: 0.25,
            end: 0.35,
            abilityPhase: AbilityPhase.Active,
            behaviour: CastBehaviours.ProjectileLaunch()
                .withSpeed(950)
                .withMaxRange(RANGE)
                .withBaseDamage(DAMAGE)
                .withModifiers(['stonephase']),
        },
        { id: 'cooldown', start: 0.35, end: 1.3,  abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }],
    aiSettings: { minRange: 0, maxRange: RANGE },
    getRange: () => ({ minRange: 0, maxRange: RANGE }),
    getTooltipText(): string[] {
        return ['Fire a Stonephase projectile for {6} damage.'];
    },
    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },
});

export const KnockCard: CardDef = {
    abilityId: ABILITY_ID,
};

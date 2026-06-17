/**
 * Throw Torch - Utility ability that places a burning torch on the ground.
 *
 * Targets a pixel within range 200. A torch projectile flies to the target;
 * when it lands, a torch effect is placed that emits light for 3 rounds,
 * decaying each round. Adds a Throw Torch card to a random ally's draw pile
 * (or the caster's if no allies); if the ally doesn't have the ability, it
 * is added to their ability list.
 */

import type { AbilityRecoveryRule, AbilityStateEntry } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { createPixelTargetPreview } from '../../../abilities/previewHelpers';
import { nullHitbox } from '../../../hitboxes';
import type { Unit } from '../../../game/units/Unit';
import { Effect } from '../../../game/effects/Effect';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { getAimPointClampedToMaxRange, getDirectionFromTo, getPixelTargetPosition } from '../../../abilities/targetHelpers';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';

const CARD_ID = `${formatGroupId(AbilityGroupId.Utility)}01`;
const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const PREFIRE_TIME = 0.2;
const MAX_RANGE = 200;
const TORCH_LIGHT_AMOUNT = 4;
const TORCH_RADIUS = 2;
const TORCH_ROUNDS = 3;
const TORCH_PROJECTILE_SPEED = 400;

function getMaxRange(caster: Unit): number {
    return MAX_RANGE + caster.radius + DEFAULT_UNIT_RADIUS;
}

const THROW_TORCH_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="torchFlame" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#ffdd00"/>
      <stop offset="50%" stop-color="#ff6600"/>
      <stop offset="100%" stop-color="#cc3300" stop-opacity="0.9"/>
    </radialGradient>
  </defs>
  <rect x="28" y="20" width="8" height="28" rx="2" fill="#5c4033" stroke="#3d2b1f"/>
  <ellipse cx="32" cy="18" rx="10" ry="12" fill="url(#torchFlame)"/>
  <ellipse cx="32" cy="16" rx="5" ry="6" fill="#fff8dc"/>
</svg>`;

export const ThrowTorchAbility = defineAbility({
    id: CARD_ID,
    name: 'Throw Torch',
    image: THROW_TORCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: PREFIRE_TIME,
            abilityPhase: AbilityPhase.Windup,
        },
        {
            id: 'active',
            start: PREFIRE_TIME,
            end: PREFIRE_TIME + 0.05,
            abilityPhase: AbilityPhase.Active,
            targetDef: { kind: 'select', label: 'Target location', hitbox: nullHitbox, filter: 'any', allowMiss: true },
            behaviour: CastBehaviours.Instant((ctx) => {
                const eng = ctx.engine as AbilityEngineContext;
                const caster = ctx.caster;
                const pos = getPixelTargetPosition(ctx.allTargets, 0);
                if (!pos) return;

                const maxR = getMaxRange(caster);
                const { x: placeX, y: placeY } = getAimPointClampedToMaxRange(caster, pos, maxR);
                const { dist: travelDist } = getDirectionFromTo(caster.x, caster.y, placeX, placeY);
                const travelTime = Math.max(0.15, travelDist / TORCH_PROJECTILE_SPEED);

                eng.addEffect(new Effect({
                    x: placeX,
                    y: placeY,
                    duration: travelTime,
                    effectType: 'TorchProjectile',
                    startX: caster.x,
                    startY: caster.y,
                    effectData: {
                        roundCreated: eng.roundNumber ?? 1,
                        initialLightAmount: TORCH_LIGHT_AMOUNT,
                        initialRadius: TORCH_RADIUS,
                        roundsTotal: TORCH_ROUNDS,
                    },
                }));
            }),
        },
        {
            id: 'cooldown',
            start: PREFIRE_TIME + 0.05,
            end: PREFIRE_TIME + 1.5,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [],
    aiSettings: { minRange: 0, maxRange: MAX_RANGE },

    getTooltipText(_gameState?: unknown): string[] {
        return [`Place a torch on the ground that emits light`, `Lasts ${TORCH_ROUNDS} rounds`];
    },

    getRange(caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: getMaxRange(caster) };
    },

    getAbilityStates(_currentTime: number): AbilityStateEntry[] {
        return [];
    },

    renderTargetingPreviewSelectedTargets: createPixelTargetPreview(MAX_RANGE),
});

export const ThrowTorchCard: CardDef = {
    abilityId: CARD_ID,
};

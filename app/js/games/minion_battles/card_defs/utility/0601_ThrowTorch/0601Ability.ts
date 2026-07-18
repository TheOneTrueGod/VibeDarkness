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
import { spawnBrightLight, type EngineWithLight } from '../../../abilities/brightKeyword';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';

const CARD_ID = `${formatGroupId(AbilityGroupId.Utility)}01`;
const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const PREFIRE_TIME = 0.2;
const MAX_RANGE = 200;
const BRIGHT_MAGNITUDE = 3;
const TORCH_PROJECTILE_SPEED = 400;

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
    bright: BRIGHT_MAGNITUDE,
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
            doNotRefund: true,
            targetDef: { kind: 'select', label: 'Target location', hitbox: nullHitbox, filter: 'any', allowMiss: true },
            behaviour: CastBehaviours.ProjectileLaunch()
                .withSpeed(TORCH_PROJECTILE_SPEED)
                .withMaxRange(MAX_RANGE)
                .withProjectileType('torch')
                .withPassThroughEnemies(),
        },
        {
            id: 'cooldown',
            start: PREFIRE_TIME + 0.05,
            end: PREFIRE_TIME + 1.5,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [],
    clearMovementOnComplete: true,
    aiSettings: { minRange: 0, maxRange: MAX_RANGE },

    onProjectileExpired(engine, _caster, projectile): void {
        const eng = engine as EngineWithLight;
        const proj = projectile as { x: number; y: number };
        spawnBrightLight(eng, proj.x, proj.y, BRIGHT_MAGNITUDE);
    },

    getTooltipText(_gameState?: unknown): string[] {
        return ['{Bright 3}'];
    },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: MAX_RANGE };
    },

    getAbilityStates(_currentTime: number): AbilityStateEntry[] {
        return [];
    },

    renderTargetingPreviewSelectedTargets: createPixelTargetPreview(MAX_RANGE),
});

export const ThrowTorchCard: CardDef = {
    abilityId: CARD_ID,
};

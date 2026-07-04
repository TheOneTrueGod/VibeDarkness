/**
 * Gather Light — self-cast ability that drains ambient light from nearby tiles into the caster.
 *
 * A brief windup telegraphs the pull with a purple ring; on activation the caster gains Light
 * resource while a 3×3 area (self plus eight neighbors) is permanently darkened. Yellow orbs
 * fly inward from adjacent tiles as visual feedback.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import {
    applyGatherLightDarkness,
    spawnGatherLightOrbs,
    spawnGatherLightWindupRing,
    GATHER_LIGHT_PREFIRE_TIME,
    type EngineWithGatherLight,
} from '../../../abilities/gatherLightHelpers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Light)}04`;
const MAX_USES = 2;
const ACTIVE_DURATION = 0.05;
const COOLDOWN_DURATION = 0.45;
export const GATHER_LIGHT_AMOUNT = 2;
export const GATHER_LIGHT_RING_COLOR = 0x9933cc;

const GATHER_LIGHT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="gatherGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="45%" stop-color="#ffe066"/>
      <stop offset="100%" stop-color="#9933cc" stop-opacity="0.0"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="22" fill="url(#gatherGlow)" opacity="0.95"/>
  <circle cx="32" cy="32" r="14" fill="none" stroke="#9933cc" stroke-width="2" opacity="0.7"/>
  <circle cx="32" cy="32" r="6" fill="#ffffff" opacity="0.95"/>
</svg>`;

export const GatherLightAbility = defineAbility({
    id: CARD_ID,
    name: 'Gather Light',
    image: GATHER_LIGHT_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: [{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 }],
    prefireTime: GATHER_LIGHT_PREFIRE_TIME,
    targets: [],
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: GATHER_LIGHT_PREFIRE_TIME,
            abilityPhase: AbilityPhase.Windup,
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        spawnGatherLightWindupRing(ctx.engine as EngineWithGatherLight, ctx.caster, GATHER_LIGHT_RING_COLOR);
                    }),
                },
            ],
        },
        {
            id: 'active',
            start: GATHER_LIGHT_PREFIRE_TIME,
            end: GATHER_LIGHT_PREFIRE_TIME + ACTIVE_DURATION,
            abilityPhase: AbilityPhase.Active,
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        const eng = ctx.engine as EngineWithGatherLight;
                        ctx.caster.getResource('light')?.add(GATHER_LIGHT_AMOUNT);
                        const { adjacentTiles } = applyGatherLightDarkness(
                            eng,
                            ctx.caster,
                            eng.roundNumber ?? 1,
                        );
                        spawnGatherLightOrbs(eng, ctx.caster, adjacentTiles);
                    }),
                },
            ],
        },
        {
            id: 'cooldown',
            start: GATHER_LIGHT_PREFIRE_TIME + ACTIVE_DURATION,
            end: GATHER_LIGHT_PREFIRE_TIME + ACTIVE_DURATION + COOLDOWN_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],

    getRange: () => ({ minRange: 0, maxRange: 0 }),

    getTooltipText(): string[] {
        return [`Gather the light near you to recover {${GATHER_LIGHT_AMOUNT}} light`];
    },

    renderTargetingPreviewSelectedTargets(): void {
        // Self-cast — no targeting preview.
    },
});

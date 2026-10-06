/**
 * Gather Light — self-cast ability that drains ambient light from nearby tiles into the caster.
 *
 * A brief windup telegraphs the pull with a purple ring; on activation the caster gains Light
 * resource and drops a bright light source at their feet while up to 10 random lit tiles in the 5×5 around the caster are permanently
 * darkened. Yellow orbs fly inward from those tiles as visual feedback.
 *
 * When the Light Imbuement research node is owned, the cast also applies LightImbueBuff so the
 * next Swing Bat swaps to Imbued Bat (0803) for one use.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import {
    applyGatherLightDarkness,
    spawnGatherLightOrbs,
    spawnGatherLightWindupRing,
    GATHER_LIGHT_PREFIRE_TIME,
    type EngineWithGatherLight,
} from '../../../abilities/gatherLightHelpers';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { getAbilityModifier, hasResearchNode } from '../../../abilities/abilityModifierHelpers';
import { LightImbueBuff } from '../../../buffs/LightImbueBuff';
import { IMBUED_BAT_ABILITY_ID } from '../0803_ImbuedBat/0803Constants';
import {
    LIGHT_TREE_ID,
    LIGHT_NODE_IMBUEMENT,
} from '../../../../../researchTrees/trees/light';
import {
    GATHER_LIGHT_ABILITY_ID,
    GATHER_LIGHT_BRIGHT_MAGNITUDE,
    GATHER_LIGHT_BRIGHT_ALPHA_SCALE,
    GATHER_LIGHT_DEVOUR_BONUS,
    getGatherLightAmount,
    getGatherLightDarknessAmount,
} from './0804Constants';
import { spawnBrightLight, type EngineWithLight } from '../../../abilities/brightKeyword';
import type { Unit } from '../../../game/units/Unit';
import type { AbilityKeywordUse } from '../../../abilities/keywords/keywordTypes';
import {
    formatKeywordUseTooltip,
    runAbilityKeywords,
} from '../../../abilities/keywords/runAbilityKeywords';

const CARD_ID = GATHER_LIGHT_ABILITY_ID;
const MAX_USES = 2;
const ACTIVE_DURATION = 0.05;
const COOLDOWN_DURATION = 0.45;
export { GATHER_LIGHT_AMOUNT, getGatherLightDarknessAmount } from './0804Constants';
export const GATHER_LIGHT_RING_COLOR = 0x9933cc;

/** True when the caster's owner has researched Light Imbuement (battle or tooltip bag). */
export function hasLightImbuementResearch(gameState: unknown, caster?: Unit): boolean {
    const eng = gameState as AbilityEngineContext | undefined;
    if (hasResearchNode(eng, caster, LIGHT_TREE_ID, LIGHT_NODE_IMBUEMENT)) {
        return true;
    }
    const trees = (gameState as { researchTrees?: Record<string, string[]> } | undefined)?.researchTrees;
    return trees?.[LIGHT_TREE_ID]?.includes(LIGHT_NODE_IMBUEMENT) ?? false;
}

const GATHER_LIGHT_DEVOUR_USE: AbilityKeywordUse = {
    keyword: 'devourLight',
    n: 1,
    effect: (ctx) => {
        ctx.caster.getResource('light')?.add(GATHER_LIGHT_DEVOUR_BONUS);
    },
    effectText: `gain {${GATHER_LIGHT_DEVOUR_BONUS}} additional light`,
};

const GATHER_LIGHT_IMAGE =`<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
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
    keywordUses: [GATHER_LIGHT_DEVOUR_USE],
    /** Prep: Imbued Bat comes free when Light Imbuement research grants 0803 (tagged `secondary`). */
    attachedAbilityIds: [IMBUED_BAT_ABILITY_ID],
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
            doNotRefund: true,
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        const eng = ctx.engine as EngineWithGatherLight;
                        const lightGained = getGatherLightAmount(ctx.caster);
                        // Devour must resolve before the bright light source below is spawned.
                        // Its effect adds the bonus light; darkness stays based on the base amount.
                        runAbilityKeywords(ctx, [GATHER_LIGHT_DEVOUR_USE]);
                        ctx.caster.getResource('light')?.add(lightGained);
                        const { darknessTiles } = applyGatherLightDarkness(
                            eng,
                            ctx.caster,
                            eng.roundNumber ?? 1,
                            getGatherLightDarknessAmount(lightGained),
                        );
                        spawnGatherLightOrbs(eng, ctx.caster, darknessTiles);
                        spawnBrightLight(eng as unknown as EngineWithLight, ctx.caster.x, ctx.caster.y, GATHER_LIGHT_BRIGHT_MAGNITUDE, {
                            visualAlphaScale: GATHER_LIGHT_BRIGHT_ALPHA_SCALE,
                        });
                        if (hasLightImbuementResearch(eng, ctx.caster)) {
                            ctx.caster.addBuff(
                                new LightImbueBuff(),
                                eng.gameTime,
                                eng.roundNumber ?? 1,
                                eng.eventBus,
                            );
                        }
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

    getTooltipText(gameState?: unknown): string[] {
        const amount = getGatherLightAmount({
            abilityModifiers: { [CARD_ID]: getAbilityModifier(gameState, undefined, CARD_ID) },
        });
        const devourLine = formatKeywordUseTooltip(GATHER_LIGHT_DEVOUR_USE);
        if (hasLightImbuementResearch(gameState)) {
            return [
                `Gather the light near you to recover {${amount}} light and imbue your weapon with light.`,
                devourLine,
            ];
        }
        return [`Gather the light near you to recover {${amount}} light`, devourLine];
    },

    renderTargetingPreviewSelectedTargets(): void {
        // Self-cast — no targeting preview.
    },
});

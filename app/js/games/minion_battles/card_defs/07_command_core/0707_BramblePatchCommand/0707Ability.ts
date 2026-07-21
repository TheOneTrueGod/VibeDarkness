/**
 * Bramble Patch — player command card. Owns the ITS timeline: windup → confirmRadius
 * (preview blast at the nearest pet) → Instant that commands the pet to use strike 0706.
 * Mimic Brambles research grants this card and the pet strike ability.
 */

import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { resolveAbilitySourceUnits, commandPetAbility } from '../../../abilities/petCommands';
import type { Unit } from '../../../game/units/Unit';
import { type CardDef } from '../../types';
import {
    BRAMBLE_PATCH_RADIUS,
    BRAMBLE_PATCH_STRIKE_ID,
    BRAMBLE_PATCH_KNOCKBACK_TIER,
} from '../0706_BramblePatch/0706Ability';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityRecoveryRule, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Command)}07`;
const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

export const BRAMBLE_PATCH_COMMAND_WINDUP = 1.0;
const CONFIRM_END = BRAMBLE_PATCH_COMMAND_WINDUP + 1 / 60;
const CAST_ACTIVE_END = CONFIRM_END + 0.1;
const COOLDOWN_END = CAST_ACTIVE_END + 0.4;

const BRAMBLE_PET_SOURCE = { type: 'pet' as const, selector: 'nearest' as const };

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: BRAMBLE_PATCH_COMMAND_WINDUP,
        abilityPhase: AbilityPhase.Windup,
    },
    {
        id: 'confirm',
        start: BRAMBLE_PATCH_COMMAND_WINDUP,
        end: CONFIRM_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'confirmRadius',
            label: 'Confirm radius',
            radius: BRAMBLE_PATCH_RADIUS,
            allowMiss: true,
        },
    },
    {
        id: 'command',
        start: CONFIRM_END,
        end: CAST_ACTIVE_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        castBehaviours: [
            {
                timingStart: 'start',
                behaviour: CastBehaviours.Instant((ctx) => {
                    const pets = resolveAbilitySourceUnits(BramblePatchCommandAbility_0707, ctx.caster, ctx.engine.units);
                    if (pets.length === 0) return;
                    commandPetAbility(pets, BRAMBLE_PATCH_STRIKE_ID, [], ctx.engine, {
                        preGrantCharge: { chargeType: 'commandCharge', amount: 1 },
                    });
                }),
            },
        ],
    },
    { id: 'cooldown', start: CAST_ACTIVE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
];

const BRAMBLE_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#0a1a0a" stroke="#1a3d1a" stroke-width="2"/>
  <circle cx="32" cy="32" r="14" fill="none" stroke="#4ade80" stroke-width="2" opacity="0.8"/>
  <path d="M32 18 L34 28 L32 26 L30 28 Z M46 32 L36 34 L38 32 L36 30 Z M32 46 L30 36 L32 38 L34 36 Z M18 32 L28 30 L26 32 L28 34 Z" fill="#86efac"/>
</svg>`;

export const BramblePatchCommandAbility_0707 = defineAbility({
    id: CARD_ID,
    name: 'Bramble Patch',
    image: BRAMBLE_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: BRAMBLE_PATCH_COMMAND_WINDUP,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    abilitySource: BRAMBLE_PET_SOURCE,

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: BRAMBLE_PATCH_RADIUS };
    },

    getTooltipText(): string[] {
        return [
            `Command the nearest pet to slam a bramble patch, dealing damage and leaving slowing thorns`,
            `{knockback ${BRAMBLE_PATCH_KNOCKBACK_TIER}}`,
        ];
    },

    beginActiveCast(
        engine: unknown,
        caster: Unit,
        _targets: ResolvedTarget[],
        active: ActiveAbility,
    ): void {
        const eng = engine as { units: Unit[] };
        const pets = resolveAbilitySourceUnits(BramblePatchCommandAbility_0707, caster, eng.units);
        const pet = pets[0];
        active.castPayload = {
            previewX: pet?.x ?? caster.x,
            previewY: pet?.y ?? caster.y,
            petUnitId: pet?.id,
        };
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const payload = activeAbility.castPayload as {
            previewX?: number;
            previewY?: number;
        } | undefined;
        const ox = payload?.previewX ?? caster.x;
        const oy = payload?.previewY ?? caster.y;
        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed >= BRAMBLE_PATCH_COMMAND_WINDUP) {
            gr.circle(ox, oy, BRAMBLE_PATCH_RADIUS);
            gr.stroke({ color: 0x86efac, width: 2, alpha: 0.85 });
            return;
        }
        const borderAlpha = 0.25 + 0.55 * Math.min(1, elapsed / BRAMBLE_PATCH_COMMAND_WINDUP);
        gr.circle(ox, oy, BRAMBLE_PATCH_RADIUS);
        gr.stroke({ color: 0xef4444, width: 2, alpha: borderAlpha });
        const ringT = elapsed / BRAMBLE_PATCH_COMMAND_WINDUP;
        const ringRadius = ringT * BRAMBLE_PATCH_RADIUS;
        if (ringRadius > 2) {
            gr.circle(ox, oy, ringRadius);
            gr.stroke({ color: 0xfca5a5, width: 3, alpha: 0.45 + 0.45 * ringT });
        }
    },
});

export const BramblePatchCommandCard_0707: CardDef = {
    abilityId: CARD_ID,
};

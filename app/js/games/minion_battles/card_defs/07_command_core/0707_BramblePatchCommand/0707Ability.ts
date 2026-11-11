/**
 * Bramble Patch — player command card. Owns the ITS timeline: windup → confirm (preview the slam's
 * tiles at the nearest pet) → the pet's slam. Commands the pet into strike 0706 at cast start so
 * the pet's windup (and movement root) runs in parallel with this telegraph.
 *
 * The confirm opens `CONFIRM_LEAD` before the pet's windup ends, so the player confirms (or undoes)
 * before the brambles land, not after.
 * Mimic Brambles research grants this card and the pet strike ability.
 */

import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { resolveAbilitySourceUnits, commandPetAbility } from '../../../abilities/petCommands';
import { CAST_PRIORITY } from '../../../game/units/castPriority';
import type { Unit } from '../../../game/units/Unit';
import { type CardDef } from '../../types';
import {
    BRAMBLE_PATCH_RADIUS,
    BRAMBLE_PATCH_SHAPE,
    BRAMBLE_PATCH_STRIKE_ID,
    BRAMBLE_PATCH_KNOCKBACK_TIER,
    BRAMBLE_PATCH_WINDUP,
    drawBramblePatchTelegraph,
} from '../0706_BramblePatch/0706Ability';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityRecoveryRule, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { getCastElapsedAt } from '../../../game/time/actorClock';

const CARD_ID = `${formatGroupId(AbilityGroupId.Command)}07`;
const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

/** Re-export for callers that historically imported windup from the command card. */
export const BRAMBLE_PATCH_COMMAND_WINDUP = BRAMBLE_PATCH_WINDUP;
/** How long before the slam the confirm pause opens (s). */
export const BRAMBLE_PATCH_CONFIRM_LEAD = 0.15;
/** Owner-cast time at which the confirm pause opens. */
export const BRAMBLE_PATCH_CONFIRM_AT = BRAMBLE_PATCH_WINDUP - BRAMBLE_PATCH_CONFIRM_LEAD;
const CONFIRM_END = BRAMBLE_PATCH_CONFIRM_AT + 1 / 60;
/** The player's cast stays active until just after the pet's slam lands. */
const CAST_ACTIVE_END = BRAMBLE_PATCH_WINDUP + 0.1;
const COOLDOWN_END = CAST_ACTIVE_END + 0.4;

const BRAMBLE_PET_SOURCE = { type: 'pet' as const, selector: 'nearest' as const, requireFree: true as const };

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: BRAMBLE_PATCH_CONFIRM_AT,
        abilityPhase: AbilityPhase.Windup,
    },
    {
        id: 'confirm',
        start: BRAMBLE_PATCH_CONFIRM_AT,
        end: CONFIRM_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'confirmRadius',
            label: 'Confirm radius',
            radius: BRAMBLE_PATCH_RADIUS,
            tileShape: BRAMBLE_PATCH_SHAPE,
            allowMiss: true,
        },
    },
    {
        id: 'resolve',
        start: CONFIRM_END,
        end: CAST_ACTIVE_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        // Pet was already commanded at cast start; this window only finishes the player timeline.
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
    prefireTime: BRAMBLE_PATCH_WINDUP,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    abilitySource: BRAMBLE_PET_SOURCE,

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: BRAMBLE_PATCH_RADIUS };
    },

    getTooltipText(): string[] {
        return [
            'Command the nearest pet to slam a bramble patch, dealing damage and leaving lanternite-style thorns that slow movement and damage shadow creatures.',
            `{Knockback ${BRAMBLE_PATCH_KNOCKBACK_TIER}}`,
        ];
    },

    beginActiveCast(
        engine: unknown,
        caster: Unit,
        _targets: ResolvedTarget[],
        active: ActiveAbility,
    ): void {
        const eng = engine as AbilityEngineContext;
        const pets = resolveAbilitySourceUnits(BramblePatchCommandAbility_0707, caster, eng.units, undefined, eng);
        const pet = pets[0];
        active.castPayload = {
            previewX: pet?.x ?? caster.x,
            previewY: pet?.y ?? caster.y,
            petUnitId: pet?.id,
        };
        // Start the pet's windup immediately so its movement root matches this telegraph.
        if (pets.length > 0) {
            commandPetAbility(pets, BRAMBLE_PATCH_STRIKE_ID, [], eng, {
                preGrantCharge: { chargeType: 'commandCharge', amount: 1 },
                priority: CAST_PRIORITY.Major,
                owner: caster,
            });
        }
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
        const elapsed = getCastElapsedAt(activeAbility, gameTime);
        drawBramblePatchTelegraph(
            gr,
            { x: ox, y: oy },
            elapsed >= BRAMBLE_PATCH_CONFIRM_AT ? null : elapsed / BRAMBLE_PATCH_CONFIRM_AT,
        );
    },
});

export const BramblePatchCommandCard_0707: CardDef = {
    abilityId: CARD_ID,
};

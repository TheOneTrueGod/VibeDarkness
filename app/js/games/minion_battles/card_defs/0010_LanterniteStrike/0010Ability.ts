/**
 * LanterniteStrike — short-range light pulse fired by Lanternite units while patrolling.
 * Quick windup, single-target projectile, no card needed (unit ability only).
 * Migrated to CastBehaviours.ProjectileLaunch() on the fire interval.
 */

import type { AbilityRecoveryRule, AbilityStatic, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import type { ActiveAbility } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';
import { asTelegraphPayload } from '../../abilities/telegraphTracking';
import { deactivateProjectileOnBlock } from '../../abilities/effectHelpers';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { defineAbility } from '../../abilities/defineAbility';
import { resolveTooltipContext } from '../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../abilities/tooltipTokens';

export const LANTERNITE_STRIKE_ID = `${formatGroupId(AbilityGroupId.Enemy)}10`;

const LOCK_TIME = 0.5;
const PREFIRE_TIME = 0.4;
/** Short window so ProjectileLaunch (fires at window open) lands the shot at PREFIRE_TIME, not at LOCK_TIME. */
const FIRE_END = PREFIRE_TIME + 0.1;
const COOLDOWN_END = 3;
const PROJECTILE_SPEED = 700;
const MAX_DISTANCE = 200;
const DAMAGE = 2;
const LIGHT_COLOR = 0xffe080;
const MAX_USES = 4;
// 4 uses banked at once, so the ability can fire up to 4 times before needing a fresh round of recovery.
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 4 },
];

const TOOLTIP_LINES = [
    'Emits a light pulse dealing {{DAMAGE}} damage',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: DAMAGE },
};

export const LanterniteStrikeAbility: AbilityStatic = defineAbility({
    id: LANTERNITE_STRIKE_ID,
    name: 'Lanternite Strike',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { id: 'aim', start: 0, end: LOCK_TIME, abilityPhase: AbilityPhase.Windup },
        { id: 'charge', start: LOCK_TIME, end: PREFIRE_TIME, abilityPhase: AbilityPhase.Active, doNotRefund: true },
        {
            id: 'fire',
            start: PREFIRE_TIME,
            end: FIRE_END,
            abilityPhase: AbilityPhase.Active,
            behaviour: CastBehaviours.ProjectileLaunch()
                .withSpeed(PROJECTILE_SPEED)
                .withMaxRange(MAX_DISTANCE)
                .withBaseDamage(DAMAGE),
        },
        { id: 'cooldown', start: FIRE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'unit', label: 'Target' }] as TargetDef[],
    // Tracks the live target position through the aim/charge windup (freezing on evade or
    // tether-break) instead of firing at wherever the target was when the AI queued the attack.
    telegraph: { kind: 'growingLine', color: LIGHT_COLOR, trackTarget: true },
    aiSettings: { minRange: 0, maxRange: MAX_DISTANCE },
    getRange: (_caster: Unit) => ({ minRange: 0, maxRange: MAX_DISTANCE }),

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: LANTERNITE_STRIKE_ID } }),
        );
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed >= PREFIRE_TIME) return;

        const payload = asTelegraphPayload(activeAbility.castPayload);
        const target = payload
            ? { x: payload.telegraphTargetX, y: payload.telegraphTargetY }
            : getPixelTargetPosition(activeAbility.targets, 0);
        if (!target) return;

        const { dirX: ux, dirY: uy, dist } = getDirectionFromTo(caster.x, caster.y, target.x, target.y);
        if (dist === 0) return;
        const lineLen = Math.min(MAX_DISTANCE, dist);
        const progress = elapsed < LOCK_TIME ? elapsed / LOCK_TIME : 1;

        gr.moveTo(caster.x, caster.y);
        gr.lineTo(caster.x + ux * lineLen, caster.y + uy * lineLen);
        gr.stroke({ color: LIGHT_COLOR, width: 2, alpha: 0.3 + 0.5 * progress });
    },

    renderTargetingPreview(gr: IAbilityPreviewGraphics, caster: Unit): void {
        gr.circle(caster.x, caster.y, MAX_DISTANCE);
        gr.stroke({ width: 1, color: LIGHT_COLOR, alpha: 0.35 });
    },
});

/**
 * Fling Thorn — pet ranged pulse copied from Lanternite Strike. Quick windup, single-target
 * projectile. Granted by Mimic Thorn research; pet AI auto-uses it while engaging when the
 * locked target is in range. No player card.
 */

import type { AbilityRecoveryRule, AbilityStatic, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { TargetDef } from '../../../abilities/targeting';
import type { ActiveAbility } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { getPixelTargetPosition, getDirectionFromTo } from '../../../abilities/targetHelpers';
import { asTelegraphPayload } from '../../../abilities/telegraphTracking';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../../abilities/tooltipTokens';

export const FLING_THORN_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}05`;

const LOCK_TIME = 0.5;
const PREFIRE_TIME = 0.4;
/** Short window so ProjectileLaunch (fires at window open) lands the shot at PREFIRE_TIME. */
const FIRE_END = PREFIRE_TIME + 0.1;
const COOLDOWN_END = 3;
const PROJECTILE_SPEED = 700;
export const FLING_THORN_MAX_DISTANCE = 200;
export const FLING_THORN_DAMAGE = 5;
const THORN_COLOR = 0x86efac;
const MAX_USES = 4;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 4 },
];

const TOOLTIP_LINES = [
    'Fling a thorn pulse dealing {{DAMAGE}} damage',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: FLING_THORN_DAMAGE },
};

export const FlingThornAbility_0705: AbilityStatic = defineAbility({
    id: FLING_THORN_ABILITY_ID,
    name: 'Fling Thorn',
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
                .withMaxRange(FLING_THORN_MAX_DISTANCE)
                .withBaseDamage(FLING_THORN_DAMAGE),
        },
        { id: 'cooldown', start: FIRE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'unit', label: 'Target' }] as TargetDef[],
    tags: ['basicAttack'],
    telegraph: { kind: 'growingLine', color: THORN_COLOR, trackTarget: true },
    aiSettings: { minRange: 0, maxRange: FLING_THORN_MAX_DISTANCE, priority: 1 },
    getRange: (_caster: Unit) => ({ minRange: 0, maxRange: FLING_THORN_MAX_DISTANCE }),

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: FLING_THORN_ABILITY_ID } }),
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
        const lineLen = Math.min(FLING_THORN_MAX_DISTANCE, dist);
        const progress = elapsed < LOCK_TIME ? elapsed / LOCK_TIME : 1;

        gr.moveTo(caster.x, caster.y);
        gr.lineTo(caster.x + ux * lineLen, caster.y + uy * lineLen);
        gr.stroke({ color: THORN_COLOR, width: 2, alpha: 0.3 + 0.5 * progress });
    },

    renderTargetingPreview(gr: IAbilityPreviewGraphics, caster: Unit): void {
        gr.circle(caster.x, caster.y, FLING_THORN_MAX_DISTANCE);
        gr.stroke({ width: 1, color: THORN_COLOR, alpha: 0.35 });
    },
});

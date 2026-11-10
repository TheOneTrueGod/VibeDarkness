/**
 * Fling Thorn — the spirit's thorn shotgun. Quick windup, then a fan of short-range thorns toward the
 * aim point, each its own projectile.
 *
 * Pet-only and ordered: no aiSettings, so the pet AI never fires it on its own. The player's Fling Thorn
 * card (0714) picks an aim point round the spirit and commands it (like Sic 'em → Pounce). Restored only
 * by the commandCharge that card pre-grants. Granted (with the card) by Mimic Thorn research.
 */

import type { AbilityRecoveryRule, AbilityStatic, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
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
import { getCastElapsedAt } from '../../../game/time/actorClock';

import { getThemeById, themeGlowPair } from '../../../themes/abilityTheme';
import { PROJECTILE_PARTICLE_TRAIL_PRESETS } from '../../../game/effects/projectileParticleTrails';

export const FLING_THORN_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}05`;

const LOCK_TIME = 0.5;
const PREFIRE_TIME = 0.4;
/** Short window so ProjectileLaunch (fires at window open) lands the shot at PREFIRE_TIME. */
const FIRE_END = PREFIRE_TIME + 0.1;
const COOLDOWN_END = FIRE_END + 0.3;
const PROJECTILE_SPEED = 700;
export const FLING_THORN_MAX_DISTANCE = 200;
/** Damage per thorn. */
export const FLING_THORN_DAMAGE = 2;
/** Aim offsets (degrees) of the thorns in the fan; one projectile each. */
export const FLING_THORN_SPREAD = [-24, -12, 0, 12, 24] as const;
/** The spirit's lime (the lighter Command colour). */
const THORN_COLOR = themeGlowPair(getThemeById('command')).light;
const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'commandCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const TOOLTIP_LINES = [
    'Spray {{COUNT}} thorns in a short fan, each dealing {{DAMAGE}} damage',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: FLING_THORN_DAMAGE },
    COUNT: { kind: 'plain', value: FLING_THORN_SPREAD.length },
};

/** Draw the thorn fan from `from` toward `aim`: one line per thorn, FLING_THORN_MAX_DISTANCE long. */
export function drawFlingThornFan(
    gr: IAbilityPreviewGraphics,
    from: { x: number; y: number },
    aim: { x: number; y: number },
    alpha: number,
): void {
    const { dirX: ux, dirY: uy, dist } = getDirectionFromTo(from.x, from.y, aim.x, aim.y);
    if (dist === 0) return;
    for (const offset of FLING_THORN_SPREAD) {
        const rad = (offset * Math.PI) / 180;
        const dx = ux * Math.cos(rad) - uy * Math.sin(rad);
        const dy = ux * Math.sin(rad) + uy * Math.cos(rad);
        gr.moveTo(from.x, from.y);
        gr.lineTo(from.x + dx * FLING_THORN_MAX_DISTANCE, from.y + dy * FLING_THORN_MAX_DISTANCE);
        gr.stroke({ color: THORN_COLOR, width: offset === 0 ? 2 : 1.5, alpha });
    }
}

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
            castBehaviours: FLING_THORN_SPREAD.map((offset) => ({
                timingStart: 'start' as const,
                behaviour: CastBehaviours.ProjectileLaunch()
                    .withSpeed(PROJECTILE_SPEED)
                    .withMaxRange(FLING_THORN_MAX_DISTANCE)
                    .withTravelFullRange()
                    .withBaseDamage(FLING_THORN_DAMAGE)
                    .withAimOffset(offset)
                    .withParticleTrail(PROJECTILE_PARTICLE_TRAIL_PRESETS.spiritMotes()),
            })),
        },
        { id: 'cooldown', start: FIRE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    // Aimed by the owner's card (a pixel target); no aiSettings — only that card fires it.
    targets: [],
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
        const elapsed = getCastElapsedAt(activeAbility, gameTime);
        if (elapsed >= PREFIRE_TIME) return;

        const payload = asTelegraphPayload(activeAbility.castPayload);
        const target = payload
            ? { x: payload.telegraphTargetX, y: payload.telegraphTargetY }
            : getPixelTargetPosition(activeAbility.targets, 0);
        if (!target) return;

        const progress = elapsed < LOCK_TIME ? elapsed / LOCK_TIME : 1;
        drawFlingThornFan(gr, caster, target, 0.25 + 0.45 * progress);
    },
});

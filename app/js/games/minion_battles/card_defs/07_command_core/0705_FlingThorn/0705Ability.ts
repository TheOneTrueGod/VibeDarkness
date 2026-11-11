/**
 * Fling Thorns — the spirit's thorn spray. A small Command spell circle winds up round the spirit, then
 * it flings its thorns one after another toward the aim point, each at a random angle inside a short
 * cone (like the SMG), and holds a beat afterwards so the spray reads.
 *
 * Pet-only and ordered: no aiSettings, so the pet AI never fires it on its own. The player's Fling Thorns
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
import { SPELL_CIRCLE_STYLE_COMMAND } from '../../../game/spellCircles/spellCircles';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';

export const FLING_THORN_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}05`;

/** Spell circle windup on the spirit before the first thorn. */
const WINDUP = 0.6;
const PREFIRE_TIME = WINDUP;
/** Number of thorns, one projectile each. */
export const FLING_THORN_COUNT = 5;
/** Seconds between consecutive thorns. */
const THORN_INTERVAL = 0.2;
/** Each thorn's random aim offset lies in [-spread, +spread] degrees. */
export const FLING_THORN_SPREAD_DEG = 18;
/** Padding past the last thorn so the fixed-tick sampler can't step over it (see defineGunAbility). */
const FIRE_END = WINDUP + (FLING_THORN_COUNT - 1) * THORN_INTERVAL + 0.05;
/** Recovery after the last thorn, so the spray is seen before the spirit moves on. */
const COOLDOWN_END = FIRE_END + 0.6;
const PROJECTILE_SPEED = 650;
export const FLING_THORN_MAX_DISTANCE = 200;
/** Damage per thorn. */
export const FLING_THORN_DAMAGE = 2;
/** A small circle, sized to the spirit rather than a hero cast. */
const SPELL_CIRCLE_RADIUS = 0.8 * CELL_SIZE;
/** The spirit's lime (the lighter Command colour). */
const THORN_COLOR = themeGlowPair(getThemeById('command')).light;
const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'commandCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const TOOLTIP_LINES = [
    'Fling {{COUNT}} thorns in quick succession across a short cone, each dealing {{DAMAGE}} damage',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: FLING_THORN_DAMAGE },
    COUNT: { kind: 'plain', value: FLING_THORN_COUNT },
};

/** Draw the thorn cone from `from` toward `aim`: a centre line and the two spread edges, FLING_THORN_MAX_DISTANCE long. */
export function drawFlingThornsCone(
    gr: IAbilityPreviewGraphics,
    from: { x: number; y: number },
    aim: { x: number; y: number },
    alpha: number,
): void {
    const { dirX: ux, dirY: uy, dist } = getDirectionFromTo(from.x, from.y, aim.x, aim.y);
    if (dist === 0) return;
    for (const offset of [-FLING_THORN_SPREAD_DEG, 0, FLING_THORN_SPREAD_DEG]) {
        const rad = (offset * Math.PI) / 180;
        const dx = ux * Math.cos(rad) - uy * Math.sin(rad);
        const dy = ux * Math.sin(rad) + uy * Math.cos(rad);
        gr.moveTo(from.x, from.y);
        gr.lineTo(from.x + dx * FLING_THORN_MAX_DISTANCE, from.y + dy * FLING_THORN_MAX_DISTANCE);
        gr.stroke({ color: THORN_COLOR, width: offset === 0 ? 2 : 1.5, alpha: offset === 0 ? alpha : alpha * 0.6 });
    }
}

export const FlingThornAbility_0705: AbilityStatic = defineAbility({
    id: FLING_THORN_ABILITY_ID,
    name: 'Fling Thorns',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: WINDUP,
            abilityPhase: AbilityPhase.Windup,
            castBehaviours: [
                {
                    timingStart: 'start',
                    timingEnd: 'end',
                    behaviour: CastBehaviours.SpellCircle({ style: SPELL_CIRCLE_STYLE_COMMAND, radius: SPELL_CIRCLE_RADIUS }),
                },
            ],
        },
        {
            id: 'fire',
            start: WINDUP,
            end: FIRE_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            // Staggered launches (numeric offsets from the window start), each with its own random angle.
            castBehaviours: Array.from({ length: FLING_THORN_COUNT }, (_, i) => ({
                timingStart: i * THORN_INTERVAL,
                behaviour: CastBehaviours.ProjectileLaunch()
                    .withSpeed(PROJECTILE_SPEED)
                    .withMaxRange(FLING_THORN_MAX_DISTANCE)
                    .withTravelFullRange()
                    .withBaseDamage(FLING_THORN_DAMAGE)
                    .withRandomAimSpread(FLING_THORN_SPREAD_DEG)
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

        drawFlingThornsCone(gr, caster, target, 0.25 + 0.45 * (elapsed / WINDUP));
    },
});

/*
 * Gaoler's Hook — the Iron Warden plants its feet, winds its chain while a red line marks the throw,
 * then flings a barbed hook down that line. The first enemy it catches is hauled back to the
 * Warden's feet, right where its Execution Slam lands next. The hook stops at walls and pillars, so
 * cover beats it; stepping off the line during the wind-up does too.
 */

import type { AbilityRecoveryRule, AbilityStatic, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityEventType, AbilityState } from '../../../abilities/Ability';
import type { AbilityEventRuntimeContext } from '../../../abilities/events/AbilityEventRuntime';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { TargetDef } from '../../../abilities/targeting';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { getDirectionFromTo, getPixelTargetPosition } from '../../../abilities/targetHelpers';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { Effect } from '../../../game/effects/Effect';
import { getCastElapsedAt } from '../../../game/time/actorClock';
import type { ProjectileHitPolicy } from '../../../game/projectiles/Projectile';
import { TETHERED_HOOK_PROJECTILE_TYPE } from '../../../game/projectiles/projectile_defs/tetheredHookDef';
import { CHAIN_LINK_EFFECT_TYPE, type ChainLinkEffectData } from '../../../game/effect_defs/chainEffects';
import { DEFAULT_REEL_DURATION_SEC } from '../../../crowdControl/knockbackKeywords';
import type { CardDef } from '../../types';
import {
    GAOLERS_HOOK_ABILITY_ID,
    HOOK_REEL_STANDOFF_PX,
    WARDEN_IRON,
    WARDEN_TELEGRAPH_RED,
} from '../wardenConstants';

const CARD_ID = GAOLERS_HOOK_ABILITY_ID;

export const GAOLERS_HOOK_WINDUP_SEC = 0.85;
const LAUNCH_END = GAOLERS_HOOK_WINDUP_SEC + 1 / 60;
const COOLDOWN_END = GAOLERS_HOOK_WINDUP_SEC + 0.75;
export const GAOLERS_HOOK_RANGE_PX = 260;
export const GAOLERS_HOOK_SPEED = 560;
export const GAOLERS_HOOK_DAMAGE = 3;
export const GAOLERS_HOOK_RADIUS_PX = 8;
/** Reel tier: CC armour and knockback resistance read this like any knockback. */
export const GAOLERS_HOOK_REEL_TIER = 3;
/** The AI only throws at targets beyond its slam reach; closer ones get slammed instead. */
export const GAOLERS_HOOK_AI_MIN_RANGE = 110;

const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

export const GAOLERS_HOOK_HIT_POLICY: ProjectileHitPolicy = {
    damagingHits: 1,
    overflow: 'stop',
    knockback: {
        tier: GAOLERS_HOOK_REEL_TIER,
        direction: { kind: 'reelToSource', standoffPx: HOOK_REEL_STANDOFF_PX },
    },
};

const HOOK_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="30" fill="#1b1d22"/>
  <path d="M8 54 L30 30" stroke="#9aa1ab" stroke-width="5" stroke-dasharray="5 3" fill="none"/>
  <path d="M30 30 L46 14 M46 14 Q40 12 38 20 M46 14 Q48 20 40 22" stroke="#d7dce2" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;

function tracePolygon(gr: IAbilityPreviewGraphics, pts: readonly number[]): void {
    gr.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) gr.lineTo(pts[i]!, pts[i + 1]!);
    gr.lineTo(pts[0]!, pts[1]!);
}

/**
 * Wind-up telegraph: the full throw line (the hook always flies its whole range), filling in from the
 * Warden outward, with a pulsing barb at the far end. Gone the instant the hook is thrown.
 */
function renderHookTelegraph(
    gr: IAbilityPreviewGraphics,
    caster: Unit,
    activeAbility: { startTime: number; targets: ResolvedTarget[] },
    gameTime: number,
): void {
    const elapsed = getCastElapsedAt(activeAbility, gameTime);
    if (elapsed >= GAOLERS_HOOK_WINDUP_SEC) return;
    const aim = getPixelTargetPosition(activeAbility.targets, 0);
    if (!aim) return;
    const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, aim.x, aim.y);
    if (dist === 0) return;
    const t = elapsed / GAOLERS_HOOK_WINDUP_SEC;
    const endX = caster.x + dirX * GAOLERS_HOOK_RANGE_PX;
    const endY = caster.y + dirY * GAOLERS_HOOK_RANGE_PX;
    const halfW = GAOLERS_HOOK_RADIUS_PX + 6;
    const nx = -dirY * halfW;
    const ny = dirX * halfW;

    // Faint full lane, then a solid lane growing out from the Warden.
    tracePolygon(gr, [caster.x + nx, caster.y + ny, endX + nx, endY + ny, endX - nx, endY - ny, caster.x - nx, caster.y - ny]);
    gr.fill({ color: WARDEN_TELEGRAPH_RED, alpha: 0.07 });
    gr.stroke({ color: WARDEN_TELEGRAPH_RED, width: 1, alpha: 0.18 + 0.5 * t });
    const fillX = caster.x + dirX * GAOLERS_HOOK_RANGE_PX * t;
    const fillY = caster.y + dirY * GAOLERS_HOOK_RANGE_PX * t;
    tracePolygon(gr, [caster.x + nx * 0.5, caster.y + ny * 0.5, fillX + nx * 0.5, fillY + ny * 0.5, fillX - nx * 0.5, fillY - ny * 0.5, caster.x - nx * 0.5, caster.y - ny * 0.5]);
    gr.fill({ color: WARDEN_TELEGRAPH_RED, alpha: 0.28 });

    // Barb marker at the far end, pulsing faster as the throw nears.
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * (8 + 16 * t));
    gr.circle(endX, endY, 5 + 3 * pulse);
    gr.stroke({ color: WARDEN_IRON, width: 2, alpha: 0.4 + 0.5 * t });
}

/** Chain stretched from the Warden to the reeled victim for the length of the reel. */
function spawnReelChain(engine: { addEffect?: (e: Effect) => void }, caster: Unit, victim: Unit): void {
    if (!engine.addEffect) return;
    const data: ChainLinkEffectData = { fromUnitId: caster.id, toUnitId: victim.id };
    engine.addEffect(new Effect({
        x: caster.x,
        y: caster.y,
        duration: DEFAULT_REEL_DURATION_SEC + 0.3,
        effectType: CHAIN_LINK_EFFECT_TYPE,
        effectData: { ...data },
    }));
}

export const GaolersHookAbility_1201: AbilityStatic = defineAbility({
    id: CARD_ID,
    name: "Gaoler's Hook",
    image: HOOK_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: GAOLERS_HOOK_WINDUP_SEC,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: GAOLERS_HOOK_WINDUP_SEC,
            abilityPhase: AbilityPhase.Windup,
            timelineLabel: 'Winding the chain',
            behaviour: CastBehaviours.CasterShake({ from: 0.5, to: 2 }),
        },
        {
            id: 'throw',
            start: GAOLERS_HOOK_WINDUP_SEC,
            end: LAUNCH_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            behaviour: CastBehaviours.ProjectileLaunch()
                .withProjectileType(TETHERED_HOOK_PROJECTILE_TYPE)
                .withSpeed(GAOLERS_HOOK_SPEED)
                .withMaxRange(GAOLERS_HOOK_RANGE_PX)
                .withTravelFullRange()
                .withRadius(GAOLERS_HOOK_RADIUS_PX)
                .withBaseDamage(GAOLERS_HOOK_DAMAGE)
                .withHitPolicy(GAOLERS_HOOK_HIT_POLICY)
                .withModifiers(['stopsAtWalls']),
        },
        { id: 'cooldown', start: LAUNCH_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Throw direction' }] as TargetDef[],
    getRange: () => ({ minRange: 0, maxRange: GAOLERS_HOOK_RANGE_PX }),
    // Planted while winding the chain; free to walk once it is thrown.
    getAbilityStates: (currentTime: number) =>
        currentTime < LAUNCH_END ? [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }] : [],
    aiSettings: {
        minRange: GAOLERS_HOOK_AI_MIN_RANGE,
        maxRange: GAOLERS_HOOK_RANGE_PX - 20,
        maxUsesPerRound: MAX_USES,
        priority: 30,
        ninjutsu: { ignore: true },
    },

    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                conditions: [],
                effects: [
                    {
                        type: 'custom',
                        effectId: 'gaolersHookReelChain',
                        comment: 'Visual only: a chain from the Warden to the hooked victim while it is reeled in.',
                    },
                ],
            },
        ],
    },
    customEffectHandlers: {
        gaolersHookReelChain: (_params, ctx) => {
            const c = ctx as AbilityEventRuntimeContext;
            if (!c.primaryTarget) return;
            spawnReelChain(c.engine, c.caster, c.primaryTarget);
        },
    },

    renderActivePreview: renderHookTelegraph,

    getTooltipText(): string[] {
        return [
            `Winds up, then hurls a hooked chain up to {${GAOLERS_HOOK_RANGE_PX}} px. The first enemy hit takes {${GAOLERS_HOOK_DAMAGE}} damage and is dragged to the Warden's feet.`,
            'Stopped by walls and pillars.',
        ];
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },
});

export const GaolersHookCard: CardDef = {
    abilityId: CARD_ID,
};

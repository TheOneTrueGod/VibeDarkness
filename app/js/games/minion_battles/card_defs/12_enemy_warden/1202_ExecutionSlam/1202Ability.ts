/*
 * Execution Slam — the Iron Warden heaves its tower shield overhead, shaking with the strain while a
 * red disc fills in on the floor in front of it, then brings the edge down like a guillotine. Heavy
 * damage and a knockback to anything in the disc, the floor cracking open. It is the payoff of
 * Gaoler's Hook: a hooked victim lands inside the disc and has the wind-up to get out. Afterwards
 * the Warden is stuck in place with its shield down, the party's best window to hit it.
 */

import type { AbilityRecoveryRule, AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityState } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { TargetDef } from '../../../abilities/targeting';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { defineAbility } from '../../../abilities/defineAbility';
import { damageEnemiesInCircle, getDirectionFromTo, getPixelTargetPosition } from '../../../abilities/targetHelpers';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { drawEnemyCircleHitboxTelegraph } from '../../../abilities/previewHelpers';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../../../crowdControl/knockbackKeywords';
import { Effect } from '../../../game/effects/Effect';
import { getCastElapsedAt } from '../../../game/time/actorClock';
import type { ResolvedTarget } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { GROUND_SLAM_EFFECT_TYPE, type GroundSlamEffectData } from '../../../game/effect_defs/groundSlamEffects';
import type { CardDef } from '../../types';
import { EXECUTION_SLAM_ABILITY_ID, WARDEN_EMBER, WARDEN_TELEGRAPH_RED } from '../wardenConstants';

const CARD_ID = EXECUTION_SLAM_ABILITY_ID;

export const EXECUTION_SLAM_WINDUP_SEC = 1.2;
const STRIKE_END = EXECUTION_SLAM_WINDUP_SEC + 1 / 60;
/** Recovery with the shield down: the punish window. */
export const EXECUTION_SLAM_RECOVERY_SEC = 1.3;
const COOLDOWN_END = STRIKE_END + EXECUTION_SLAM_RECOVERY_SEC;
/** Blast centre, ahead of the Warden's centre along the aim. */
export const EXECUTION_SLAM_OFFSET_PX = 46;
export const EXECUTION_SLAM_RADIUS_PX = 52;
export const EXECUTION_SLAM_DAMAGE = 12;
export const EXECUTION_SLAM_KNOCKBACK_TIER = 2;
/** The AI slams when its target is inside the blast's far edge. */
export const EXECUTION_SLAM_REACH_PX = EXECUTION_SLAM_OFFSET_PX + EXECUTION_SLAM_RADIUS_PX;
const SLAM_EFFECT_SEC = 1.4;

const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const SLAM_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="30" fill="#1b1d22"/>
  <rect x="22" y="6" width="20" height="30" rx="3" fill="#6b7280" stroke="#d7dce2" stroke-width="2"/>
  <path d="M32 40 L32 60 M32 48 L18 58 M32 48 L46 58 M32 52 L24 62 M32 52 L40 62" stroke="#ff7a3d" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`;

/** Blast centre for a Warden at `caster` aiming at `aim`; the Warden's own spot when the aim is degenerate. */
export function executionSlamCenter(
    caster: { x: number; y: number },
    aim: { x: number; y: number } | null,
): { x: number; y: number } {
    if (!aim) return { x: caster.x, y: caster.y };
    const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, aim.x, aim.y);
    if (dist === 0) return { x: caster.x, y: caster.y };
    return { x: caster.x + dirX * EXECUTION_SLAM_OFFSET_PX, y: caster.y + dirY * EXECUTION_SLAM_OFFSET_PX };
}

/** The strike: damage and knockback to every enemy in the disc, then the cracked-floor visual. */
function slam(ctx: CastBehaviourTickContext): void {
    const { caster, engine } = ctx;
    const center = executionSlamCenter(caster, getPixelTargetPosition(ctx.allTargets, 0));
    const knockbackCtx = knockbackCtxFromEngine(engine);
    damageEnemiesInCircle({
        engine,
        caster,
        center,
        radius: EXECUTION_SLAM_RADIUS_PX,
        damage: EXECUTION_SLAM_DAMAGE,
        abilityId: CARD_ID,
        onHit: (unit) => {
            const outcome = tryDamageOrBlock(unit, {
                engine,
                gameTime: engine.gameTime,
                eventBus: engine.eventBus,
                // From the Warden, so a raised shield facing the Warden blocks it.
                attackerX: caster.x,
                attackerY: caster.y,
                attackerId: caster.id,
                abilityId: CARD_ID,
                damage: EXECUTION_SLAM_DAMAGE,
                attackType: 'melee',
            });
            if (!outcome.hit) return;
            tryApplyKnockbackByTier(
                unit,
                EXECUTION_SLAM_KNOCKBACK_TIER,
                { unitId: caster.id, abilityId: CARD_ID },
                center.x,
                center.y,
                knockbackCtx,
            );
        },
    });
    const effectData: GroundSlamEffectData = {
        color: WARDEN_EMBER,
        seed: Math.floor(engine.gameTime * 60) % 997,
    };
    engine.addEffect(new Effect({
        x: center.x,
        y: center.y,
        duration: SLAM_EFFECT_SEC,
        effectType: GROUND_SLAM_EFFECT_TYPE,
        effectRadius: EXECUTION_SLAM_RADIUS_PX,
        effectData: { ...effectData },
    }));
}

function renderSlamTelegraph(
    gr: IAbilityPreviewGraphics,
    caster: Unit,
    activeAbility: { startTime: number; targets: ResolvedTarget[] },
    gameTime: number,
): void {
    const elapsed = getCastElapsedAt(activeAbility, gameTime);
    if (elapsed >= STRIKE_END + 0.15) return;
    const center = executionSlamCenter(caster, getPixelTargetPosition(activeAbility.targets, 0));
    drawEnemyCircleHitboxTelegraph(
        gr,
        center.x,
        center.y,
        EXECUTION_SLAM_RADIUS_PX,
        elapsed,
        EXECUTION_SLAM_WINDUP_SEC,
        { color: WARDEN_TELEGRAPH_RED, holdFullRedUntilOffset: 0.15 },
    );
}

export const ExecutionSlamAbility_1202: AbilityStatic = defineAbility({
    id: CARD_ID,
    name: 'Execution Slam',
    image: SLAM_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: EXECUTION_SLAM_WINDUP_SEC,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: EXECUTION_SLAM_WINDUP_SEC,
            abilityPhase: AbilityPhase.Windup,
            timelineLabel: 'Shield raised overhead',
            behaviour: CastBehaviours.CasterShake({ from: 0.5, to: 3.5 }),
        },
        {
            id: 'strike',
            start: EXECUTION_SLAM_WINDUP_SEC,
            end: STRIKE_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            behaviour: CastBehaviours.Instant(slam),
        },
        {
            id: 'cooldown',
            start: STRIKE_END,
            end: COOLDOWN_END,
            abilityPhase: AbilityPhase.Cooldown,
            timelineLabel: 'Shield down',
        },
    ],
    targets: [{ type: 'pixel', label: 'Slam direction' }] as TargetDef[],
    getRange: () => ({ minRange: 0, maxRange: EXECUTION_SLAM_REACH_PX }),
    // Planted from wind-up to the end of recovery: the whole cast is the punish window.
    getAbilityStates: (currentTime: number) =>
        currentTime < COOLDOWN_END ? [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }] : [],
    aiSettings: {
        minRange: 0,
        maxRange: EXECUTION_SLAM_REACH_PX,
        maxUsesPerRound: MAX_USES,
        priority: 20,
        ninjutsu: { ignore: true },
    },

    renderActivePreview: renderSlamTelegraph,

    getTooltipText(): string[] {
        return [
            `Heaves its shield overhead, then slams it down in front of itself: {${EXECUTION_SLAM_DAMAGE}} damage to each enemy in the blast.`,
            `Knockback ${EXECUTION_SLAM_KNOCKBACK_TIER}`,
            'Stuck in place with its shield down for a moment afterwards.',
        ];
    },
});

export const ExecutionSlamCard: CardDef = {
    abilityId: CARD_ID,
};

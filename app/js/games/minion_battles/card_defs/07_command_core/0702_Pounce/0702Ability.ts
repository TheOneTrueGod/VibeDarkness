/**
 * Pounce — the dog's command-triggered dash ability.
 *
 * Pet-only: no aiSettings, so the pet AI never auto-queues it. Only the player's
 * Sic 'em (0704) card causes the pet to use Pounce. Quick charge (~0.3 s windup)
 * then dash (~0.25 s) toward a pixel target, passing through up to 3 enemies and
 * stopping on the 4th hit. On each hit:
 * 3 damage, ~1 s stun, and tier-2 knockback opposite the dash direction (flung over
 * the dog's shoulder).
 */

import type { AbilityRecoveryRule, AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityState } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { DashBehaviour } from '../../../abilities/CastBehaviours/DashBehaviour';
import { tryApplyHardCcStun } from '../../../crowdControl/tryApplyHardCcStun';
import { applyDirectionalKnockback } from '../../../crowdControl/knockbackKeywords';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { getDirectionFromTo } from '../../../abilities/targetHelpers';
import type { KnockbackEngineCtx } from '../../../crowdControl/knockbackKeywords';
import { drawChargeCapsuleTimingTelegraph, resolveTerrainAwareMovementDisplacement } from '../../../abilities/previewHelpers';
import { DoubleDamageBuff, DOUBLE_DAMAGE_BUFF_TYPE } from '../../../buffs/DoubleDamageBuff';

const CARD_ID = `${formatGroupId(AbilityGroupId.Command)}02`;

/** Pounce is restored only by Sic 'em granting a commandCharge — never by stamina. */
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'commandCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const WINDUP_TIME = 0.3;
const DASH_DURATION = 0.3;
const COOLDOWN_DURATION = 0.8;
export const MAX_DASH_DISTANCE = 100;
/** Step size when probing passability along the pounce path (matches DashBehaviour default). */
export const POUNCE_COLLISION_STEP = 4;
const DAMAGE = 8;
const STUN_DURATION = 1.0;
const KNOCKBACK_TIER = 2;
/** Pass through this many hits; dash ends on the next one. */
const STOP_AFTER_HITS = 4;

const pounceDash = new DashBehaviour()
    .withMaxDistance(MAX_DASH_DISTANCE)
    .withCollisionStep(POUNCE_COLLISION_STEP)
    .withStopAfterHits(STOP_AFTER_HITS)
    .addHitbox('caster', { shape: 'circle', range: 'caster' }, {
        damage: (ctx) => {
            const idx = ctx.caster.buffs.findIndex(
                (b) => b._type === DOUBLE_DAMAGE_BUFF_TYPE && (b as DoubleDamageBuff).abilityId === ctx.abilityId,
            );
            if (idx >= 0) {
                ctx.caster.buffs.splice(idx, 1);
                return DAMAGE * 2;
            }
            return DAMAGE;
        },
        attackType: 'charging',
        filter: 'enemy',
    })
    .withOnHit((hitUnit, ctx) => {
        // Compute the dash direction from caster toward target at hit time.
        const payload = ctx.behaviourPayload as { endX?: number; endY?: number } | null;
        const targetX = payload?.endX ?? ctx.caster.x + 1;
        const targetY = payload?.endY ?? ctx.caster.y;
        const { dirX, dirY } = getDirectionFromTo(ctx.caster.x, ctx.caster.y, targetX, targetY);

        const knockbackEngine: KnockbackEngineCtx = {
            gameTime: ctx.engine.gameTime,
            roundNumber: (ctx.engine as { roundNumber?: number }).roundNumber ?? 1,
            eventBus: ctx.engine.eventBus,
            interruptUnitAndRefundAbilities: (u) =>
                (ctx.engine as { interruptUnitAndRefundAbilities?(u: Unit): void }).interruptUnitAndRefundAbilities?.(u),
        };

        tryApplyHardCcStun(hitUnit, STUN_DURATION, ctx.engine.gameTime, knockbackEngine.roundNumber);
        // Fling the victim backward over the dog's shoulder — opposite the dash direction.
        applyDirectionalKnockback(
            hitUnit,
            KNOCKBACK_TIER,
            { x: -dirX, y: -dirY },
            { unitId: ctx.caster.id, abilityId: CARD_ID },
            knockbackEngine,
        );
    });

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: WINDUP_TIME,
        abilityPhase: AbilityPhase.Windup,
    },
    {
        id: 'dash',
        start: WINDUP_TIME,
        end: WINDUP_TIME + DASH_DURATION,
        abilityPhase: AbilityPhase.Active,
        behaviour: pounceDash,
    },
    {
        id: 'cooldown',
        start: WINDUP_TIME + DASH_DURATION,
        end: WINDUP_TIME + DASH_DURATION + COOLDOWN_DURATION,
        abilityPhase: AbilityPhase.Cooldown,
    },
];

const POUNCE_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#1a1205" stroke="#3d2a0a" stroke-width="2"/>
  <path d="M14 36 L32 16 L50 36" stroke="#c8822a" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="32" cy="16" r="5" fill="#c8822a" opacity="0.7"/>
  <path d="M20 44 L32 36 L44 44" stroke="#c8822a" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>`;

export const PounceAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Pounce',
    image: POUNCE_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: WINDUP_TIME,
    // No aiSettings — AI never auto-queues Pounce; only Sic 'em (0704) triggers it.
    targets: [{ type: 'pixel', label: 'Pounce target' }],
    abilityTimings: ABILITY_TIMINGS,

    getTooltipText(): string[] {
        return [
            `Leap through enemies, stopping on the ${STOP_AFTER_HITS}th hit. Each hit deals {${DAMAGE}} damage, stuns for {${STUN_DURATION}s}, and flings the target backwards.`,
        ];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < WINDUP_TIME) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    beginActiveCast(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        active: ActiveAbility,
    ): void {
        const t = targets[0];
        let targetX = caster.x;
        let targetY = caster.y;
        if (t?.type === 'pixel' && t.position) {
            targetX = t.position.x;
            targetY = t.position.y;
        }
        const { dx, dy } = resolveTerrainAwareMovementDisplacement(
            caster.x,
            caster.y,
            targetX,
            targetY,
            MAX_DASH_DISTANCE,
            engine,
            POUNCE_COLLISION_STEP,
        );
        const endX = caster.x + dx;
        const endY = caster.y + dy;
        active.castPayload = { startX: caster.x, startY: caster.y, targetX, targetY, endX, endY };
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const payload = activeAbility.castPayload as {
            startX?: number; startY?: number;
            endX?: number; endY?: number;
        } | undefined;
        if (!payload) return;

        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed >= WINDUP_TIME + DASH_DURATION) return;

        const startX = payload.startX ?? caster.x;
        const startY = payload.startY ?? caster.y;
        const endX = payload.endX ?? caster.x;
        const endY = payload.endY ?? caster.y;

        if (elapsed < WINDUP_TIME) {
            // Windup: expanding capsule telegraph from start toward clamped target.
            drawChargeCapsuleTimingTelegraph(
                gr, startX, startY, endX, endY,
                caster.radius * 0.8,
                elapsed, WINDUP_TIME,
                0x3b82f6,
            );
        } else {
            // Dash: shrinking line from caster's live position toward the fixed endpoint.
            gr.moveTo(caster.x, caster.y);
            gr.lineTo(endX, endY);
            gr.stroke({ color: 0x3b82f6, width: 8, alpha: 0.7 });
            gr.circle(endX, endY, caster.radius * 1.1);
            gr.stroke({ color: 0x3b82f6, width: 2, alpha: 0.8 });
        }
    },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: MAX_DASH_DISTANCE };
    },

};

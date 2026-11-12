/**
 * Pounce — the spirit's command-triggered lunge (Sic 'em, 0704).
 *
 * Pet-only: no aiSettings, so the pet AI never auto-queues it. Only the player's Sic 'em card causes the
 * pet to use Pounce. Short windup (the charge telegraph), then a dash toward a pixel target that stops on
 * its first hit: that enemy takes a short stun (no damage), and the spirit locks on to it — Spirit Flurry
 * (0711) follows, four dash strikes over about a second. A pounce that hits nothing still flurries where it
 * lands: each strike goes through whichever enemy is nearest that spot (one per strike), or through thin air.
 */

import type { AbilityRecoveryRule, AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityState } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { DashBehaviour } from '../../../abilities/CastBehaviours/DashBehaviour';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { tryApplyHardCcStun } from '../../../crowdControl/tryApplyHardCcStun';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import type { KnockbackEngineCtx } from '../../../crowdControl/knockbackKeywords';
import { drawChargeCapsuleTimingTelegraph, resolveTerrainAwareMovementDisplacement } from '../../../abilities/previewHelpers';
import { nullHitbox } from '../../../hitboxes';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../../abilities/tooltipTokens';
import { getCastElapsedAt } from '../../../game/time/actorClock';

import { commandPetAbility } from '../../../abilities/petCommands';
import { getRunningCastPriority } from '../../../game/units/castPriority';
import { SPIRIT_FLURRY_ABILITY_ID, SPIRIT_FLURRY_ANGLES } from '../0711_SpiritFlurry/0711Ability';
import { SPIRIT_STRIKE_DAMAGE } from '../0710_SpiritStrike/0710Ability';

const CARD_ID = `${formatGroupId(AbilityGroupId.Command)}02`;

/** Pounce is restored only by Sic 'em granting a commandCharge — never by stamina. */
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'commandCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const WINDUP_TIME = 0.2;
const DASH_DURATION = 0.3;
const COOLDOWN_DURATION = 0.1;
export const MAX_DASH_DISTANCE = 100;
/** Step size when probing passability along the pounce path (matches DashBehaviour default). */
export const POUNCE_COLLISION_STEP = 4;
/** Pounce only locks on and stuns: all of Sic 'em's damage comes from the Spirit Flurry strikes. */
const DAMAGE = 0;
const STUN_DURATION = 1.0;
/** Lock on: the dash ends on its first hit, and Spirit Flurry (0711) follows on that enemy. */
const STOP_AFTER_HITS = 1;

const TOOLTIP_LINES = [
    'Lunge at a point. The first enemy hit is stunned for {{STUN_DURATION}}s, then your spirit locks on and dashes through it {{FLURRY_STRIKES}} times for {{STRIKE_DAMAGE}} damage each. On a miss, the dashes strike whatever enemy is nearest where it lands, one at a time.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    FLURRY_STRIKES: { kind: 'plain', value: SPIRIT_FLURRY_ANGLES.length },
    STRIKE_DAMAGE: { kind: 'damage', base: SPIRIT_STRIKE_DAMAGE },
    STUN_DURATION: { kind: 'plain', value: STUN_DURATION },
};

const pounceDash = new DashBehaviour()
    .withMaxDistance(MAX_DASH_DISTANCE)
    .withCollisionStep(POUNCE_COLLISION_STEP)
    .withStopAfterHits(STOP_AFTER_HITS)
    .addHitbox('caster', { shape: 'circle', range: 'caster' }, {
        damage: DAMAGE,
        attackType: 'charging',
        filter: 'enemy',
    })
    .withOnHit((hitUnit, ctx) => {
        const knockbackEngine: KnockbackEngineCtx = {
            gameTime: ctx.engine.gameTime,
            roundNumber: (ctx.engine as { roundNumber?: number }).roundNumber ?? 1,
            eventBus: ctx.engine.eventBus,
            interruptUnitAndRefundAbilities: (u) =>
                (ctx.engine as { interruptUnitAndRefundAbilities?(u: Unit): void }).interruptUnitAndRefundAbilities?.(u),
        };
        // Hold the victim in place for the flurry (no knockback: the spirit locks on instead).
        tryApplyHardCcStun(hitUnit, STUN_DURATION, ctx.engine.gameTime, knockbackEngine.roundNumber, ctx.engine.eventBus);
        startFlurry(ctx, { type: 'unit', unitId: hitUnit.id });
    })
    // A whiff still flurries, on the spot where the pounce landed.
    .withOnEndWithoutHit((ctx) => startFlurry(ctx, { type: 'pixel', position: { x: ctx.caster.x, y: ctx.caster.y } }));

/** Spirit Flurry is Pounce's follow-up: it keeps Pounce's stamped priority and replaces the Pounce cast. */
function startFlurry(ctx: CastBehaviourTickContext, target: ResolvedTarget): void {
    const priority = getRunningCastPriority(ctx.caster, ctx.abilityId);
    commandPetAbility([ctx.caster], SPIRIT_FLURRY_ABILITY_ID, [target], ctx.engine, {
        preGrantCharge: { chargeType: 'commandCharge', amount: 1 },
        ...(priority !== undefined ? { priority, followUpOf: ctx.abilityId } : {}),
    });
}

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
        doNotRefund: true,
        targetDef: { kind: 'select', label: 'Pounce target', hitbox: nullHitbox, filter: 'any', allowMiss: true },
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
    targets: [],
    abilityTimings: ABILITY_TIMINGS,

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
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

        const elapsed = getCastElapsedAt(activeAbility, gameTime);
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

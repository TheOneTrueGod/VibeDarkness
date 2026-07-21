/**
 * Bramble Patch (pet strike) — commanded by the player's Bramble Patch card (0707).
 * Owns the slam windup (pet rooted) then Thorn Stomp–style payoff. Restored only by
 * commandCharge from the owner card.
 */

import type { AbilityRecoveryRule, AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { Effect } from '../../../game/effects/Effect';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { ActiveAbility } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import type { KnockbackSource } from '../../../game/units/unitTypes';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { damageEnemiesInCircle, placeJitteredGroundThorns } from '../../../abilities/targetHelpers';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../../../crowdControl/knockbackKeywords';
import type { EventBus } from '../../../game/EventBus';
import type { TerrainLayerManager } from '../../../game/TerrainLayerManager';
import { ROUND_DURATION } from '../../../game/gameConstants';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';

export const BRAMBLE_PATCH_STRIKE_ID = `${formatGroupId(AbilityGroupId.Command)}06`;

/** Blast radius — shared with the owner command card's confirmRadius preview. */
export const BRAMBLE_PATCH_RADIUS = 95;
export const BRAMBLE_PATCH_DAMAGE = 7;
export const BRAMBLE_PATCH_KNOCKBACK_TIER = 2;
/** Pet windup length — command card telegraph is timed to match. */
export const BRAMBLE_PATCH_WINDUP = 1.0;
/**
 * Same ground thorns as lanternite nest aura (`0014`): DoT hits `dark_creature` only, so
 * players and lanternites are treated as allied (immune). Distinct from Thornbinder's
 * `dark_thorn`, which damages everything except dark creatures.
 */
export const BRAMBLE_PATCH_THORN_EFFECT_TYPE = 'bramble_slow';
const SLOW_MULT = 0.52;
const THORN_CLEAR_BEFORE_NEXT_SEC = 0.15;
const DURATION_JITTER_IN_SECONDS = 1;

const WINDUP = BRAMBLE_PATCH_WINDUP;
const STRIKE_END = WINDUP + 1 / 60;
const COOLDOWN_END = STRIKE_END + 0.1;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'commandCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

interface EngineLike {
    units: Unit[];
    gameTime: number;
    roundNumber?: number;
    eventBus: EventBus;
    terrainLayers: TerrainLayerManager;
    lightLevelEnabled: boolean;
    globalLightLevel: number;
    terrainManager: { grid: import('../../../terrain/TerrainGrid').TerrainGrid } | null;
    addEffect(effect: Effect): void;
    getAllLightSources(): import('../../../game/LightGrid').LightSource[];
    generateRandomInteger(min: number, max: number): number;
}

export function applyBramblePatchStrike(engine: EngineLike, caster: Unit): void {
    const center = { x: caster.x, y: caster.y };
    const knockbackCtx = knockbackCtxFromEngine(engine);
    const knockbackSource: KnockbackSource = { unitId: caster.id, abilityId: BRAMBLE_PATCH_STRIKE_ID };

    damageEnemiesInCircle({
        engine,
        caster,
        center,
        radius: BRAMBLE_PATCH_RADIUS,
        damage: BRAMBLE_PATCH_DAMAGE,
        abilityId: BRAMBLE_PATCH_STRIKE_ID,
        attackType: 'melee',
        onHit: (unit) => {
            tryDamageOrBlock(unit, {
                engine,
                gameTime: engine.gameTime,
                eventBus: engine.eventBus,
                attackerX: center.x,
                attackerY: center.y,
                attackerId: caster.id,
                abilityId: BRAMBLE_PATCH_STRIKE_ID,
                damage: BRAMBLE_PATCH_DAMAGE,
                attackType: 'melee',
            });
            tryApplyKnockbackByTier(unit, BRAMBLE_PATCH_KNOCKBACK_TIER, knockbackSource, center.x, center.y, knockbackCtx);
        },
    });

    const baseExpiresAt = engine.gameTime + ROUND_DURATION - THORN_CLEAR_BEFORE_NEXT_SEC;
    placeJitteredGroundThorns({
        engine,
        caster,
        center,
        radius: BRAMBLE_PATCH_RADIUS,
        effectType: BRAMBLE_PATCH_THORN_EFFECT_TYPE,
        placedAtGameTime: engine.gameTime,
        baseExpiresAtGameTime: baseExpiresAt,
        durationJitterInSeconds: DURATION_JITTER_IN_SECONDS,
        ownerAbilityId: BRAMBLE_PATCH_STRIKE_ID,
        params: { slowMult: SLOW_MULT },
        idPrefix: `bramblepatch-${caster.id}-${engine.gameTime}`,
    });

    engine.addEffect(new Effect({
        x: center.x,
        y: center.y,
        duration: 0.6,
        effectType: 'BrambleExplosion',
        effectRadius: BRAMBLE_PATCH_RADIUS,
    }));
}

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: WINDUP,
        abilityPhase: AbilityPhase.Windup,
    },
    {
        id: 'strike',
        start: WINDUP,
        end: STRIKE_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        castBehaviours: [
            {
                timingStart: 'start',
                behaviour: CastBehaviours.Instant((ctx) => {
                    applyBramblePatchStrike(ctx.engine as unknown as EngineLike, ctx.caster);
                }),
            },
        ],
    },
    { id: 'cooldown', start: STRIKE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
];

export const BramblePatchStrikeAbility_0706: AbilityStatic = defineAbility({
    id: BRAMBLE_PATCH_STRIKE_ID,
    name: 'Bramble Patch',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: 1,
    recoveries: RECOVERIES,
    durationJitterInSeconds: DURATION_JITTER_IN_SECONDS,
    prefireTime: WINDUP,
    // Full root for the windup so the pet cannot walk out of the slam telegraph.
    movementLock: { until: WINDUP },
    // No aiSettings — only commanded via 0707.
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    getRange: () => ({ minRange: 0, maxRange: BRAMBLE_PATCH_RADIUS }),

    getTooltipText(): string[] {
        return [
            'Slam the ground, dealing damage and leaving lanternite-style bramble that slows movement and damages shadow creatures.',
            `{knockback ${BRAMBLE_PATCH_KNOCKBACK_TIER}}`,
        ];
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed >= WINDUP) {
            gr.circle(caster.x, caster.y, BRAMBLE_PATCH_RADIUS);
            gr.stroke({ color: 0x86efac, width: 2, alpha: 0.5 });
            return;
        }
        const borderAlpha = 0.25 + 0.55 * Math.min(1, elapsed / WINDUP);
        gr.circle(caster.x, caster.y, BRAMBLE_PATCH_RADIUS);
        gr.stroke({ color: 0xef4444, width: 2, alpha: borderAlpha });
    },
});

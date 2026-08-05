/**
 * Thornbinder â€” AoE bramble slam: damage + a slowing patch that persists on the terrain
 * layer (owned by the terrain system, not this unit) until it naturally expires.
 */

import type { AbilityRecoveryRule, AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import type { ActiveAbility } from '../../game/types';
import { Projectile } from '../../game/projectiles/Projectile';
import { Effect } from '../../game/effects/Effect';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import type { Unit } from '../../game/units/Unit';
import { HitboxSpec } from '../../hitboxes';
import type { HitboxEngineContext, HitboxPreviewCaster } from '../../hitboxes';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { getPixelTargetPosition, damageEnemiesInCircle, placeJitteredGroundThorns } from '../../abilities/targetHelpers';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../../crowdControl/knockbackKeywords';
import type { KnockbackSource } from '../../game/units/unitTypes';
import type { EventBus } from '../../game/EventBus';
import { isLightHateWeakened } from '../../game/lightHate';
import type { TerrainLayerManager } from '../../game/TerrainLayerManager';
import { ROUND_DURATION } from '../../game/gameConstants';
import { DARK_THORN_DURATION_ROUNDS } from '../../game/terrainEffects/tileTransitions';

export const THORNBINDER_ABILITY_ID = `${formatGroupId(AbilityGroupId.Enemy)}08`;

const MAX_USES = 2;
// 2 uses banked at once, so the ability can burst-cast twice before needing a fresh round of recovery.
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 2 },
];
/** Windup ends / projectile launches at this elapsed time (seconds). */
export const THORNBINDER_LOCK_TIME = 1.3;
const LOCK_TIME = THORNBINDER_LOCK_TIME;
const STRIKE_TIME = 1.85;
// A tiny amount over half a round, so back-to-back banked uses land just past the round midpoint.
const COOLDOWN_END = ROUND_DURATION / 2 + 0.1;
/** Impact AoE radius (normal light); used by expiration + projectile preview. */
export const THORNBINDER_BASE_RADIUS = 95;
const BASE_RADIUS = THORNBINDER_BASE_RADIUS;
const WEAKENED_RADIUS = 72;
const BASE_DAMAGE = 7;
const WEAKENED_DAMAGE = 5;
const SLOW_MULT_NORMAL = 0.52;
const SLOW_MULT_WEAKENED = 0.72;
const BRAMBLE_CLEAR_BEFORE_NEXT_SEC = 0.15;
const KNOCKBACK_TIER = 1;
const TARGETING_RANGE = 320;
const DURATION_JITTER_IN_SECONDS = 1;
// Flight time ~=1s at max range (matches the old fixed windup->strike cadence); faster for closer targets.
const THORN_PROJECTILE_SPEED = TARGETING_RANGE / (STRIKE_TIME - LOCK_TIME);
const ARC_HEIGHT = 100;

class ThornbinderHitboxSpec extends HitboxSpec {
    get maxRange(): number { return TARGETING_RANGE; }
    renderTargetingPreview(gr: IAbilityPreviewGraphics, caster: HitboxPreviewCaster, _mouseWorld: { x: number; y: number }, _units: Unit[]): Unit[] {
        gr.circle(caster.x, caster.y, TARGETING_RANGE);
        gr.stroke({ width: 1, color: 0xef4444, alpha: 0.35 });
        return [];
    }
    resolveTargets(_caster: Unit, _aimPoint: { x: number; y: number }, _units: Unit[]): Unit[] { return []; }
    resolveHits(_engine: HitboxEngineContext, _caster: Unit, _aimX: number, _aimY: number): Unit[] { return []; }
}
const THORNBINDER_HITBOX = new ThornbinderHitboxSpec();

interface EngineLike {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    terrainLayers: TerrainLayerManager;
    lightLevelEnabled: boolean;
    globalLightLevel: number;
    terrainManager: { grid: import('../../terrain/TerrainGrid').TerrainGrid } | null;
    addEffect(effect: Effect): void;
    getAllLightSources(): import('../../game/LightGrid').LightSource[];
    generateRandomInteger(min: number, max: number): number;
}

export const ThornbinderBrambleAbility: AbilityStatic = {
    id: THORNBINDER_ABILITY_ID,
    name: 'Thornbinder Bramble',
    image: '',
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    durationJitterInSeconds: DURATION_JITTER_IN_SECONDS,
    prefireTime: STRIKE_TIME,
    abilityTimings: [
        { id: 'windup', start: 0, end: LOCK_TIME, abilityPhase: AbilityPhase.Windup },
        {
            id: 'strike',
            start: LOCK_TIME,
            end: STRIKE_TIME,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            targetDef: { kind: 'select', label: 'Ground', hitbox: THORNBINDER_HITBOX, filter: 'any', allowMiss: true },
            behaviour: CastBehaviours.ProjectileLaunch()
                .withSpeed(THORN_PROJECTILE_SPEED)
                .withMaxRange(TARGETING_RANGE)
                .withProjectileType('bramble_spike')
                .withPassThroughEnemies()
                .withArcHeight(ARC_HEIGHT),
        },
        { id: 'cooldown', start: STRIKE_TIME, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [],
    aiSettings: {
        minRange: 0,
        maxRange: 320,
        // This is a ground-target cast (targets: []); without this the AI would treat it as
        // always valid regardless of distance to the locked pursuit target.
        enforceRangeWhenUntargeted: true,
    },

    getTooltipText(): string[] {
        return [
            `Slam the ground, dealing damage, {knockback ${KNOCKBACK_TIER}}, and leaving bramble that slows movement`,
            'Weakened by bright light (Light Hate)',
        ];
    },
    getAbilityStates(): AbilityStateEntry[] {
        return [];
    },

    onProjectileExpired(engine: unknown, caster: Unit, projectile: Projectile): void {
        const eng = engine as EngineLike;
        const pos = { x: projectile.x, y: projectile.y };

        const weakened = isLightHateWeakened(caster, eng);
        const radius = weakened ? WEAKENED_RADIUS : BASE_RADIUS;
        const damage = weakened ? WEAKENED_DAMAGE : BASE_DAMAGE;
        const slowMult = weakened ? SLOW_MULT_WEAKENED : SLOW_MULT_NORMAL;

        const knockbackCtx = knockbackCtxFromEngine(eng);
        const knockbackSource: KnockbackSource = { unitId: caster.id, abilityId: THORNBINDER_ABILITY_ID };
        damageEnemiesInCircle({
            engine: eng,
            caster,
            center: pos,
            radius,
            damage,
            abilityId: THORNBINDER_ABILITY_ID,
            attackType: 'melee',
            onHit: (unit) => {
                tryDamageOrBlock(unit, {
                    engine: eng,
                    gameTime: eng.gameTime,
                    eventBus: eng.eventBus,
                    attackerX: pos.x,
                    attackerY: pos.y,
                    attackerId: caster.id,
                    abilityId: THORNBINDER_ABILITY_ID,
                    damage,
                    attackType: 'melee',
                });
                // Away from the impact point, mirroring Thorn Stomp's radially-outward knockback.
                tryApplyKnockbackByTier(unit, KNOCKBACK_TIER, knockbackSource, pos.x, pos.y, knockbackCtx);
            },
        });

        // Thorns last roughly two rounds (unless a cell deals damage and destroys itself).
        const baseExpiresAt =
            eng.gameTime + DARK_THORN_DURATION_ROUNDS * ROUND_DURATION - BRAMBLE_CLEAR_BEFORE_NEXT_SEC;
        placeJitteredGroundThorns({
            engine: eng,
            caster,
            center: pos,
            radius,
            effectType: 'dark_thorn',
            placedAtGameTime: eng.gameTime,
            baseExpiresAtGameTime: baseExpiresAt,
            durationJitterInSeconds: DURATION_JITTER_IN_SECONDS,
            ownerAbilityId: THORNBINDER_ABILITY_ID,
            params: { slowMult },
            idPrefix: `bramble-${caster.id}-${eng.gameTime}`,
        });

        eng.addEffect(new Effect({
            x: pos.x,
            y: pos.y,
            duration: 0.6,
            effectType: 'BrambleExplosion',
            effectRadius: radius,
        }));
    },
    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},

    // Pre-launch only: the arcing trajectory line while winding up. Stays caster-driven since
    // there's no projectile yet — if the caster is interrupted/killed during windup, the cast
    // never fires and there's nothing to preserve.
    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed >= LOCK_TIME) return;

        const target = getPixelTargetPosition(activeAbility.targets, 0);
        if (!target) return;

        const lineFadeT = elapsed / LOCK_TIME;
        const dx = target.x - caster.x;
        const dy = target.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const arcH = Math.min(dist * 0.4, 100);
        const ctrlX = (caster.x + target.x) / 2;
        const ctrlY = (caster.y + target.y) / 2 - arcH;
        const SEGS = 16;
        for (let i = 0; i <= SEGS; i++) {
            const t = i / SEGS;
            const mt = 1 - t;
            const bx = mt * mt * caster.x + 2 * mt * t * ctrlX + t * t * target.x;
            const by = mt * mt * caster.y + 2 * mt * t * ctrlY + t * t * target.y;
            if (i === 0) gr.moveTo(bx, by);
            else gr.lineTo(bx, by);
        }
        gr.stroke({ color: 0xef4444, width: 2, alpha: 0.25 + 0.45 * lineFadeT });

        // Impact-radius ring at the landing spot, fading in over the windup — mirrors the
        // projectile-driven ring below so the danger zone is visible before launch too.
        gr.circle(target.x, target.y, BASE_RADIUS);
        gr.stroke({ color: 0xef4444, width: 2, alpha: 0.25 + 0.55 * lineFadeT });
    },

    // Post-launch: the impact-radius ring, driven by the projectile itself so it keeps
    // rendering (and lands in sync with the real impact) even if the caster is interrupted or
    // killed while the projectile is still in flight.
    projectileRendersActivePreview: true,
    renderProjectilePreview(gr: IAbilityPreviewGraphics, projectile: unknown, _gameTime: number): void {
        const proj = projectile as Projectile;
        const speed = Math.hypot(proj.velocityX, proj.velocityY);
        if (speed <= 0 || proj.maxDistance <= 0) return;

        // The projectile only knows its current position, not its landing spot — project it
        // forward along its (straight-line, constant-velocity) travel direction by the
        // remaining distance to reconstruct the target.
        const remaining = proj.maxDistance - proj.distanceTraveled;
        const targetX = proj.x + (proj.velocityX / speed) * remaining;
        const targetY = proj.y + (proj.velocityY / speed) * remaining;
        const progress = Math.min(1, proj.distanceTraveled / proj.maxDistance);

        // Outer boundary circle: shows full impact radius, brightens as impact nears
        const borderAlpha = 0.25 + 0.55 * progress;
        gr.circle(targetX, targetY, BASE_RADIUS);
        gr.stroke({ color: 0xef4444, width: 2, alpha: borderAlpha });

        // Expanding inner ring: grows from 0 to BASE_RADIUS as the projectile closes in
        const ringRadius = progress * BASE_RADIUS;
        if (ringRadius > 2) {
            gr.circle(targetX, targetY, ringRadius);
            gr.stroke({ color: 0xfca5a5, width: 3, alpha: 0.45 + 0.45 * progress });
        }
    },
};

export const ThornbinderBrambleCard: CardDef = {
    abilityId: THORNBINDER_ABILITY_ID,
};

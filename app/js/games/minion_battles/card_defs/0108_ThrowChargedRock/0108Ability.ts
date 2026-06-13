import type {
    AbilityRecoveryRule,
    AbilityStatic,
    AttackBlockedInfo,
} from '../../abilities/Ability';
import { getAbilityModifier } from '../../abilities/abilityModifierHelpers';
import type { TargetDef } from '../../abilities/targeting';
import { clampToMaxRange, drawClampedLine, drawCrosshair } from '../../abilities/previewHelpers';
import type { Unit } from '../../game/units/Unit';
import { Effect } from '../../game/effects/Effect';
import { createCrystalLightEffect, deactivateProjectileOnBlock } from '../../abilities/effectHelpers';
import { areEnemies } from '../../game/teams';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { getModifiedAbilityDamage } from '../../abilities/damageModifiers';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../../crowdControl/knockbackKeywords';
import { type CardDef } from '../types';
import {
    beginThrowCastPayload,
    buildMoreRockTimings,
    buildThrowBaseTimings,
    getCrystalRocksResearch,
    hasMorePowerResearch,
    hasMoreRockResearch,
    ONE_PIXEL_TARGET,
    THROW_PROJECTILE_SPEED,
    THROW_RANGE,
    throwMovementPenaltyStates,
    throwMovementPenaltyStatesForActive,
    TWO_PIXEL_TARGETS,
} from '../throwSharedTimings';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';
import type { LightSource } from '../../game/lightSources/LightSource';

const THROW_CHARGED_ROCK_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 4 L32 12 L36 24 L28 36 L12 34 L4 20 Z" fill="#6b6b6b" stroke="#5a5a5a" stroke-width="1"/>
  <path d="M12 14 L20 10 L28 16 L30 26 L22 32 L12 28 Z" fill="#7a7a7a"/>
  <path d="M16 20 L24 16 L26 24 L18 28 Z" fill="#525252"/>
  <path d="M9 11 L14 9 L12 15 L17 13 L15 19" fill="none" stroke="#8ef9ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M22 8 L27 6 L24 12 L30 10 L26 18" fill="none" stroke="#8ef9ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M10 27 L15 25 L13 31 L18 29 L15 35" fill="none" stroke="#8ef9ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const CARD_ID = 'throw_charged_rock';
const MAX_USES = 3;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'lightCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const BASE_EXPLOSION_RADIUS = 50;
const BASE_EXPLOSION_DAMAGE = 5;
const BASE_MAX_TARGETS = 3;
const DIRECT_HIT_DAMAGE = 5;

const MORE_ROCK_EXPLOSION_RADIUS_MULT = 0.75;
const MORE_ROCK_EXPLOSION_DAMAGE = 3;

const MORE_POWER_EXPLOSION_DAMAGE = 8;
const MORE_POWER_MAX_TARGETS = 4;

const KNOCKBACK_TIER = 1;
const PREVIEW_TEAL = 0x2dd4bf;

const ENTOMBED_OPTS = {
    cancelIntervalId: 'active',
    cooldownIntervalId: 'cooldown',
    lingerIdPrefix: 'active',
} as const;

const ENTOMBED_MORE_ROCK_OPTS = {
    cancelIntervalId: 'active_2',
    cooldownIntervalId: 'cooldown',
    lingerIdPrefix: 'active_2',
} as const;

function getExplosionRadiusForResearch(research: Set<string>): number {
    return hasMoreRockResearch(research) ? BASE_EXPLOSION_RADIUS * MORE_ROCK_EXPLOSION_RADIUS_MULT : BASE_EXPLOSION_RADIUS;
}

function resolveDirectHitDamage(ctx: import('../../abilities/castBehaviourTypes').CastBehaviourSetupContext): number {
    const mod = ctx.caster.abilityModifiers[CARD_ID] ?? {};
    return DIRECT_HIT_DAMAGE + (mod.damageFlat ?? 0);
}

function chargedRockLaunchBehaviour() {
    return CastBehaviours.ProjectileLaunch()
        .withSpeed(THROW_PROJECTILE_SPEED)
        .withMaxRange(THROW_RANGE)
        .withProjectileType('charged_rock')
        .withResolveDamage(resolveDirectHitDamage);
}

const THROW_CHARGED_ROCK_BASE_TIMINGS = buildThrowBaseTimings({
    launchBehaviour: chargedRockLaunchBehaviour(),
    entombed: ENTOMBED_OPTS,
});

const THROW_CHARGED_ROCK_MORE_ROCK_TIMINGS = buildMoreRockTimings({
    launchBehaviour: chargedRockLaunchBehaviour(),
    entombed: ENTOMBED_MORE_ROCK_OPTS,
});

export const ThrowChargedRock: AbilityStatic = {
    id: CARD_ID,
    name: 'Throw Charged Rock',
    image: THROW_CHARGED_ROCK_IMAGE,
    tags: ['RockThrow'],
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: 0.3,
    abilityTimings: THROW_CHARGED_ROCK_BASE_TIMINGS,
    getAbilityTimings(caster, gameState) {
        const research = getCrystalRocksResearch(gameState as AbilityEngineContext | undefined, caster);
        return hasMoreRockResearch(research) ? THROW_CHARGED_ROCK_MORE_ROCK_TIMINGS : THROW_CHARGED_ROCK_BASE_TIMINGS;
    },
    targets: TWO_PIXEL_TARGETS,
    keywords: {
        nestedCard: {
            fallbackAbilityId: 'throw_rock',
        },
    },
    getTargets(caster?: Unit, gameState?: unknown): TargetDef[] {
        const research = getCrystalRocksResearch(gameState as AbilityEngineContext | undefined, caster);
        return hasMoreRockResearch(research) ? TWO_PIXEL_TARGETS : ONE_PIXEL_TARGET;
    },
    aiSettings: { minRange: 0, maxRange: THROW_RANGE },

    getTooltipText(gameState?: unknown): string[] {
        const eng = gameState as AbilityEngineContext | undefined;
        const research = getCrystalRocksResearch(eng);
        const hasMoreRock = hasMoreRockResearch(research);
        const hasMorePower = hasMorePowerResearch(research);
        const targets = hasMoreRock ? 2 : 1;
        let explosionDamage = hasMoreRock ? MORE_ROCK_EXPLOSION_DAMAGE : BASE_EXPLOSION_DAMAGE;
        let maxTargets = BASE_MAX_TARGETS;

        let firstLine = '';
        if (hasMorePower) {
            explosionDamage = MORE_POWER_EXPLOSION_DAMAGE;
            maxTargets = MORE_POWER_MAX_TARGETS;
        }

        const mod = getAbilityModifier(gameState, undefined, CARD_ID);
        const directHit = DIRECT_HIT_DAMAGE + (mod.damageFlat ?? 0);
        explosionDamage += mod.explosionDamageFlat ?? 0;

        if (hasMorePower || !hasMoreRock) {
            firstLine = `Throw a rock dealing {${directHit}} damage.`;
        } else {
            firstLine = `Throws {${targets}} rocks dealing {${directHit}} damage.`;
        }
        return [
            firstLine,
            `Explodes, dealing {${explosionDamage}} to up to {${maxTargets}} enemies.`,
            'Exhaust into {Throw Rock}',
        ];
    },

    beginActiveCast(engine, caster, _targets, active) {
        const research = getCrystalRocksResearch(engine as AbilityEngineContext, caster);
        active.castPayload = beginThrowCastPayload(hasMoreRockResearch(research));
    },

    getAbilityStatesForActive(currentTime, active) {
        return throwMovementPenaltyStatesForActive(currentTime, active);
    },

    getAbilityStates(currentTime) {
        return throwMovementPenaltyStates(currentTime);
    },

    onAttackBlocked(_engine, _defender, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },

    onProjectileExpired(engine, caster, projectile, _hitUnitId?: string): void {
        const eng = engine as AbilityEngineContext;
        const proj = projectile as { x: number; y: number };
        const sourceUnit = eng.getUnit(caster.id);
        if (!sourceUnit) return;

        const research = getCrystalRocksResearch(eng, sourceUnit);
        const hasMoreRock = hasMoreRockResearch(research);
        const hasMorePower = hasMorePowerResearch(research);

        const explosionRadius = getExplosionRadiusForResearch(research);
        let explosionDamage = hasMoreRock ? MORE_ROCK_EXPLOSION_DAMAGE : BASE_EXPLOSION_DAMAGE;
        let maxTargets = BASE_MAX_TARGETS;
        if (hasMorePower) {
            explosionDamage = MORE_POWER_EXPLOSION_DAMAGE;
            maxTargets = MORE_POWER_MAX_TARGETS;
        }
        const mod = sourceUnit.abilityModifiers[CARD_ID] ?? {};
        explosionDamage += mod.explosionDamageFlat ?? 0;

        eng.addEffect(
            new Effect({
                x: proj.x,
                y: proj.y,
                duration: 0.25,
                effectType: 'ChargedRockExplosion',
                effectRadius: explosionRadius,
            }),
        );

        (eng as AbilityEngineContext & { addLightSource(ls: LightSource): void }).addLightSource(
            createCrystalLightEffect(proj.x, proj.y, {
                color: PREVIEW_TEAL,
                radius: 2,
                decayInterval: 0.08,
            }),
        );

        const units = (eng.units ?? [])
            .filter((u) => u.isAlive() && areEnemies(sourceUnit.teamId, u.teamId))
            .map((u) => ({ unit: u, dist: Math.hypot(u.x - proj.x, u.y - proj.y) }))
            .filter((entry) => entry.dist <= explosionRadius + entry.unit.radius)
            .sort((a, b) => a.dist - b.dist)
            .slice(0, maxTargets)
            .map((entry) => entry.unit);

        for (const unit of units) {
            const modifiedDamage = getModifiedAbilityDamage(sourceUnit, explosionDamage);
            unit.takeDamage(modifiedDamage, sourceUnit.id, eng.eventBus);
            tryApplyKnockbackByTier(
                unit,
                KNOCKBACK_TIER,
                { unitId: sourceUnit.id, abilityId: CARD_ID },
                proj.x,
                proj.y,
                knockbackCtxFromEngine(eng),
            );
        }
    },

    renderTargetingPreview(gr, caster, _currentTargets, mouseWorld, _units, gameState): void {
        gr.clear();
        const target = mouseWorld;
        if (!target) return;
        const research = getCrystalRocksResearch(gameState as AbilityEngineContext | undefined, caster);
        const explosionRadius = getExplosionRadiusForResearch(research);
        const clamped = clampToMaxRange(caster, target, THROW_RANGE);
        const impactX = clamped.endX;
        const impactY = clamped.endY;

        drawClampedLine(gr, caster, target, THROW_RANGE, { color: 0x8ef9ff, width: 2, alpha: 0.7 });
        gr.circle(impactX, impactY, explosionRadius);
        gr.fill({ color: PREVIEW_TEAL, alpha: 0.15 });
        gr.circle(impactX, impactY, explosionRadius);
        gr.stroke({ color: PREVIEW_TEAL, width: 2, alpha: 0.5 });
    },

    renderTargetingPreviewSelectedTargets(gr, caster, currentTargets, _mouseWorld, _units, gameState): void {
        const research = getCrystalRocksResearch(gameState as AbilityEngineContext | undefined, caster);
        const explosionRadius = getExplosionRadiusForResearch(research);

        for (const t of currentTargets) {
            if (t.type === 'pixel' && t.position) {
                const clamped = clampToMaxRange(caster, t.position, THROW_RANGE);
                drawCrosshair(gr, clamped.endX, clamped.endY, 10, { color: 0x8ef9ff, width: 2, alpha: 0.95 });
                gr.circle(clamped.endX, clamped.endY, explosionRadius);
                gr.fill({ color: PREVIEW_TEAL, alpha: 0.1 });
                gr.circle(clamped.endX, clamped.endY, explosionRadius);
                gr.stroke({ color: PREVIEW_TEAL, width: 2, alpha: 0.45 });
            }
        }
    },
};

export const ThrowChargedRockCard: CardDef = {
    abilityId: 'throw_charged_rock',
};

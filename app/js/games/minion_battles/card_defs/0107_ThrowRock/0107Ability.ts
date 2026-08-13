/**
 * ThrowRock - A basic ranged ability, and the shared base for its Earth Core variant.
 *
 * Targets a pixel. After windup, creates a projectile that travels up to 200px toward
 * the target. Base 5 damage on hit; **More Power** research increases damage. **More Rock**
 * (crystal_rocks tree) adds a second target and throw on a longer timeline. `buildThrowRockAbility`
 * is reused by Earth Core Throw Rock (0535) with a rock-resource cost instead of stamina uses.
 */

import type { AbilityRecoveryRule, AbilityStatic, AbilityTag, AttackBlockedInfo, ResourceCost } from '../../abilities/Ability';
import { getAbilityModifier, resolveTooltipContext } from '../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../abilities/tooltipTokens';
import type { TargetDef } from '../../abilities/targeting';
import { clampToMaxRange, drawClampedLine, drawCrosshair } from '../../abilities/previewHelpers';
import type { Unit } from '../../game/units/Unit';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { deactivateProjectileOnBlock } from '../../abilities/effectHelpers';
import { isSinglePlayerBattle } from '../../abilities/singlePlayerBattle';
import { buildTagDescriptionLines } from '../../abilities/abilityTagCatalog';
import { type CardDef } from '../types';
import {
    beginThrowCastPayload,
    buildMoreRockTimings,
    buildThrowBaseTimings,
    getCrystalRocksResearch,
    hasMoreRockResearch,
    ONE_PIXEL_TARGET,
    THROW_PROJECTILE_SPEED,
    THROW_RANGE,
    throwMovementPenaltyStates,
    throwMovementPenaltyStatesForActive,
    TWO_PIXEL_TARGETS,
} from '../throwSharedTimings';

const MAX_USES = 6;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
export const THROW_ROCK_BASE_DAMAGE = 5;
const BASE_DAMAGE = THROW_ROCK_BASE_DAMAGE;
/** Matches More Power bump used on Throw Charged Rock explosion damage. */
export const THROW_ROCK_MORE_POWER_DAMAGE = 8;
const MORE_POWER_DAMAGE = THROW_ROCK_MORE_POWER_DAMAGE;
const MORE_ROCK_HIT_COUNT = 2;

/** Default dark wolf HP at ×1 enemy scaling — two hits at this damage kill a wolf. */
const TWO_SHOT_WOLF_PER_HIT_DAMAGE = 6;

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

function rockDamageForResearch(research: Set<string>): number {
    return research.has('more_power') ? MORE_POWER_DAMAGE : BASE_DAMAGE;
}

function resolveRockProjectileDamage(
    abilityId: string,
    ctx: import('../../abilities/castBehaviourTypes').CastBehaviourSetupContext,
): number {
    const research = getCrystalRocksResearch(ctx.engine, ctx.caster);
    let damage = rockDamageForResearch(research);
    if (isSinglePlayerBattle(ctx.engine)) {
        damage = Math.max(damage, TWO_SHOT_WOLF_PER_HIT_DAMAGE);
    }
    const mod = ctx.caster.abilityModifiers[abilityId] ?? {};
    return damage + (mod.damageFlat ?? 0);
}

function rockLaunchBehaviour(abilityId: string) {
    return CastBehaviours.ProjectileLaunch()
        .withSpeed(THROW_PROJECTILE_SPEED)
        .withMaxRange(THROW_RANGE)
        .withTravelFullRange()
        .withResolveDamage((ctx) => resolveRockProjectileDamage(abilityId, ctx))
        .withSpriteConfig({
            sprite: { file: 'images/projectiles/rock_spin.png', frames: 4, frameDirection: 'row', fps: 8 },
            loop: true,
            trail: { effectType: 'BulletTrail' },
            animations: [{ type: 'rotation', mode: 'constant', degreesPerSecond: 180 }],
        });
}

const THROW_ROCK_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 4 L32 12 L36 24 L28 36 L12 34 L4 20 Z" fill="#6b6b6b" stroke="#5a5a5a" stroke-width="1"/>
  <path d="M12 14 L20 10 L28 16 L30 26 L22 32 L12 28 Z" fill="#7a7a7a"/>
  <path d="M16 20 L24 16 L26 24 L18 28 Z" fill="#525252"/>
</svg>`;

export interface ThrowRockVariantConfig {
    id: string;
    name: string;
    tags: readonly AbilityTag[];
    resourceCost: ResourceCost | null;
    maxUses: number;
    recoveries?: readonly AbilityRecoveryRule[];
}

/**
 * Builds a Throw Rock ability variant. Only `id`/`name`/`tags`/`resourceCost`/`maxUses`/
 * `recoveries` differ between variants (e.g. stamina-gated Throw Rock vs rock-resource-gated
 * Earth Core Throw Rock) — targeting, timings, damage, and tooltip logic are fully shared.
 */
export function buildThrowRockAbility(config: ThrowRockVariantConfig): AbilityStatic & { range: number } {
    const { id, name, tags, resourceCost, maxUses, recoveries } = config;

    const baseTimings = buildThrowBaseTimings({
        launchBehaviour: rockLaunchBehaviour(id),
        entombed: ENTOMBED_OPTS,
    });

    return {
        id,
        name,
        range: THROW_RANGE,
        image: THROW_ROCK_IMAGE,
        tags,
        resourceCost,
        rechargeTurns: 1,
        maxUses,
        recoveries: recoveries ?? RECOVERIES,
        prefireTime: 0.3,
        abilityTimings: baseTimings,
        getAbilityTimings(caster, gameState) {
            const research = getCrystalRocksResearch(gameState as import('../../abilities/AbilityEngineContext').AbilityEngineContext | undefined, caster);
            const mod = getAbilityModifier(gameState, caster, id);
            const comboCancelPhase = (mod.comboMax ?? 0) > 0 ? AbilityPhase.Cooldown : undefined;
            const opts = { comboCancelPhase };
            return hasMoreRockResearch(research)
                ? buildMoreRockTimings({
                    launchBehaviour: rockLaunchBehaviour(id),
                    entombed: ENTOMBED_MORE_ROCK_OPTS,
                    ...opts,
                })
                : buildThrowBaseTimings({
                    launchBehaviour: rockLaunchBehaviour(id),
                    entombed: ENTOMBED_OPTS,
                    ...opts,
                });
        },
        targets: TWO_PIXEL_TARGETS,
        getTargets(caster?: Unit, gameState?: unknown): TargetDef[] {
            const research = getCrystalRocksResearch(gameState as import('../../abilities/AbilityEngineContext').AbilityEngineContext | undefined, caster);
            return hasMoreRockResearch(research) ? TWO_PIXEL_TARGETS : ONE_PIXEL_TARGET;
        },
        aiSettings: { minRange: 0, maxRange: THROW_RANGE },

        getTooltipText(gameState?: unknown): string[] {
            const eng = gameState as import('../../abilities/AbilityEngineContext').AbilityEngineContext | undefined;
            const research = getCrystalRocksResearch(eng);
            const hasMoreRock = hasMoreRockResearch(research);
            const mod = getAbilityModifier(gameState, undefined, id);
            const damageBase = rockDamageForResearch(research) + (mod.damageFlat ?? 0);
            const lines = formatTooltipLegacyLines(
                hasMoreRock
                    ? ['Throws {{HIT_COUNT}} rocks dealing {{DAMAGE}} damage each to the first enemy hit']
                    : ['Throws a rock dealing {{DAMAGE}} damage to the first enemy hit'],
                {
                    DAMAGE: { kind: 'damage', base: damageBase },
                    HIT_COUNT: { kind: 'plain', value: MORE_ROCK_HIT_COUNT },
                } satisfies TooltipTokenBindings,
                resolveTooltipContext(gameState, { ability: { id } }),
            );

            const activeTags: string[] = [...tags];
            if (mod.addTags) activeTags.push(...mod.addTags);
            if ((mod.comboMax ?? 0) > 0) activeTags.push('Combo');
            const magnitudes = (mod.comboMax ?? 0) > 0 ? { Combo: mod.comboMax! } : undefined;
            return [...lines, ...buildTagDescriptionLines(activeTags, magnitudes)];
        },

        beginActiveCast(engine, caster, _targets, active) {
            const research = getCrystalRocksResearch(engine as import('../../abilities/AbilityEngineContext').AbilityEngineContext | undefined, caster);
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

        renderTargetingPreviewSelectedTargets(gr, caster, currentTargets, mouseWorld, _units, gameState): void {
            const research = getCrystalRocksResearch(gameState as import('../../abilities/AbilityEngineContext').AbilityEngineContext | undefined, caster);
            if (!hasMoreRockResearch(research)) {
                drawClampedLine(gr, caster, mouseWorld, THROW_RANGE);
                return;
            }

            drawClampedLine(gr, caster, mouseWorld, THROW_RANGE, { color: 0xc0c0c0, width: 2, alpha: 0.7 });
            const clamped = clampToMaxRange(caster, mouseWorld, THROW_RANGE);
            drawCrosshair(gr, clamped.endX, clamped.endY, 10, { color: 0xc0c0c0, width: 2, alpha: 0.95 });

            if (currentTargets.length >= 1) {
                const first = currentTargets[0];
                if (first?.type === 'pixel' && first.position) {
                    const c = clampToMaxRange(caster, first.position, THROW_RANGE);
                    gr.moveTo(caster.x, caster.y);
                    gr.lineTo(c.endX, c.endY);
                    gr.stroke({ color: 0xc0c0c0, width: 2, alpha: 0.35 });
                    drawCrosshair(gr, c.endX, c.endY, 10, { color: 0xc0c0c0, width: 2, alpha: 0.95 });
                }
            }
        },
    };
}

export const ThrowRock = buildThrowRockAbility({
    id: 'throw_rock',
    name: 'Throw Rock',
    tags: ['RockThrow'],
    resourceCost: null,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
});

export const ThrowRockCard: CardDef = {
    abilityId: 'throw_rock',
};

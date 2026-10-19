/**
 * Blood Shard — the caster flicks a diamond-shaped shard of their own blood at a target point,
 * striking the first enemy in its path. It is the Blood Mage's cheap, snappy poke: a small HP
 * price, two uses per round, and a quicker windup and faster flight than Throw Rock / Throw
 * Knife, so the mage can chip at enemies between the slower, riskier Mend / Burst / Protect casts.
 */

import type { AbilityRecoveryRule, AttackBlockedInfo } from '../../../abilities/Ability';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { payHpCostBehaviour } from '../../../abilities/hpCost';
import { clampToMaxRange, drawClampedLine } from '../../../abilities/previewHelpers';
import { hasResearchNode, resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import {
    spawnBloodMistImpactFlash,
    spawnBloodMistWindupBurst,
    bloodMistVariantColor,
} from '../../../abilities/bloodMageVfx';
import { BLOOD_MIST_IMPACT_EFFECT_TYPE } from '../../../game/effect_defs/bloodMageEffects';
import type { EngineContext } from '../../../game/EngineContext';
import { areEnemies } from '../../../game/teams';
import type { Unit } from '../../../game/units/Unit';
import { consumeBleedStacks, isBleeding } from '../../../buffs/bleedRuntime';
import { BLOOD_MAGE_NODE_SPLINTERS, BLOOD_MAGE_TREE_ID } from '../../../../../researchTrees/trees/blood_mage';
import {
    buildThrowBaseTimings,
    ONE_PIXEL_TARGET,
    QUICK_THROW_PROFILE,
    THROW_PROJECTILE_SPEED,
    THROW_RANGE,
    throwMovementPenaltyStates,
} from '../../throwSharedTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Mage)}04`;

export const BLOOD_SHARD_DAMAGE = 10;
export const BLOOD_SHARD_HP_COST = 2;
export const BLOOD_SHARD_MAX_USES = 2;
export const BLOOD_SHARD_RANGE = THROW_RANGE;
/** A third faster than thrown rocks and knives. */
export const BLOOD_SHARD_PROJECTILE_SPEED = THROW_PROJECTILE_SPEED * (4 / 3);
export const BLOOD_SHARD_PROFILE = QUICK_THROW_PROFILE;
/** Blood Splinters (research): damage a splinter deals to the bleeding enemy it bursts out of. */
export const BLOOD_SPLINTER_HOST_DAMAGE = 4;
/** Blood Splinters: damage a splinter's flight deals to the first other enemy it hits. */
export const BLOOD_SPLINTER_FLIGHT_DAMAGE = 4;
/** Blood Splinters: bleed stacks each splinter consumes from its host (fewer are all consumed). */
export const BLOOD_SPLINTER_BLEED_CONSUMED = 4;
const SPLINTER_PREVIEW_COLOR = 0xb91c1c;
const IMPACT_DURATION = 0.25;
const WINDUP_MIST_DURATION = BLOOD_SHARD_PROFILE.windupEnd + 0.1;
const PREVIEW_COLOR = 0xdc2626;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: BLOOD_SHARD_MAX_USES },
];

const BLOOD_SHARD_PROJECTILE_URL = new URL('../../../assets/projectiles/blood_shard.svg', import.meta.url).href;

const BLOOD_SHARD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bloodShardCardMist" cx="0.5" cy="0.55" r="0.6">
      <stop offset="0%" stop-color="#7f1d1d" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#1a0508" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bloodShardCardBody" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fca5a5"/>
      <stop offset="45%" stop-color="#dc2626"/>
      <stop offset="100%" stop-color="#450a0a"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="34" r="28" fill="url(#bloodShardCardMist)"/>
  <polygon points="44,10 50,26 26,52 20,40" fill="url(#bloodShardCardBody)" stroke="#1a0508" stroke-width="1.5"/>
  <polygon points="44,12 47,24 40,26" fill="#fecaca" opacity="0.6"/>
  <circle cx="16" cy="50" r="2.5" fill="#b91c1c"/>
  <circle cx="11" cy="56" r="1.5" fill="#7f1d1d"/>
</svg>`;

/**
 * Enemies of `caster` that are bleeding and within Blood Shard's range of it: the units a Blood
 * Splinters shard bursts out of. Sorted by distance then id, so runtime and previews agree.
 */
export function findBloodSplinterHosts(caster: Unit, units: readonly Unit[]): Unit[] {
    const distTo = (u: Unit) => Math.hypot(u.x - caster.x, u.y - caster.y);
    return units
        .filter(
            (u) =>
                u.isAlive()
                && areEnemies(caster.teamId, u.teamId)
                && isBleeding(u)
                && distTo(u) <= BLOOD_SHARD_RANGE + u.radius,
        )
        // Plain id comparison (not localeCompare) so every client orders ties identically.
        .sort((a, b) => distTo(a) - distTo(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface BloodSplinterPreviewSegment {
    host: Unit;
    from: { x: number; y: number };
    /** The aim point clamped to `BLOOD_SHARD_RANGE` from the host (where the splinter would stop). */
    to: { x: number; y: number };
}

/** Per-host host -> aim segments for the Blood Splinters preview (same maths as the runtime flight). */
export function getBloodSplinterPreviewSegments(
    caster: Unit,
    aim: { x: number; y: number },
    units: readonly Unit[],
): BloodSplinterPreviewSegment[] {
    return findBloodSplinterHosts(caster, units).map((host) => {
        const clamped = clampToMaxRange(host, aim, BLOOD_SHARD_RANGE);
        return { host, from: { x: host.x, y: host.y }, to: { x: clamped.endX, y: clamped.endY } };
    });
}

function bloodShardSprite() {
    return {
        sprite: { frameFiles: [BLOOD_SHARD_PROJECTILE_URL] },
        loop: false,
        animations: [{ type: 'rotation' as const, mode: 'velocity-facing' as const }],
    };
}

const shardLaunch = CastBehaviours.ProjectileLaunch()
    .withSpeed(BLOOD_SHARD_PROJECTILE_SPEED)
    .withMaxRange(BLOOD_SHARD_RANGE)
    .withBaseDamage(BLOOD_SHARD_DAMAGE)
    .withSpriteConfig(bloodShardSprite());

/**
 * Blood Splinters: a shard bursts out of every bleeding enemy in range. Each hits its host, eats
 * some of its bleed, then flies toward the target and hits the first other enemy.
 */
const splinterLaunch = CastBehaviours.ProjectileLaunch()
    .withSpeed(BLOOD_SHARD_PROJECTILE_SPEED)
    .withMaxRange(BLOOD_SHARD_RANGE)
    .withBaseDamage(BLOOD_SPLINTER_FLIGHT_DAMAGE)
    .withSpriteConfig(bloodShardSprite())
    .withEmergeFrom(
        (ctx) => findBloodSplinterHosts(ctx.caster, ctx.engine.units),
        (ctx, host) => {
            const eng = ctx.engine as unknown as EngineContext;
            tryDamageOrBlock(host, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: ctx.caster.x,
                attackerY: ctx.caster.y,
                attackerId: ctx.caster.id,
                abilityId: CARD_ID,
                damage: BLOOD_SPLINTER_HOST_DAMAGE,
                attackType: 'ranged' as 'melee' | 'charging',
            });
            consumeBleedStacks(host, BLOOD_SPLINTER_BLEED_CONSUMED);
            spawnBloodMistImpactFlash(eng, host, { variant: 'shard' });
        },
    );

function hasSplinters(engine: AbilityEngineContext | undefined, caster: Unit | undefined): boolean {
    return hasResearchNode(engine, caster, BLOOD_MAGE_TREE_ID, BLOOD_MAGE_NODE_SPLINTERS);
}

function buildBloodShardTimings(withSplinters: boolean) {
    return buildThrowBaseTimings({
        profile: BLOOD_SHARD_PROFILE,
        launchBehaviour: shardLaunch,
        windupBehaviours: [
            CastBehaviours.Instant((ctx) => {
                spawnBloodMistWindupBurst(ctx.engine as EngineContext, ctx.caster, {
                    variant: 'shard',
                    duration: WINDUP_MIST_DURATION,
                    radius: ctx.caster.radius + 8,
                });
            }),
        ],
        // Paid at release (the doNotRefund frame), so a cast cancelled during windup is free.
        // Splinters fire on the same frame as the main shard.
        releaseBehaviours: [payHpCostBehaviour(BLOOD_SHARD_HP_COST), ...(withSplinters ? [splinterLaunch] : [])],
        onProjectileHit: [
            {
                type: 'effect',
                effectType: BLOOD_MIST_IMPACT_EFFECT_TYPE,
                effectData: { variant: 'shard', color: bloodMistVariantColor('shard') },
                duration: IMPACT_DURATION,
                position: 'target',
            },
        ],
        windupLabel: 'Startup',
        activeLabel: 'Fling',
    });
}

const TOOLTIP_LINES = [
    'Fling a shard of your own blood, dealing {{DAMAGE}} damage to the first enemy hit.',
    'Costs {{HP_COST}} HP to cast.',
] as const;

const SPLINTER_TOOLTIP_LINE =
    'Each bleeding enemy in range bursts a shard: {{SPLINTER_HOST_DAMAGE}} damage to it, consumes up to {{SPLINTER_BLEED}} bleeding stacks, then flies at the target for {{SPLINTER_FLIGHT_DAMAGE}} damage.';

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: BLOOD_SHARD_DAMAGE },
    HP_COST: { kind: 'plain', value: BLOOD_SHARD_HP_COST },
    SPLINTER_HOST_DAMAGE: { kind: 'damage', base: BLOOD_SPLINTER_HOST_DAMAGE },
    SPLINTER_FLIGHT_DAMAGE: { kind: 'damage', base: BLOOD_SPLINTER_FLIGHT_DAMAGE },
    SPLINTER_BLEED: { kind: 'plain', value: BLOOD_SPLINTER_BLEED_CONSUMED },
};

export const BloodShardAbility_0304 = defineAbility({
    id: CARD_ID,
    name: 'Blood Shard',
    image: BLOOD_SHARD_IMAGE,
    resourceCost: null,
    hpCost: BLOOD_SHARD_HP_COST,
    // No hpCostGate override — default 'requireSurplus' (must have hp > HP_COST to cast).
    rechargeTurns: 1,
    maxUses: BLOOD_SHARD_MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: BLOOD_SHARD_PROFILE.prefireTime,
    aiSettings: { minRange: 0, maxRange: BLOOD_SHARD_RANGE },
    abilityTimings: buildBloodShardTimings(false),
    getAbilityTimings(caster, gameState) {
        return buildBloodShardTimings(hasSplinters(gameState as AbilityEngineContext | undefined, caster));
    },
    targets: ONE_PIXEL_TARGET,

    getAbilityStates(currentTime) {
        return throwMovementPenaltyStates(currentTime, BLOOD_SHARD_PROFILE);
    },

    onAttackBlocked(_engine, _defender, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },

    renderTargetingPreviewSelectedTargets(gr, caster, _currentTargets, mouseWorld, units, gameState): void {
        drawClampedLine(gr, caster, mouseWorld, BLOOD_SHARD_RANGE, { color: PREVIEW_COLOR, width: 2, alpha: 0.75 });
        if (!hasSplinters(gameState as AbilityEngineContext | undefined, caster)) return;
        for (const { host, from, to } of getBloodSplinterPreviewSegments(caster, mouseWorld, units)) {
            gr.circle(host.x, host.y, host.radius + 6);
            gr.stroke({ color: SPLINTER_PREVIEW_COLOR, width: 2, alpha: 0.9 });
            gr.moveTo(from.x, from.y);
            gr.lineTo(to.x, to.y);
            gr.stroke({ color: SPLINTER_PREVIEW_COLOR, width: 1, alpha: 0.6 });
        }
    },

    getTooltipText(gameState?: unknown): string[] {
        const lines: string[] = [...TOOLTIP_LINES];
        if (hasSplinters(gameState as AbilityEngineContext | undefined, undefined)) lines.push(SPLINTER_TOOLTIP_LINE);
        return formatTooltipLegacyLines(
            lines,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },
});

export const BloodShardCard_0304: CardDef = {
    abilityId: CARD_ID,
};

/**
 * Ice Shards — Blood Shard (0304) frozen solid: two quick throws, each at its own target, each shard
 * punching through the first enemy and stopping on the second. The cast costs Water instead of HP.
 * It holds Blood Shard's bar slot while the caster has the Water and a use to pay for it, then hands
 * the slot back. With Blood Splinters researched, each throw also bursts splinters out of bleeding
 * enemies, exactly as Blood Shard does.
 */

import type { AttackBlockedInfo } from '../../../abilities/Ability';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { clampToMaxRange, drawClampedLine, drawCrosshair } from '../../../abilities/previewHelpers';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import type { TargetDef } from '../../../abilities/targeting';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { PROJECTILE_PARTICLE_TRAIL_PRESETS } from '../../../game/effects/projectileParticleTrails';
import { COLLISION_CLASH_EFFECT_TYPE } from '../../../game/effect_defs/impactEffects';
import { ResourceId } from '../../../resources/resourceIds';
import { getThemeById } from '../../../themes/abilityTheme';
import {
    buildMoreRockTimings,
    dualThrowMovementPenaltyStates,
    dualThrowPacing,
    QUICK_THROW_PROFILE,
} from '../../throwSharedTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';
import {
    BLOOD_SHARD_MAX_USES,
    BLOOD_SHARD_PROJECTILE_SPEED,
    BLOOD_SHARD_RANGE,
    BLOOD_SPLINTER_TOOLTIP_BINDINGS,
    BLOOD_SPLINTER_TOOLTIP_LINE,
    BloodShardAbility_0304,
    bloodSplinterLaunch,
    drawBloodSplinterPreview,
    hasBloodSplinters,
} from '../../03_blood_mage/0304_BloodShard/0304Ability';
import iceShardsSvg from './iceShards.svg?raw';

const CARD_ID = `${formatGroupId(AbilityGroupId.Water)}02`;

export const ICE_SHARDS_DAMAGE = 12;
export const ICE_SHARDS_WATER_COST = 4;
/** Each shard passes through this many enemies and stops on the next. */
export const ICE_SHARDS_PIERCE = 1;
/** Same uses (and round refill) as Blood Shard; the swap also needs a use left. */
export const ICE_SHARDS_MAX_USES = BLOOD_SHARD_MAX_USES;
export const ICE_SHARDS_RANGE = BLOOD_SHARD_RANGE;
export const ICE_SHARDS_PROJECTILE_SPEED = BLOOD_SHARD_PROJECTILE_SPEED;
/** Two throws at Blood Shard's quick pace: releases at 0.2 s and 0.5 s, 1.5 s in all. */
export const ICE_SHARDS_PACING = dualThrowPacing(QUICK_THROW_PROFILE);

const WATER = getThemeById('water');
const IMPACT_DURATION = 0.25;
const PREVIEW_COLOR = WATER.secondaryNum;
const SECOND_TARGET_LABEL = 'Second target';

const ICE_SHARD_PROJECTILE_URL = new URL('../../../assets/projectiles/ice_shard.svg', import.meta.url).href;

const TARGETS: TargetDef[] = [
    { type: 'pixel', label: 'Target location' },
    { type: 'pixel', label: SECOND_TARGET_LABEL },
];

const shardLaunch = CastBehaviours.ProjectileLaunch()
    .withSpeed(ICE_SHARDS_PROJECTILE_SPEED)
    .withMaxRange(ICE_SHARDS_RANGE)
    .withBaseDamage(ICE_SHARDS_DAMAGE)
    .withPierce(ICE_SHARDS_PIERCE)
    .withSpriteConfig({
        sprite: { frameFiles: [ICE_SHARD_PROJECTILE_URL] },
        loop: false,
        animations: [{ type: 'rotation', mode: 'velocity-facing' }],
    })
    .withParticleTrail(PROJECTILE_PARTICLE_TRAIL_PRESETS.frost(WATER.id));

function buildIceShardsTimings(withSplinters: boolean) {
    return buildMoreRockTimings({
        pacing: ICE_SHARDS_PACING,
        launchBehaviour: shardLaunch,
        // Splinters fire on each throw's release frame, aimed at that throw's target.
        releaseBehaviours: withSplinters ? [bloodSplinterLaunch] : [],
        onProjectileHit: [
            {
                type: 'effect',
                effectType: COLLISION_CLASH_EFFECT_TYPE,
                effectData: { color: WATER.secondaryNum },
                duration: IMPACT_DURATION,
                position: 'target',
            },
        ],
        secondTargetLabel: SECOND_TARGET_LABEL,
    });
}

const TOOLTIP_LINES = [
    'Throw {{THROWS}} shards of ice, each at its own target, dealing {{DAMAGE}} damage to the first {{HITS}} enemies hit.',
    "Takes Blood Shard's slot while you can pay for it.",
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: ICE_SHARDS_DAMAGE },
    THROWS: { kind: 'plain', value: 2 },
    HITS: { kind: 'plain', value: ICE_SHARDS_PIERCE + 1 },
    ...BLOOD_SPLINTER_TOOLTIP_BINDINGS,
};

export const IceShardsAbility_1502 = defineAbility({
    id: CARD_ID,
    name: 'Ice Shards',
    image: iceShardsSvg,
    flavorText: 'Cold enough to bite, quick enough to bite twice.',
    // Spent as the cast starts; refunded if interrupted before the first throw (its `doNotRefund`).
    resourceCost: { resourceId: ResourceId.Water, amount: ICE_SHARDS_WATER_COST },
    rechargeTurns: 1,
    maxUses: ICE_SHARDS_MAX_USES,
    recoveries: BloodShardAbility_0304.recoveries,
    prefireTime: ICE_SHARDS_PACING.firstThrow,
    aiSettings: { minRange: 0, maxRange: ICE_SHARDS_RANGE },
    abilityTimings: buildIceShardsTimings(false),
    getAbilityTimings(caster, gameState) {
        return buildIceShardsTimings(hasBloodSplinters(gameState as AbilityEngineContext | undefined, caster));
    },
    targets: TARGETS,
    swapConfig: {
        activateTrigger: { type: 'whileCastable' },
        deactivateTrigger: { type: 'whileCastable' },
        replacesAbilityId: BloodShardAbility_0304.id,
    },

    getAbilityStates(currentTime) {
        return dualThrowMovementPenaltyStates(currentTime, ICE_SHARDS_PACING, QUICK_THROW_PROFILE);
    },

    onAttackBlocked(_engine, _defender, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },

    renderTargetingPreviewSelectedTargets(gr, caster, currentTargets, mouseWorld, units, gameState): void {
        drawClampedLine(gr, caster, mouseWorld, ICE_SHARDS_RANGE, { color: PREVIEW_COLOR, width: 2, alpha: 0.75 });
        const first = currentTargets[0];
        if (first?.type === 'pixel' && first.position) {
            const c = clampToMaxRange(caster, first.position, ICE_SHARDS_RANGE);
            gr.moveTo(caster.x, caster.y);
            gr.lineTo(c.endX, c.endY);
            gr.stroke({ color: PREVIEW_COLOR, width: 2, alpha: 0.35 });
            drawCrosshair(gr, c.endX, c.endY, 10, { color: PREVIEW_COLOR, width: 2, alpha: 0.95 });
        }
        drawBloodSplinterPreview(gr, caster, mouseWorld, units, gameState);
    },

    getTooltipText(gameState?: unknown): string[] {
        const lines: string[] = [...TOOLTIP_LINES];
        if (hasBloodSplinters(gameState as AbilityEngineContext | undefined, undefined)) {
            // Blood Shard's own line: it happens on each of the two throws.
            lines.push(BLOOD_SPLINTER_TOOLTIP_LINE);
        }
        return formatTooltipLegacyLines(
            lines,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },
});

export const IceShardsCard_1502: CardDef = {
    abilityId: CARD_ID,
};

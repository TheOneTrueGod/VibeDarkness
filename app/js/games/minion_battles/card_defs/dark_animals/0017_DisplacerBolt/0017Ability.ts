/**
 * DisplacerBolt - Displacer Spirit ranged ability. Aims like the slime's shot (same targeting range,
 * telegraph, and AI range) but hurls a faster bolt that keeps flying to twice that range. A ranged
 * harasser that punishes players who stand just outside slime distance. When the Displacer Spirit
 * casts it, up to three of its clones echo the shot a beat apart; clones' own casts never echo.
 */

import type { AbilityRecoveryRule, AbilityStatic, AttackBlockedInfo } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { TargetDef } from '../../../abilities/targeting';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { Projectile } from '../../../game/projectiles/Projectile';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { hasUnitTag, UnitTag } from '../../../game/units/unitTag';
import { mirrorAbilityToClones, type MirrorEngineLike } from '../../../game/displacer/mirrorToClones';
import { DISPLACER_BOLT_USES_PER_ROUND } from '../../../game/displacer/displacerConstants';
import { type CardDef } from '../../types';
import { DIRECTIONAL_ORB_LOOK } from '../../../game/projectiles/projectile_defs/directionalOrb';
import type { SpriteProjectileConfig } from '../../../game/projectiles/projectile_defs/types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import {
    SlimeShotAbility,
    SLIME_SHOT_MAX_DISTANCE,
    SLIME_SHOT_PROJECTILE_SPEED,
} from '../../0001_SlimeShot/0001Ability';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}17`;
export const DISPLACER_BOLT_ID = CARD_ID;

export const DISPLACER_BOLT_LOCK_TIME = 0.5;
const LOCK_TIME = DISPLACER_BOLT_LOCK_TIME;
export const DISPLACER_BOLT_PREFIRE_TIME = 1.0;
const PREFIRE_TIME = DISPLACER_BOLT_PREFIRE_TIME;
/** Cooldown tail after the shot; with the 1s prefire a cast cycle is 2s, so ~4 bolts fit in a round. */
export const DISPLACER_BOLT_COOLDOWN_SEC = 1.0;
const COOLDOWN_SEC = DISPLACER_BOLT_COOLDOWN_SEC;
/** Bolt damage (shared with Light Eater's ring of bolts). */
export const DISPLACER_BOLT_DAMAGE = 4;
const DAMAGE = DISPLACER_BOLT_DAMAGE;
const MAX_USES = DISPLACER_BOLT_USES_PER_ROUND;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: MAX_USES },
];
export const DISPLACER_BOLT_PROJECTILE_RADIUS = 5;
const PROJECTILE_RADIUS = DISPLACER_BOLT_PROJECTILE_RADIUS;
const PROJECTILE_SCALE = 0.5;

/** Targeting / use / AI range: identical to the slime's. */
export const DISPLACER_BOLT_TARGET_RANGE = SLIME_SHOT_MAX_DISTANCE;
/** Bolt is a bit faster than the slime's glob (1.2x). */
export const DISPLACER_BOLT_SPEED_MULTIPLIER = 1.2;
export const DISPLACER_BOLT_SPEED = SLIME_SHOT_PROJECTILE_SPEED * DISPLACER_BOLT_SPEED_MULTIPLIER;
/** Total flight distance is twice the targeting range. */
export const DISPLACER_BOLT_TRAVEL_DISTANCE = DISPLACER_BOLT_TARGET_RANGE * 2;
/** Projectile "lifetime" in seconds (distance / speed); the projectile expires after this much flight. */
export const DISPLACER_BOLT_LIFETIME_SEC = DISPLACER_BOLT_TRAVEL_DISTANCE / DISPLACER_BOLT_SPEED;

const TOOLTIP_LINES = [
    'Hurls a bolt that flies twice as far as it aims, dealing {{DAMAGE}} damage to an enemy',
    'Up to 3 clones echo the shot in quick succession',
    'Enraged, the spirit uses a faster, more frequent version',
] as const;
const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: DAMAGE },
};

const SPIT_URLS = [1, 2, 3, 4].map(
    (n) => new URL(`../../../assets/projectiles/slime_spit_f${n}.svg`, import.meta.url).href,
);

/** Sprite config shared by the cast bolt and Light Eater's ring bolts. */
/** Slightly translucent spit orb with a lagging rear-edge circle that shows its heading. */
export const DISPLACER_BOLT_SPRITE_CONFIG: SpriteProjectileConfig = {
    sprite: { fps: 8, scale: PROJECTILE_SCALE, frameFiles: SPIT_URLS },
    loop: true,
    ...DIRECTIONAL_ORB_LOOK,
};

/**
 * Spawn one Displacer Bolt projectile directly (no telegraph, no cast, no clone mirroring) heading
 * along the unit vector (dirX, dirY). Identical to what the ProjectileLaunch behaviour builds for
 * the cast bolt: same speed, radius, damage, full-range travel, sprite, and owning ability id, so the
 * ability's `onAttackBlocked` (deactivate on block) applies to it too.
 */
export function spawnDisplacerBoltProjectile(
    engine: Pick<AbilityEngineContext, 'addProjectile'>,
    caster: Unit,
    dirX: number,
    dirY: number,
): Projectile {
    const projectile = new Projectile({
        x: caster.x,
        y: caster.y,
        velocityX: dirX * DISPLACER_BOLT_SPEED,
        velocityY: dirY * DISPLACER_BOLT_SPEED,
        damage: DISPLACER_BOLT_DAMAGE,
        sourceTeamId: caster.teamId,
        sourceUnitId: caster.id,
        sourceAbilityId: CARD_ID,
        maxDistance: DISPLACER_BOLT_TRAVEL_DISTANCE,
        // Same visual type withSpriteConfig() gives the cast bolt (the purple spit sprite).
        projectileType: 'sprite_projectile',
        spriteConfig: DISPLACER_BOLT_SPRITE_CONFIG,
    });
    projectile.radius = DISPLACER_BOLT_PROJECTILE_RADIUS;
    engine.addProjectile(projectile);
    return projectile;
}

export const DISPLACER_BOLT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#d9f0ff"/>
      <stop offset="45%" stop-color="#3366cc"/>
      <stop offset="100%" stop-color="#001133"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="28" fill="#3366cc" opacity="0.2"/>
  <circle cx="32" cy="32" r="20" fill="url(#g)"/>
</svg>`;

const _base: AbilityStatic = defineAbility({
    id: CARD_ID,
    name: 'Displacer Bolt',
    image: DISPLACER_BOLT_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { id: 'draw', start: 0, end: LOCK_TIME, abilityPhase: AbilityPhase.Windup },
        {
            id: 'active',
            start: LOCK_TIME,
            end: PREFIRE_TIME,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            behaviour: CastBehaviours.ProjectileLaunch()
                .withSpeed(DISPLACER_BOLT_SPEED)
                // maxRange clamps aim direction; travelFullRange makes the bolt fly the whole distance.
                .withMaxRange(DISPLACER_BOLT_TRAVEL_DISTANCE)
                .withTravelFullRange()
                .withBaseDamage(DAMAGE)
                .withRadius(PROJECTILE_RADIUS)
                .withSpriteConfig(DISPLACER_BOLT_SPRITE_CONFIG),
        },
        {
            id: 'cooldown',
            start: PREFIRE_TIME,
            end: PREFIRE_TIME + COOLDOWN_SEC,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    // The enraged spirit swaps to the faster Frenzied Displacer Bolt (0020).
    forbiddenTags: [UnitTag.Enraged],
    aiSettings: {
        minRange: 0,
        maxRange: DISPLACER_BOLT_TARGET_RANGE,
        maxUsesPerRound: MAX_USES,
        priority: 10,
        ninjutsu: { ignore: true },
    },
    beginActiveCast(engine: unknown, caster: Unit, targets: ResolvedTarget[]): void {
        // Clone casts are echoes: skip the mirror command so they never re-trigger it.
        if (hasUnitTag(caster, UnitTag.Clone)) return;
        mirrorAbilityToClones(engine as MirrorEngineLike, caster, CARD_ID, targets);
    },
    getRange: (_caster: Unit) => ({ minRange: 0, maxRange: DISPLACER_BOLT_TARGET_RANGE }),

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },
});

export const DisplacerBoltAbility: AbilityStatic = {
    ..._base,

    // Same telegraph as the slime (aim line capped at the slime's targeting range).
    renderActivePreview: SlimeShotAbility.renderActivePreview,
};

export const DisplacerBoltCard: CardDef = {
    abilityId: CARD_ID,
};

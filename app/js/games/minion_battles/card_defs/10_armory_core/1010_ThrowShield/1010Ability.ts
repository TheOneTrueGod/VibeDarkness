/**
 * Throw Shield — hurl the conjured buckler. It strikes the first enemy, then bounces to the
 * nearest other enemy and falls there. With no second enemy in range it falls on the first.
 * A miss falls at max range. The token exists immediately; its picture stays hidden until the toss finishes.
 * Single use. Does not cost Charge. The trail is thicker than a bullet's, narrows to a point,
 * and takes the theme secondary.
 * The card picture is the tipped buckler. Flight and the token use the upright one.
 * In flight it leaves fading copies of itself that drift backward (`thrownWeapon` afterimage preset).
 */

import { defineThrownWeapon } from '../../../abilities/archetypes/defineThrownWeapon';
import shieldThrowSvg from '../shieldThrow.svg?raw';
import type { SpriteProjectileConfig } from '../../../game/projectiles/projectile_defs/types';
import { SPRITE_AFTERIMAGE_PRESETS } from '../../../game/projectiles/projectile_defs/spriteAfterimage';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import shieldProjectileUrl from '../shield.svg';
import {
    ARMORY_SHIELD_WEAPON_ID,
    SHIELD_FOLLOWUP_USES,
    THROW_SHIELD_ABILITY_ID,
} from '../armoryConstants';
import {
    THROW_SHIELD_ACTIVE_END,
    THROW_SHIELD_AIM_LABEL,
    THROW_SHIELD_BOUNCE_RANGE,
    THROW_SHIELD_COOLDOWN_END,
    THROW_SHIELD_DAMAGE,
    THROW_SHIELD_HIT_COUNT,
    THROW_SHIELD_HIT_RADIUS,
    THROW_SHIELD_SPRITE_SCALE,
    THROW_SHIELD_TRAIL_RADIUS,
    THROW_SHIELD_WINDUP_END,
} from './1010Constants';
import { THROWN_WEAPON_SPEED, THROWN_WEAPON_SPIN_DEGREES_PER_SECOND } from '../1003_ThrowSword/1003Constants';

const THROW_SHIELD_SPRITE: SpriteProjectileConfig = {
    sprite: {
        fps: 8,
        scale: THROW_SHIELD_SPRITE_SCALE,
        frameFiles: [shieldProjectileUrl],
    },
    loop: true,
    animations: [{ type: 'rotation', mode: 'constant', degreesPerSecond: THROWN_WEAPON_SPIN_DEGREES_PER_SECOND }],
    afterimage: SPRITE_AFTERIMAGE_PRESETS.thrownWeapon,
    trail: { effectType: 'BulletTrail' },
};

const TOOLTIP_LINES = [
    'Throw the buckler. Deal {{DAMAGE}} damage, then it bounces to one more enemy.',
    'The buckler drops where it stops, and your weapon returns.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: THROW_SHIELD_DAMAGE },
};

export const ThrowShieldAbility_1010 = defineThrownWeapon({
    id: THROW_SHIELD_ABILITY_ID,
    name: 'Throw Shield',
    flavorText: 'You shaped its rim to ring off one enemy and find the next.',
    image: shieldThrowSvg,
    weaponId: ARMORY_SHIELD_WEAPON_ID,
    damage: THROW_SHIELD_DAMAGE,
    speed: THROWN_WEAPON_SPEED,
    windupEnd: THROW_SHIELD_WINDUP_END,
    activeEnd: THROW_SHIELD_ACTIVE_END,
    cooldownEnd: THROW_SHIELD_COOLDOWN_END,
    aimLabel: THROW_SHIELD_AIM_LABEL,
    sprite: THROW_SHIELD_SPRITE,
    maxUses: SHIELD_FOLLOWUP_USES,
    hitPolicy: { damagingHits: THROW_SHIELD_HIT_COUNT, overflow: 'stop' },
    bounceRange: THROW_SHIELD_BOUNCE_RANGE,
    hitRadius: THROW_SHIELD_HIT_RADIUS,
    trail: { radius: THROW_SHIELD_TRAIL_RADIUS, taper: true },
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: THROW_SHIELD_ABILITY_ID } }),
        );
    },
});

export const ThrowShieldCard: CardDef = {
    abilityId: THROW_SHIELD_ABILITY_ID,
};

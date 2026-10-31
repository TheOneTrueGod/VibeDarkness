/**
 * Armory content registration: the sword, mace and shield conjured weapons and the turret's
 * sentry def. `registerArmoryContent()` is called from `abilities/AbilityRegistry.ts` and
 * `card_defs/index.ts`; tests that build Armory abilities without either call it in `beforeAll`.
 */
import { registerConjuredWeapon } from '../../game/conjuredWeapons/registry';
import { registerSentryDef } from '../../game/fieldObjects/sentryDefs';
import { TURRET_DEPLOY_PROJECTILE_TYPE } from '../../game/projectiles/projectile_defs/foldedTurretDef';
import { TURRET_FOLDED_BODY_RADIUS } from '../../game/effect_defs/turretDeployPose';
import type { SpriteProjectileConfig } from '../../game/projectiles/projectile_defs/types';
import { THROW_ROCK_SPRITE_CONFIG } from '../throwSharedTimings';
import { THROW_PROJECTILE_SPEED } from '../throwNumbers';
import {
    ARMORY_MACE_WEAPON_ID,
    ARMORY_SHIELD_WEAPON_ID,
    ARMORY_SWORD_WEAPON_ID,
    ARMORY_TURRET_DEF_ID,
    CHARGE_MACE_ABILITY_ID,
    CHARGE_MACE_MAX_USES,
    CREATE_MACE_ABILITY_ID,
    CREATE_SHIELD_ABILITY_ID,
    CREATE_SWORD_ABILITY_ID,
    DROPPED_WEAPON_KIND_MACE,
    DROPPED_WEAPON_KIND_SHIELD,
    DROPPED_WEAPON_KIND_SWORD,
    IMPROVISED_SWORD_ABILITY_ID,
    IMPROVISED_SWORD_MAX_USES,
    RELEASE_CHARGE_ABILITY_ID,
    SHIELD_FOLLOWUP_USES,
    THROW_SHIELD_ABILITY_ID,
    THROW_SWORD_ABILITY_ID,
    WHIRL_ABILITY_ID,
} from './armoryConstants';
import {
    TURRET_CONE_HALF_ANGLE_RAD,
    TURRET_DEPLOY_SPEED,
    TURRET_DEPLOY_SPIN_DEGREES_PER_SEC,
    TURRET_FIRST_SHOT_DELAY,
    TURRET_LIFETIME,
    TURRET_SHOT_COUNT,
    TURRET_SHOT_DAMAGE,
    TURRET_SHOT_HIT_RADIUS,
    TURRET_SHOT_INTERVAL,
    TURRET_SHOT_RANGE,
    TURRET_SHOT_SPRITE_SCALE,
} from './1004_DeployTurret/1004Constants';
import swordCardUrl from './chargeSword.svg';
import maceCardUrl from './chargeMace.svg';
import shieldCardUrl from './shield.svg';

/** Same rock frames and bullet trail as Throw Rock, drawn much smaller. */
function turretShotSprite(): SpriteProjectileConfig {
    const sprite = THROW_ROCK_SPRITE_CONFIG.sprite;
    if (!('frameFiles' in sprite)) return THROW_ROCK_SPRITE_CONFIG;
    return {
        ...THROW_ROCK_SPRITE_CONFIG,
        sprite: { ...sprite, scale: TURRET_SHOT_SPRITE_SCALE },
    };
}

let registered = false;

/** Registers the Armory's conjured weapons and sentry def. Safe to call more than once. */
export function registerArmoryContent(): void {
    if (registered) return;
    registered = true;
    registerConjuredWeapon({
        id: ARMORY_SWORD_WEAPON_ID,
        conjureAbilityId: CREATE_SWORD_ABILITY_ID,
        heldAbilityId: IMPROVISED_SWORD_ABILITY_ID,
        releaseAbilityId: THROW_SWORD_ABILITY_ID,
        tokenKind: DROPPED_WEAPON_KIND_SWORD,
        art: { url: swordCardUrl },
        heldUses: IMPROVISED_SWORD_MAX_USES,
    });

    registerConjuredWeapon({
        id: ARMORY_MACE_WEAPON_ID,
        conjureAbilityId: CREATE_MACE_ABILITY_ID,
        heldAbilityId: CHARGE_MACE_ABILITY_ID,
        releaseAbilityId: WHIRL_ABILITY_ID,
        tokenKind: DROPPED_WEAPON_KIND_MACE,
        art: { url: maceCardUrl },
        heldUses: CHARGE_MACE_MAX_USES,
    });

    registerConjuredWeapon({
        id: ARMORY_SHIELD_WEAPON_ID,
        conjureAbilityId: CREATE_SHIELD_ABILITY_ID,
        heldAbilityId: RELEASE_CHARGE_ABILITY_ID,
        releaseAbilityId: THROW_SHIELD_ABILITY_ID,
        tokenKind: DROPPED_WEAPON_KIND_SHIELD,
        art: { url: shieldCardUrl },
        heldUses: SHIELD_FOLLOWUP_USES,
        // Release Charge spends the buckler. Only Throw Shield leaves one on the ground.
        leaveTokenWhenHeldUsesEnd: false,
    });

    registerSentryDef({
        id: ARMORY_TURRET_DEF_ID,
        shotDamage: TURRET_SHOT_DAMAGE,
        shotInterval: TURRET_SHOT_INTERVAL,
        shotCount: TURRET_SHOT_COUNT,
        firstShotDelay: TURRET_FIRST_SHOT_DELAY,
        range: TURRET_SHOT_RANGE,
        coneHalfAngleRad: TURRET_CONE_HALF_ANGLE_RAD,
        shotHitRadius: TURRET_SHOT_HIT_RADIUS,
        shotSpeed: THROW_PROJECTILE_SPEED,
        lifetime: TURRET_LIFETIME,
        sprite: turretShotSprite(),
        deliveryProjectileType: TURRET_DEPLOY_PROJECTILE_TYPE,
        deliverySpeed: TURRET_DEPLOY_SPEED,
        deliverySpinDegreesPerSecond: TURRET_DEPLOY_SPIN_DEGREES_PER_SEC,
        deliveryBodyRadius: TURRET_FOLDED_BODY_RADIUS,
    });
}

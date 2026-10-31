/**
 * Registers the Armory sword, mace and shield as conjured weapons and the turret's rock sprite.
 * Importing this module is enough; ability files import it for the side effect.
 */
import { registerConjuredWeapon } from '../../game/conjuredWeapons/registry';
import { registerSentrySprite } from '../../game/fieldObjects/FieldObjectManager';
import type { SpriteProjectileConfig } from '../../game/projectiles/projectile_defs/types';
import { THROW_ROCK_SPRITE_CONFIG } from '../throwSharedTimings';
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
    TURRET_SHOT_SPRITE_SCALE,
    WHIRL_ABILITY_ID,
} from './armoryConstants';

/** Same rock frames and bullet trail as Throw Rock, drawn much smaller. */
function turretShotSprite(): SpriteProjectileConfig {
    const sprite = THROW_ROCK_SPRITE_CONFIG.sprite;
    if (!('frameFiles' in sprite)) return THROW_ROCK_SPRITE_CONFIG;
    return {
        ...THROW_ROCK_SPRITE_CONFIG,
        sprite: { ...sprite, scale: TURRET_SHOT_SPRITE_SCALE },
    };
}

registerConjuredWeapon({
    id: ARMORY_SWORD_WEAPON_ID,
    conjureAbilityId: CREATE_SWORD_ABILITY_ID,
    heldAbilityId: IMPROVISED_SWORD_ABILITY_ID,
    releaseAbilityId: THROW_SWORD_ABILITY_ID,
    tokenKind: DROPPED_WEAPON_KIND_SWORD,
    heldUses: IMPROVISED_SWORD_MAX_USES,
});

registerConjuredWeapon({
    id: ARMORY_MACE_WEAPON_ID,
    conjureAbilityId: CREATE_MACE_ABILITY_ID,
    heldAbilityId: CHARGE_MACE_ABILITY_ID,
    releaseAbilityId: WHIRL_ABILITY_ID,
    tokenKind: DROPPED_WEAPON_KIND_MACE,
    heldUses: CHARGE_MACE_MAX_USES,
});

registerConjuredWeapon({
    id: ARMORY_SHIELD_WEAPON_ID,
    conjureAbilityId: CREATE_SHIELD_ABILITY_ID,
    heldAbilityId: RELEASE_CHARGE_ABILITY_ID,
    releaseAbilityId: THROW_SHIELD_ABILITY_ID,
    tokenKind: DROPPED_WEAPON_KIND_SHIELD,
    heldUses: SHIELD_FOLLOWUP_USES,
    // Release Charge spends the buckler. Only Throw Shield leaves one on the ground.
    leaveTokenWhenHeldUsesEnd: false,
});

registerSentrySprite(ARMORY_TURRET_DEF_ID, turretShotSprite());

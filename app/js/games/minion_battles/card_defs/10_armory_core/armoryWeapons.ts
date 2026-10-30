/**
 * Registers the Armory sword as a conjured weapon and the turret's rock sprite.
 * Importing this module is enough; ability files import it for the side effect.
 */
import { registerConjuredWeapon } from '../../game/conjuredWeapons/registry';
import { registerSentrySprite } from '../../game/fieldObjects/FieldObjectManager';
import type { SpriteProjectileConfig } from '../../game/projectiles/projectile_defs/types';
import { THROW_ROCK_SPRITE_CONFIG } from '../throwSharedTimings';
import {
    ARMORY_SWORD_WEAPON_ID,
    ARMORY_TURRET_DEF_ID,
    CREATE_SWORD_ABILITY_ID,
    DROPPED_WEAPON_KIND_SWORD,
    IMPROVISED_SWORD_ABILITY_ID,
    IMPROVISED_SWORD_MAX_USES,
    THROW_SWORD_ABILITY_ID,
    TURRET_SHOT_SPRITE_SCALE,
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

registerSentrySprite(ARMORY_TURRET_DEF_ID, turretShotSprite());

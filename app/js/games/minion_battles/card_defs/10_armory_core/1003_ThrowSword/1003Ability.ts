/**
 * Throw Sword — hurl the conjured blade. It stops on the first enemy or at max range.
 * The stowed weapon returns when the blade leaves. The thrown sword becomes a ground token
 * where it stops. That token exists immediately; its resting picture stays hidden until the toss finishes.
 * Single use. Costs Charge. Echo 2: a copy is also thrown from each of the caster's two closest dropped weapons.
 * The card picture is the tipped blade. Flight and the token use the upright Charge Sword.
 * In flight it leaves fading copies of itself that drift backward (`thrownWeapon` afterimage preset).
 */

import { defineThrownWeapon } from '../../../abilities/archetypes/defineThrownWeapon';
import chargeSwordThrowSvg from '../chargeSwordThrow.svg?raw';
import type { SpriteProjectileConfig } from '../../../game/projectiles/projectile_defs/types';
import { SPRITE_AFTERIMAGE_PRESETS } from '../../../game/projectiles/projectile_defs/spriteAfterimage';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { formatEchoLine } from '../../../abilities/echo/echo';
import { ResourceId } from '../../../resources/resourceIds';
import swordProjectileUrl from '../chargeSword.svg';
import {
    ARMORY_ECHO_CHARGE_COST,
    ARMORY_ECHO,
    ARMORY_SWORD_WEAPON_ID,
    THROW_SWORD_ABILITY_ID,
} from '../armoryConstants';
import {
    THROWN_WEAPON_SPEED,
    THROWN_WEAPON_SPIN_DEGREES_PER_SECOND,
    THROW_SWORD_ACTIVE_END,
    THROW_SWORD_AIM_LABEL,
    THROW_SWORD_COOLDOWN_END,
    THROW_SWORD_DAMAGE,
    THROW_SWORD_WINDUP_END,
} from './1003Constants';

const THROW_SWORD_SPRITE: SpriteProjectileConfig = {
    sprite: {
        fps: 8,
        scale: 0.35,
        frameFiles: [swordProjectileUrl],
    },
    loop: true,
    animations: [{ type: 'rotation', mode: 'constant', degreesPerSecond: THROWN_WEAPON_SPIN_DEGREES_PER_SECOND }],
    afterimage: SPRITE_AFTERIMAGE_PRESETS.thrownWeapon,
};

const TOOLTIP_LINES = [
    'Throw the sword. Deal {{DAMAGE}} damage to the first enemy it hits.',
    'The sword drops where it stops, and your weapon returns.',
    formatEchoLine(ARMORY_ECHO),
];

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: THROW_SWORD_DAMAGE },
};

export const ThrowSwordAbility = defineThrownWeapon({
    id: THROW_SWORD_ABILITY_ID,
    name: 'Throw Sword',
    flavorText: 'Let it go. You can always make another.',
    image: chargeSwordThrowSvg,
    weaponId: ARMORY_SWORD_WEAPON_ID,
    resourceCost: { resourceId: ResourceId.Charge, amount: ARMORY_ECHO_CHARGE_COST },
    echo: ARMORY_ECHO,
    damage: THROW_SWORD_DAMAGE,
    speed: THROWN_WEAPON_SPEED,
    windupEnd: THROW_SWORD_WINDUP_END,
    activeEnd: THROW_SWORD_ACTIVE_END,
    cooldownEnd: THROW_SWORD_COOLDOWN_END,
    aimLabel: THROW_SWORD_AIM_LABEL,
    sprite: THROW_SWORD_SPRITE,
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: THROW_SWORD_ABILITY_ID } }),
        );
    },
});

export const ThrowSwordCard: CardDef = {
    abilityId: THROW_SWORD_ABILITY_ID,
};

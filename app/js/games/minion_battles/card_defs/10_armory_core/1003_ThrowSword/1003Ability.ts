/**
 * Throw Sword — hurl the conjured blade. It stops on the first enemy or at max range.
 * The stowed weapon returns when the blade leaves. The thrown sword becomes a ground token
 * where it stops. That token exists immediately; its resting picture stays hidden until the toss finishes.
 * Single use. Does not cost Charge.
 * The card picture is the tipped blade. Flight and the token use the upright Charge Sword.
 */

import { defineAbility } from '../../../abilities/defineAbility';
import chargeSwordThrowSvg from '../chargeSwordThrow.svg?raw';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { nullHitbox } from '../../../hitboxes';
import { drawClampedLine } from '../../../abilities/previewHelpers';
import type { Projectile } from '../../../game/projectiles/Projectile';
import type { SpriteProjectileConfig } from '../../../game/projectiles/projectile_defs/types';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { THROW_RANGE } from '../../throwSharedTimings';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import swordProjectileUrl from '../chargeSword.svg';
import {
    DROPPED_WEAPON_KIND_SWORD,
    THROW_SWORD_ABILITY_ID,
    THROW_SWORD_ACTIVE_END,
    THROW_SWORD_AIM_LABEL,
    THROW_SWORD_COOLDOWN_END,
    THROW_SWORD_DAMAGE,
    THROW_SWORD_WINDUP_END,
    THROWN_WEAPON_SPIN_DEGREES_PER_SECOND,
    THROWN_WEAPON_SPEED,
} from '../armoryConstants';
import { launchThrownWeapon, leaveThrownWeapon } from '../thrownWeapon';
import '../armoryWeapons';


const THROW_SWORD_SPRITE: SpriteProjectileConfig = {
    sprite: {
        fps: 8,
        scale: 0.35,
        frameFiles: [swordProjectileUrl],
    },
    loop: true,
    animations: [{ type: 'rotation', mode: 'constant', degreesPerSecond: THROWN_WEAPON_SPIN_DEGREES_PER_SECOND }],
};

const TOOLTIP_LINES = [
    'Hurl the conjured sword. It spins into the first enemy along its path for {{DAMAGE}} damage, then your weapon returns.',
    'The blade remains where it stops.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: THROW_SWORD_DAMAGE },
};

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: THROW_SWORD_WINDUP_END,
        abilityPhase: AbilityPhase.Windup,
        targetDef: {
            kind: 'select',
            label: THROW_SWORD_AIM_LABEL,
            hitbox: nullHitbox,
            filter: 'any',
            allowMiss: true,
        },
    },
    {
        id: 'throw',
        start: THROW_SWORD_WINDUP_END,
        end: THROW_SWORD_ACTIVE_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        behaviour: CastBehaviours.Instant((ctx) => launchThrownSword(ctx)),
    },
    {
        id: 'cooldown',
        start: THROW_SWORD_ACTIVE_END,
        end: THROW_SWORD_COOLDOWN_END,
        abilityPhase: AbilityPhase.Cooldown,
    },
];

export function launchThrownSword(ctx: CastBehaviourTickContext): void {
    launchThrownWeapon(ctx, {
        abilityId: THROW_SWORD_ABILITY_ID,
        speed: THROWN_WEAPON_SPEED,
        aimLabel: THROW_SWORD_AIM_LABEL,
        damage: THROW_SWORD_DAMAGE,
        spriteConfig: THROW_SWORD_SPRITE,
    });
}

export const ThrowSwordAbility = defineAbility({
    id: THROW_SWORD_ABILITY_ID,
    tags: [],
    name: 'Throw Sword',
    image: chargeSwordThrowSvg,
    resourceCost: null,
    resourceCosts: [],
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: [],
    prefireTime: THROW_SWORD_WINDUP_END,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: THROW_RANGE },
    onProjectileExpired(engine, caster, projectile): void {
        leaveThrownWeapon(engine, caster, projectile as Projectile, DROPPED_WEAPON_KIND_SWORD, THROW_SWORD_ABILITY_ID);
    },
    renderTargetingPreviewSelectedTargets(gr, caster, _currentTargets, mouseWorld): void {
        drawClampedLine(gr, caster, mouseWorld, THROW_RANGE);
    },
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

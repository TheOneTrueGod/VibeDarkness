/**
 * Throw Sword — hurl the conjured blade. It stops on the first enemy or at max range.
 * The stowed weapon returns when the blade leaves. The thrown sword becomes a ground token
 * where it stops. That token exists immediately; its resting picture stays hidden until the toss finishes.
 * Single use. Does not cost Charge.
 */

import { defineAbility } from '../../../abilities/defineAbility';
import swordItemIconSvg from '../../../character_defs/items/assets/013_sword.svg?raw';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { nullHitbox } from '../../../hitboxes';
import { drawClampedLine } from '../../../abilities/previewHelpers';
import { Projectile } from '../../../game/projectiles/Projectile';
import type { SpriteProjectileConfig } from '../../../game/projectiles/projectile_defs/types';
import type { ResolvedTarget } from '../../../game/types';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { THROW_PROJECTILE_SPEED, THROW_RANGE } from '../../throwSharedTimings';
import type { Unit } from '../../../game/units/Unit';
import { releaseHeldConjuredWeapon, type ConjureHost } from '../../../game/conjuredWeapons/runtime';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import swordProjectileUrl from '../../../character_defs/items/assets/013_sword.svg';
import {
    DROPPED_WEAPON_KIND_SWORD,
    THROW_SWORD_ABILITY_ID,
    THROW_SWORD_ACTIVE_END,
    THROW_SWORD_AIM_LABEL,
    THROW_SWORD_COOLDOWN_END,
    THROW_SWORD_DAMAGE,
    THROW_SWORD_WINDUP_END,
} from '../armoryConstants';
import '../armoryWeapons';

const SWORD_SPIN_DEGREES_PER_SECOND = 720;

const THROW_SWORD_SPRITE: SpriteProjectileConfig = {
    sprite: {
        fps: 8,
        scale: 0.35,
        frameFiles: [swordProjectileUrl],
    },
    loop: true,
    animations: [{ type: 'rotation', mode: 'constant', degreesPerSecond: SWORD_SPIN_DEGREES_PER_SECOND }],
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
    if (!ctx.caster.heldConjuredWeapon) return;
    const aim = aimPoint(ctx);
    const dx = aim.x - ctx.caster.x;
    const dy = aim.y - ctx.caster.y;
    const len = Math.hypot(dx, dy) || 1;
    ctx.engine.addProjectile(new Projectile({
        x: ctx.caster.x,
        y: ctx.caster.y,
        velocityX: (dx / len) * THROW_PROJECTILE_SPEED,
        velocityY: (dy / len) * THROW_PROJECTILE_SPEED,
        damage: THROW_SWORD_DAMAGE,
        sourceTeamId: ctx.caster.teamId,
        sourceUnitId: ctx.caster.id,
        sourceAbilityId: THROW_SWORD_ABILITY_ID,
        maxDistance: THROW_RANGE,
        projectileType: 'sprite_projectile',
        spriteConfig: THROW_SWORD_SPRITE,
    }));
    releaseHeldConjuredWeapon(ctx.caster, ctx.engine, { leaveToken: false });
}

function leaveThrownSword(engine: unknown, caster: Unit, projectile: Projectile): void {
    const host = engine as ConjureHost;
    host.state?.fieldObjects?.spawnDroppedWeapon(host, {
        originX: projectile.x,
        originY: projectile.y,
        directionRad: Math.atan2(projectile.velocityY, projectile.velocityX),
        kind: DROPPED_WEAPON_KIND_SWORD,
        ownerUnitId: caster.id,
        teamId: caster.teamId,
        abilityId: THROW_SWORD_ABILITY_ID,
    });
}

function aimPoint(ctx: CastBehaviourTickContext): { x: number; y: number } {
    const active = ctx.caster.activeAbilities.find((entry) => entry.abilityId === ctx.abilityId);
    const labeled = active?.targetsByLabel?.[THROW_SWORD_AIM_LABEL];
    const fromLabel = pointOf(labeled);
    if (fromLabel) return fromLabel;
    for (const target of ctx.allTargets) {
        const point = pointOf(target);
        if (point) return point;
    }
    return { x: ctx.caster.x + THROW_RANGE, y: ctx.caster.y };
}

function pointOf(target: ResolvedTarget | undefined): { x: number; y: number } | null {
    if (!target) return null;
    if (target.position) return target.position;
    return null;
}

export const ThrowSwordAbility = defineAbility({
    id: THROW_SWORD_ABILITY_ID,
    tags: [],
    name: 'Throw Sword',
    image: swordItemIconSvg,
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
        leaveThrownSword(engine, caster, projectile as Projectile);
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

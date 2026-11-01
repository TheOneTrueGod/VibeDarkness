/**
 * defineThrownWeapon — archetype factory for throwing a held conjured weapon.
 *
 * Timing: Windup `[0, windupEnd)` picks an aim point (`aimLabel`, any point, may miss);
 * Active `[windupEnd, activeEnd)` launches a sprite projectile toward it and puts the held weapon
 * away (no token); Cooldown `[activeEnd, cooldownEnd)`. The throw does nothing when no weapon is held.
 *
 * When the projectile stops (hit, bounce end or max range), the token of `weaponId` drops where it
 * stopped. The aim preview is a line clamped to `range`, and the AI aims within `range`.
 *
 * `echo` also throws a copy from each of the caster's tokens of that type, each aimed at the same
 * aim point (so each flies at its own angle), and destroys those tokens. Echo copies drop nothing. The aim preview draws their lines too.
 *
 * `trail` gives the projectile a trail; its colour defaults to the ability theme's secondary.
 * The sprite config must carry its own `trail` effect for the trail to draw.
 */

import type { AbilityStatic } from '../Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../abilityTimings';
import { CastBehaviours } from '../CastBehaviours';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';
import { defineAbility } from '../defineAbility';
import { drawClampedLine } from '../previewHelpers';
import { nullHitbox } from '../../hitboxes';
import { Projectile, type ProjectileHitPolicy } from '../../game/projectiles/Projectile';
import type { SpriteProjectileConfig } from '../../game/projectiles/projectile_defs/types';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { releaseHeldConjuredWeapon, type ConjureHost } from '../../game/conjuredWeapons/runtime';
import { getConjuredWeaponDef } from '../../game/conjuredWeapons/registry';
import { getAbilityTheme } from '../../themes/abilityTheme';
import { THROW_PROJECTILE_SPEED, THROW_RANGE } from '../../card_defs/throwNumbers';
import { consumeEchoTokens, findEchoTokens, type EchoSpec } from '../echo/echo';

/** `Projectile.expireData` flag on an echo copy, so it drops no token. */
const ECHO_THROW_DATA_KEY = 'echoThrow';

export interface ThrownWeaponTrail {
    /** Pixels. Omitted keeps the trail default. */
    radius?: number;
    /** Narrow to a point toward the tail. */
    taper?: boolean;
    /** Default: the ability theme's secondary. */
    color?: number;
}

export interface ThrownWeaponConfig {
    id: string;
    name: string;
    image: string;
    tags?: AbilityStatic['tags'];
    /** Registered `ConjuredWeaponDef` id whose token drops where the throw stops. */
    weaponId: string;
    damage: number;
    /** Pixels per second. Default `THROW_PROJECTILE_SPEED`. */
    speed?: number;
    /** Max flight distance, aim-line length and AI range. Default `THROW_RANGE`. */
    range?: number;
    windupEnd: number;
    activeEnd: number;
    cooldownEnd: number;
    aimLabel: string;
    sprite: SpriteProjectileConfig;
    resourceCost?: AbilityStatic['resourceCost'];
    /** See the file header. */
    echo?: EchoSpec;
    /** Default 1. */
    maxUses?: number;
    /** Default 1. */
    rechargeTurns?: number;
    /** Omitted stops on the first enemy. */
    hitPolicy?: ProjectileHitPolicy;
    /** See `Projectile.bounceRange`. */
    bounceRange?: number;
    /** Hit radius in pixels. Omitted keeps the projectile default. */
    hitRadius?: number;
    trail?: ThrownWeaponTrail;
    getTooltipText: (gameState?: unknown) => string[];
    /** Card flavour line; see `AbilityStatic.flavorText`. */
    flavorText?: string;
}

export function defineThrownWeapon(config: ThrownWeaponConfig): AbilityStatic {
    const range = config.range ?? THROW_RANGE;
    const trailColor = config.trail
        ? (config.trail.color ?? getAbilityTheme(config.id).secondaryNum)
        : undefined;

    const abilityTimings: AbilityTimingInterval[] = [
        {
            id: 'windup',
            start: 0,
            end: config.windupEnd,
            abilityPhase: AbilityPhase.Windup,
            targetDef: {
                kind: 'select',
                label: config.aimLabel,
                hitbox: nullHitbox,
                filter: 'any',
                allowMiss: true,
            },
        },
        {
            id: 'throw',
            start: config.windupEnd,
            end: config.activeEnd,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            behaviour: CastBehaviours.Instant((ctx) => launchThrownWeapon(ctx, config, range, trailColor)),
        },
        {
            id: 'cooldown',
            start: config.activeEnd,
            end: config.cooldownEnd,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ];

    return defineAbility({
        id: config.id,
        tags: config.tags ?? [],
        name: config.name,
        image: config.image,
        resourceCost: config.resourceCost ?? null,
        resourceCosts: [],
        rechargeTurns: config.rechargeTurns ?? 1,
        maxUses: config.maxUses ?? 1,
        recoveries: [],
        prefireTime: config.windupEnd,
        targets: [],
        abilityTimings,
        aiSettings: { minRange: 0, maxRange: range },
        onProjectileExpired(engine, caster, projectile): void {
            const weapon = getConjuredWeaponDef(config.weaponId);
            if (!weapon || (projectile as Projectile).expireData?.[ECHO_THROW_DATA_KEY]) return;
            leaveThrownWeapon(engine, caster, projectile as Projectile, weapon.tokenKind, config.id);
        },
        renderTargetingPreviewSelectedTargets(gr, caster, _currentTargets, mouseWorld, _units, gameState): void {
            drawClampedLine(gr, caster, mouseWorld, range);
            if (!config.echo) return;
            const fallback = directionTo(caster, mouseWorld, { x: 1, y: 0 });
            for (const token of findEchoTokens(gameState, caster, config.echo)) {
                const dir = directionTo(token, mouseWorld, fallback);
                drawClampedLine(gr, token, { x: token.x + dir.x * range, y: token.y + dir.y * range }, range);
            }
        },
        getTooltipText: config.getTooltipText,
        flavorText: config.flavorText,
    });
}

function launchThrownWeapon(
    ctx: CastBehaviourTickContext,
    config: ThrownWeaponConfig,
    range: number,
    trailColor: number | undefined,
): void {
    if (!ctx.caster.heldConjuredWeapon) return;
    const aim = aimPoint(ctx, config.aimLabel, range);
    const dir = directionTo(ctx.caster, aim, { x: 1, y: 0 });
    const echoTokens = config.echo ? findEchoTokens(ctx.engine, ctx.caster, config.echo) : [];
    throwWeaponCopy(ctx, config, range, trailColor, ctx.caster, dir, false);
    for (const token of echoTokens) {
        throwWeaponCopy(ctx, config, range, trailColor, token, directionTo(token, aim, dir), true);
    }
    consumeEchoTokens(ctx.engine, echoTokens);
    releaseHeldConjuredWeapon(ctx.caster, ctx.engine, { leaveToken: false });
}

function throwWeaponCopy(
    ctx: CastBehaviourTickContext,
    config: ThrownWeaponConfig,
    range: number,
    trailColor: number | undefined,
    from: { x: number; y: number },
    dir: { x: number; y: number },
    isEcho: boolean,
): void {
    const speed = config.speed ?? THROW_PROJECTILE_SPEED;
    const trail = config.trail;
    const projectile = new Projectile({
        x: from.x,
        y: from.y,
        velocityX: dir.x * speed,
        velocityY: dir.y * speed,
        damage: config.damage,
        sourceTeamId: ctx.caster.teamId,
        sourceUnitId: ctx.caster.id,
        sourceAbilityId: config.id,
        maxDistance: range,
        projectileType: 'sprite_projectile',
        spriteConfig: config.sprite,
        ...(config.hitPolicy ? { hitPolicy: config.hitPolicy } : {}),
        ...(config.bounceRange != null ? { bounceRange: config.bounceRange } : {}),
        ...(trail?.radius != null ? { trailRadius: trail.radius } : {}),
        ...(trail?.taper ? { trailTaper: true } : {}),
        ...(trailColor != null ? { trailColor } : {}),
        ...(isEcho ? { expireData: { [ECHO_THROW_DATA_KEY]: true } } : {}),
    });
    if (config.hitRadius != null) projectile.radius = config.hitRadius;
    ctx.engine.addProjectile(projectile);
}

function leaveThrownWeapon(
    engine: unknown,
    caster: Unit,
    projectile: Projectile,
    kind: string,
    abilityId: string,
): void {
    const host = engine as ConjureHost;
    host.state?.fieldObjects?.spawnDroppedWeapon(host, {
        originX: projectile.x,
        originY: projectile.y,
        directionRad: Math.atan2(projectile.velocityY, projectile.velocityX),
        kind,
        ownerUnitId: caster.id,
        teamId: caster.teamId,
        abilityId,
    });
}

/** Unit vector from `from` toward `to`, or `fallback` when they coincide. */
function directionTo(
    from: { x: number; y: number },
    to: { x: number; y: number },
    fallback: { x: number; y: number },
): { x: number; y: number } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    return len > 1e-6 ? { x: dx / len, y: dy / len } : fallback;
}

function aimPoint(ctx: CastBehaviourTickContext, aimLabel: string, range: number): { x: number; y: number } {
    const active = ctx.caster.activeAbilities.find((entry) => entry.abilityId === ctx.abilityId);
    const fromLabel = pointOf(active?.targetsByLabel?.[aimLabel]);
    if (fromLabel) return fromLabel;
    for (const target of ctx.allTargets) {
        const point = pointOf(target);
        if (point) return point;
    }
    return { x: ctx.caster.x + range, y: ctx.caster.y };
}

function pointOf(target: ResolvedTarget | undefined): { x: number; y: number } | null {
    return target?.position ?? null;
}

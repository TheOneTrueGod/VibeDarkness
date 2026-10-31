/**
 * Sentry definitions. A sentry instance stores only its `defId` and runtime counters;
 * every number it fires with is read from the def registered here.
 *
 * Content registers its defs; the engine never imports content.
 */
import type { SpriteProjectileConfig } from '../projectiles/projectile_defs/types';

export interface SentryDef {
    id: string;
    /** Damage of each shot. */
    shotDamage: number;
    /** Game seconds between shots, after the first. */
    shotInterval: number;
    /** Shots fired before the sentry leaves. */
    shotCount: number;
    /** Game seconds from spawn to the first shot. */
    firstShotDelay: number;
    /** Shot reach, and the length of the targeting cone, in pixels. */
    range: number;
    /** Half the targeting cone's angle, around the sentry's facing. */
    coneHalfAngleRad: number;
    /** Hit radius of each shot, in pixels. */
    shotHitRadius: number;
    /** Shot speed, in pixels per second. */
    shotSpeed: number;
    /** Game seconds the sentry stays, whether or not it has shots left. */
    lifetime: number;
    /** Shot visual. Without one the shot uses the default projectile. Not serialized. */
    sprite?: SpriteProjectileConfig;
    /** Projectile type of the folded sentry in flight. Without one, deliveries spawn the sentry at once. */
    deliveryProjectileType?: string;
    /** Delivery flight speed, in pixels per second. */
    deliverySpeed?: number;
    /** Delivery spin, in degrees per second. */
    deliverySpinDegreesPerSecond?: number;
    /** Hit radius of the delivery projectile, in pixels. */
    deliveryBodyRadius?: number;
}

const SENTRY_DEFS = new Map<string, SentryDef>();

/** Register (or replace) a sentry def. Safe to call more than once with the same def. */
export function registerSentryDef(def: SentryDef): void {
    SENTRY_DEFS.set(def.id, def);
}

export function getSentryDef(defId: string): SentryDef | undefined {
    return SENTRY_DEFS.get(defId);
}

/** The def whose folded sentry flies as this projectile type (for drawing its pips in flight). */
export function getSentryDefByDeliveryProjectileType(projectileType: string): SentryDef | undefined {
    for (const def of SENTRY_DEFS.values()) {
        if (def.deliveryProjectileType === projectileType) return def;
    }
    return undefined;
}

/**
 * Deployable definitions. A deployable is summoned onto the field, arrives (optionally flying in
 * folded), triggers its action on a timer until its charges or lifetime run out, then leaves.
 * It is not a unit: nothing can target, collide with, or interact with it.
 *
 * A placed instance stores only its `defId` and runtime counters; every number is read from the
 * def registered here. Content registers its defs; the engine never imports content.
 */
import type { SpriteProjectileConfig } from '../projectiles/projectile_defs/types';

/** Fire one projectile at the nearest enemy in a cone around the facing (or along the facing). */
export interface DeployableShootAction {
    type: 'shoot';
    /** Damage of each shot. */
    damage: number;
    /** Shot reach, and the length of the targeting cone, in pixels. */
    range: number;
    /** Half the targeting cone's angle, around the deployable's facing. */
    coneHalfAngleRad: number;
    /** Hit radius of each shot, in pixels. */
    hitRadius: number;
    /** Shot speed, in pixels per second. */
    speed: number;
    /** Shot visual. Without one the shot uses the default projectile. Not serialized. */
    sprite?: SpriteProjectileConfig;
}

/** Heal every living ally (including the owner) within `radius`, with a ring effect. */
export interface DeployableHealPulseAction {
    type: 'healPulse';
    /** Reach of the pulse, in pixels, measured to the unit's centre. */
    radius: number;
    /** HP restored to each ally per pulse. */
    heal: number;
    /** Ring colours, innermost wave first. */
    pulseColors: readonly number[];
    /** Game seconds the ring effect lasts. */
    pulseDuration: number;
}

export type DeployableAction = DeployableShootAction | DeployableHealPulseAction;

export interface DeployableDelivery {
    /** Flight speed, in pixels per second. */
    speed: number;
    /** Spin while flying, in degrees per second. */
    spinDegreesPerSecond?: number;
    /** Hit radius of the delivery projectile, in pixels. */
    bodyRadius?: number;
}

export interface DeployableDef {
    id: string;
    /** Painter id in `deployablePainters.ts`. Draws the folded flight and the placed deployable. */
    visual: string;
    /** Times the action triggers before the deployable leaves. Shown as pips. */
    charges: number;
    /** Game seconds from arrival to the first trigger. */
    firstTriggerDelay: number;
    /** Game seconds between triggers, after the first. */
    triggerInterval: number;
    /** Game seconds the deployable stays, whether or not it has charges left. */
    lifetime: number;
    action: DeployableAction;
    /** Fly in folded from the caster. Without one, a delivery spawns the deployable at once. */
    delivery?: DeployableDelivery;
}

/** Projectile type of every folded deployable in flight. Its def id rides in `expireData.defId`. */
export const DEPLOYABLE_DELIVERY_PROJECTILE_TYPE = 'folded_deployable';
/** Projectile type checkpoints wrote before deployables were generalized. Drawn by the same def. */
export const LEGACY_TURRET_DELIVERY_PROJECTILE_TYPE = 'folded_turret';

const DEPLOYABLE_DEFS = new Map<string, DeployableDef>();

/** Register (or replace) a deployable def. Safe to call more than once with the same def. */
export function registerDeployableDef(def: DeployableDef): void {
    DEPLOYABLE_DEFS.set(def.id, def);
}

export function getDeployableDef(defId: string): DeployableDef | undefined {
    return DEPLOYABLE_DEFS.get(defId);
}

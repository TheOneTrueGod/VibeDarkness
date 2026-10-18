/**
 * ProjectileBuff - lightweight, serialized buff entry on a Projectile.
 *
 * Generic on purpose: time dilation uses `timeModifier`, later features can add other projectile
 * buff payloads. Duration is in WORLD seconds (`engine.gameTime`), not projectile local time, so a
 * slowed projectile's buff still expires on the world clock. See `game/time/AGENTS.md`.
 */

import type { TimeModifier } from '../time/TimeModifier';

export interface ProjectileBuff {
    id: string;
    /** Who applied it (unit id, ability id, ...). Used by `removeBuffsFromSource`. */
    sourceId: string;
    /** World time (`engine.gameTime`) when applied. */
    appliedAtTime: number;
    /** World seconds the buff lasts; `null` = until removed. */
    duration: number | null;
    /** Tempo/focal/freeze carried by this buff (stacked multiplicatively with other buffs). */
    timeModifier?: TimeModifier;
}

/** True when the buff's world-time duration has elapsed at `gameTime`. */
export function isProjectileBuffExpired(buff: ProjectileBuff, gameTime: number): boolean {
    return buff.duration !== null && gameTime >= buff.appliedAtTime + buff.duration;
}

export function cloneProjectileBuff(buff: ProjectileBuff): ProjectileBuff {
    return {
        ...buff,
        ...(buff.timeModifier
            ? {
                timeModifier: {
                    ...buff.timeModifier,
                    ...(buff.timeModifier.focal ? { focal: { ...buff.timeModifier.focal } } : {}),
                },
            }
            : {}),
    };
}

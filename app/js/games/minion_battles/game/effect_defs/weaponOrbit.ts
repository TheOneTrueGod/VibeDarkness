/**
 * Where each weapon picture sits during a conjure orbit.
 * Progress 0 and 1 are on the caster. The middle of the cast is the widest orbit.
 */
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { DEFAULT_WEAPON_TIP_OFFSET } from '../conjuredWeapons/registry';

/** Pictures in the orbit when `effectData.count` is omitted. */
export const DEFAULT_WEAPON_ORBIT_COUNT = 4;
/** Distance from the caster at the widest point, in pixels. */
export const DEFAULT_WEAPON_ORBIT_RADIUS = 1.5 * CELL_SIZE;
/** Full turns the ring makes while the pictures go out and come back. */
export const DEFAULT_WEAPON_ORBIT_TURNS = 1;
/** Share of the cast spent fading in, and again fading out, at the ends of the orbit. */
export const DEFAULT_WEAPON_ORBIT_FADE_PORTION = 0.12;
/** Drawn size of each picture, relative to the card art. */
export const DEFAULT_WEAPON_ORBIT_SCALE = 0.55;

export interface WeaponOrbitShape {
    count: number;
    radius: number;
    turns: number;
    fadePortion: number;
    /** Added to the orbit angle so the picture's tip points outward along it. */
    tipOffsetRad: number;
}

export const DEFAULT_WEAPON_ORBIT_SHAPE: WeaponOrbitShape = {
    count: DEFAULT_WEAPON_ORBIT_COUNT,
    radius: DEFAULT_WEAPON_ORBIT_RADIUS,
    turns: DEFAULT_WEAPON_ORBIT_TURNS,
    fadePortion: DEFAULT_WEAPON_ORBIT_FADE_PORTION,
    tipOffsetRad: DEFAULT_WEAPON_TIP_OFFSET,
};

export interface WeaponOrbitPose {
    x: number;
    y: number;
    rotation: number;
    alpha: number;
}

export function weaponOrbitPose(
    index: number,
    progress: number,
    shape: WeaponOrbitShape = DEFAULT_WEAPON_ORBIT_SHAPE,
): WeaponOrbitPose {
    const clamped = Math.min(1, Math.max(0, progress));
    const angle = clamped * shape.turns * Math.PI * 2
        + (index / shape.count) * Math.PI * 2;
    const radius = Math.sin(clamped * Math.PI) * shape.radius;
    return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        rotation: angle + shape.tipOffsetRad,
        alpha: weaponOrbitAlpha(clamped, shape.fadePortion),
    };
}

function weaponOrbitAlpha(progress: number, fadePortion: number): number {
    if (fadePortion <= 0) return 1;
    if (progress < fadePortion) return progress / fadePortion;
    const fadeOutStart = 1 - fadePortion;
    if (progress > fadeOutStart) return (1 - progress) / fadePortion;
    return 1;
}

/** Per-instance visual properties for explosion effects. */
export interface ExplosionEffectProperties {
    /** Visual radius in pixels. Replaces per-Effect effectRadius for explosion visuals. */
    radius?: number;
    /** Primary ring/fill color as a hex number (e.g. 0xffe066). */
    color?: number;
    /** Whether the blast expands outward or collapses inward. Default: 'contract'. */
    direction?: 'expand' | 'contract';
    /** Visual silhouette. Default 'disc' preserves existing Explosion behavior. */
    shape?: 'disc' | 'ring';
}

/** Union of all typed effect property shapes. Extend as new effect types need properties. */
export type EffectProperties = ExplosionEffectProperties;

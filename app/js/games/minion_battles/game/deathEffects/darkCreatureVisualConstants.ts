/** Corruption purple used for dark-creature UI (matches corruption bar stroke in GameRenderer). */
export const DARK_CREATURE_CORRUPTION_TINT = 0x9966cc;

/** Multiply-sprite overlay on living tokens (Pixi alpha 0–1). */
export const DARK_CREATURE_ICON_TINT_ALPHA = 0.7;

/** Death dissolve icon only — softer than living tint to avoid full-viewport purple wash when zoomed. */
export const DARK_CREATURE_DEATH_ICON_TINT_ALPHA = 0.45;

/** Quick icon dissolve + upward darkBlob particles. */
export const DARK_CREATURE_ICON_DEATH_DURATION_SECONDS = 0.44;

/** Spawn death particles on a ring this far from the unit center (fraction of collision radius). */
export const DARK_CREATURE_DEATH_PARTICLE_SPAWN_RADIUS_FACTOR = 0.8;

/** ParticleImage scale range for dark-creature death bursts (EffectRenderer maps scale → px). */
export const DARK_CREATURE_DEATH_PARTICLE_SCALE_MIN = 0.48;
export const DARK_CREATURE_DEATH_PARTICLE_SCALE_MAX = 0.78;

/** Radial burst speed (px/s) from the unit center through each ring spawn point. */
export const DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MIN = 90;
export const DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MAX = 170;

/** Constant upward acceleration (px/s²; negative y is up). */
export const DARK_CREATURE_DEATH_PARTICLE_UPWARD_ACCEL = -220;

export const DARK_CREATURE_DEATH_PARTICLE_LIFE_SECONDS = 0.35;

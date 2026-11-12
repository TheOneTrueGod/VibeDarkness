export enum DarknessLevel {
    FULL_DARKNESS    = 0,   // No light; 100% dark overlay, full vision cost (see game/visibility)
    DARKNESS_FOG     = 2,   // Fog shader activates at/below this level
    MEDIUM_LIGHT_MIN = 4,   // Lower bound of medium light (~70% overlay)
    MEDIUM_LIGHT_MAX = 9,   // Upper bound of medium light (10% overlay)
    BRIGHT_LIGHT     = 10,  // Lower bound of bright light (0% overlay)
    SUNLIGHT         = 16,  // Single-source only; warm tint; blocks dark creatures
}

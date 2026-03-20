/**
 * Shared unit size constant. Used as default unit radius (collision and rendering).
 * Other unit types may use fractions (e.g. 0.5 for small enemies) or overrides.
 */
export const DEFAULT_UNIT_RADIUS = 20;

/** Unit size categories mapped to radius in pixels. */
export type UnitSize = 'Tiny' | 'Extra Small' | 'Small' | 'Medium' | 'Large' | 'Extra Large' | 'Giant' | 'Colossal';

/** Size to radius (px) mapping for unit rendering and collision. */
export const UNIT_SIZE_MAP: Record<UnitSize, number> = {
    Tiny: 12,
    'Extra Small': 16,
    Small: 18,
    Medium: 20,
    Large: 22,
    'Extra Large': 26,
    Giant: 30,
    Colossal: 40,
};

/** Default size when not specified. */
export const DEFAULT_UNIT_SIZE: UnitSize = 'Medium';

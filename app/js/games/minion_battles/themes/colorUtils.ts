/**
 * Pure colour helpers shared by themes, content and renderers. No Pixi import.
 *
 * CSS hex strings are `#rrggbb`. Numbers are `0xrrggbb` (Pixi tint form).
 */

/** `'#4f6d8c'` → `0x4f6d8c`. A leading `#` is optional. */
export function cssHexToNumber(hex: string): number {
    return Number.parseInt(hex.startsWith('#') ? hex.slice(1) : hex, 16);
}

/** `0x4f6d8c` → `'#4f6d8c'` (lowercase, zero-padded to six digits). */
export function numberToCssHex(n: number): string {
    return `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Multiplies each channel by `factor` (0 = black, 1 = unchanged), rounding to the nearest integer. */
export function darkenCssHex(hex: string, factor: number): string {
    const n = cssHexToNumber(hex);
    const channel = (shift: number) => Math.round(((n >> shift) & 255) * factor).toString(16).padStart(2, '0');
    return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** Linear blend of two CSS hexes per channel: `t = 0` is `a`, `t = 1` is `b` (rounded to the nearest integer). */
export function mixCssHex(a: string, b: string, t: number): string {
    const na = cssHexToNumber(a);
    const nb = cssHexToNumber(b);
    const channel = (shift: number) =>
        Math.round(((na >> shift) & 255) * (1 - t) + ((nb >> shift) & 255) * t).toString(16).padStart(2, '0');
    return `#${channel(16)}${channel(8)}${channel(0)}`;
}

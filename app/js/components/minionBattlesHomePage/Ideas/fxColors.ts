/** Colour helpers shared by the Ideas particle previews (`ParticleFxPreview.tsx`) and art pieces (`fxArt/`). */

/** A palette as the particle previews use it. */
export interface FxPalette {
    name: string;
    primary: string;
    secondary: string;
}

/** The colours one preview paints with, derived from a palette. */
export interface FxColors {
    primary: string;
    secondary: string;
    /** Secondary lifted toward white: particle cores, highlights. */
    light: string;
    /** Primary pushed toward black: dark detail, card backgrounds. */
    shade: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const FALLBACK: FxPalette = { name: '', primary: '#f59e0b', secondary: '#fcd34d' };

export const isHex = (value: string): boolean => HEX_RE.test(value);

/** Linear blend of two `#rrggbb` colours; `t = 0` is `a`, `t = 1` is `b`. */
export function mix(a: string, b: string, t: number): string {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (shift: number) => {
        const v = Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
        return v.toString(16).padStart(2, '0');
    };
    return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** The palette with any malformed hex replaced by the fallback amber. */
export function safePalette(p: FxPalette): FxPalette {
    return {
        name: p.name,
        primary: isHex(p.primary) ? p.primary : FALLBACK.primary,
        secondary: isHex(p.secondary) ? p.secondary : FALLBACK.secondary,
    };
}

export function fxColors(palette: FxPalette): FxColors {
    const p = safePalette(palette);
    return {
        primary: p.primary,
        secondary: p.secondary,
        light: mix(p.secondary, '#ffffff', 0.55),
        shade: mix(p.primary, '#000000', 0.55),
    };
}

export const FX_FALLBACK_PALETTE = FALLBACK;

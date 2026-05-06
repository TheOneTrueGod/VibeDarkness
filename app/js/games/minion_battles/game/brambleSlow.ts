import type { Effect } from './effects/Effect';

/** Ground bramble zones use Effect effectType "BramblePatch" with effectData from {@link BRAMBLE_PATCH_DATA_KEYS}. */
export const BRAMBLE_PATCH_EFFECT_TYPE = 'BramblePatch';

export type BramblePatchEffectData = {
    radiusPx: number;
    /** Multiplier applied to movement speed while inside (e.g. 0.55 = 45% slow). */
    slowMult: number;
    expiresAtGameTime: number;
    ownerUnitId: string;
};

export function getBrambleMovementMultiplier(x: number, y: number, effects: readonly Effect[]): number {
    let mult = 1;
    for (const e of effects) {
        if (!e.active || e.effectType !== BRAMBLE_PATCH_EFFECT_TYPE) continue;
        const d = e.effectData as Partial<BramblePatchEffectData>;
        const r = d.radiusPx ?? 0;
        if (r <= 0) continue;
        const dx = x - e.x;
        const dy = y - e.y;
        if (dx * dx + dy * dy > r * r) continue;
        const sm = d.slowMult ?? 1;
        mult = Math.min(mult, sm);
    }
    return mult;
}

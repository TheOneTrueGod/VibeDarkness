import type { ResolvedTarget } from '../game/types';

export function dirFromTo(
    x0: number, y0: number,
    x1: number, y1: number,
): { dirX: number; dirY: number } {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return { dirX: 0, dirY: 0 };
    return { dirX: dx / len, dirY: dy / len };
}

/**
 * World-space unit direction for a melee lunge slide.
 * Single-target timings use `target` only; multi-lock swings may use the UI aim pixel.
 */
export function resolveMeleeSlideDirection(args: {
    caster: { x: number; y: number };
    target: ResolvedTarget;
    allTargets: ResolvedTarget[];
    numLockOns: number;
    getUnit: (id: string) => { x: number; y: number } | null | undefined;
}): { dirX: number; dirY: number } {
    const { caster, target, allTargets, numLockOns, getUnit } = args;
    const startIdx = Math.max(0, allTargets.indexOf(target));

    if (numLockOns > 1) {
        const aimPixelTarget = allTargets.slice(startIdx + numLockOns).find(t => t.type === 'pixel');
        if (aimPixelTarget?.type === 'pixel' && aimPixelTarget.position != null) {
            return dirFromTo(caster.x, caster.y, aimPixelTarget.position.x, aimPixelTarget.position.y);
        }
    }

    if (target.type === 'unit' && target.unitId != null) {
        const targetUnit = getUnit(target.unitId);
        const tx = targetUnit?.x ?? caster.x;
        const ty = targetUnit?.y ?? caster.y;
        return dirFromTo(caster.x, caster.y, tx, ty);
    }
    if (target.type === 'pixel' && target.position != null) {
        return dirFromTo(caster.x, caster.y, target.position.x, target.position.y);
    }
    return { dirX: 0, dirY: 0 };
}

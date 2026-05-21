export interface BramblePatch {
    id: string;
    x: number;
    y: number;
    radiusPx: number;
    /** Multiplier applied to movement speed while inside (e.g. 0.55 = 45% slow). */
    slowMult: number;
    expiresAtGameTime: number;
    ownerUnitId: string;
}

export function bramblePatchToJSON(p: BramblePatch): Record<string, unknown> {
    return {
        id: p.id,
        x: p.x,
        y: p.y,
        radiusPx: p.radiusPx,
        slowMult: p.slowMult,
        expiresAtGameTime: p.expiresAtGameTime,
        ownerUnitId: p.ownerUnitId,
    };
}

export function bramblePatchFromJSON(data: Record<string, unknown>): BramblePatch {
    return {
        id: data.id as string,
        x: data.x as number,
        y: data.y as number,
        radiusPx: data.radiusPx as number,
        slowMult: data.slowMult as number,
        expiresAtGameTime: data.expiresAtGameTime as number,
        ownerUnitId: data.ownerUnitId as string,
    };
}

export function getBrambleMovementMultiplier(x: number, y: number, patches: readonly BramblePatch[]): number {
    let mult = 1;
    for (const p of patches) {
        const r = p.radiusPx;
        if (r <= 0) continue;
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy > r * r) continue;
        mult = Math.min(mult, p.slowMult);
    }
    return mult;
}

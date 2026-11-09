/**
 * Formations: named shapes that place N things relative to a caster and a target point
 * ("a ring around me", "a box around them", "a wall between us"). Pure geometry, no engine imports,
 * so unit defs, abilities, AI and previews can all share one slot list.
 *
 * Every shape is laid out in the caster's FACING frame: forward = caster -> target (east when the two
 * coincide), side = forward rotated 90° clockwise on screen. A shape therefore turns with the fight,
 * which is what makes a formation feel aimed. Slot order is stable for a given input, so callers that
 * pair slots with units (see `assignUnitsToSlots`) stay deterministic.
 *
 * Users: the Court Magician's crystals (Rearrange, Crystal Laser). Anything that moves a group of units
 * into a shape (summoned adds, clones, turrets) should add a shape or preset here, not inline maths.
 */

export interface FormationPoint {
    x: number;
    y: number;
}

/** Which of the two reference points a shape is centred on. */
export type FormationAnchor = 'caster' | 'target';

export type FormationShape =
    /** Evenly spaced around a circle. `rotationDeg` turns the first slot away from the facing direction. */
    | { kind: 'ring'; anchor: FormationAnchor; radius: number; rotationDeg?: number }
    /**
     * A straight line along the facing direction, starting `startOffset` px from the anchor and stepping
     * `spacing` px outward. From the caster this is "a line pointing at the target".
     */
    | { kind: 'line'; anchor: FormationAnchor; startOffset: number; spacing: number }
    /**
     * A line ACROSS the facing direction, centred `forwardOffset` px in front of the anchor
     * (a shield wall, a firing line).
     */
    | { kind: 'wall'; anchor: FormationAnchor; forwardOffset: number; spacing: number }
    /** Evenly spaced along the perimeter of a square of half-width `halfSize`, aligned to the facing. */
    | { kind: 'box'; anchor: FormationAnchor; halfSize: number };

export interface FormationContext {
    caster: FormationPoint;
    target: FormationPoint;
}

/** Named presets. Reuse these before writing a new shape. */
export const FORMATION_PRESETS = {
    /** A line from the caster straight at the target: everything fired from it streams down one lane. */
    lineFromCaster: { kind: 'line', anchor: 'caster', startOffset: 60, spacing: 55 },
    /** A square cage around the target. */
    boxAroundTarget: { kind: 'box', anchor: 'target', halfSize: 120 },
    /** A guarding ring around the caster. */
    ringAroundCaster: { kind: 'ring', anchor: 'caster', radius: 90 },
    /** A wide ring around the target, so attacks come from every side. */
    ringAroundTarget: { kind: 'ring', anchor: 'target', radius: 170, rotationDeg: 30 },
    /** A line across the caster's facing, a short way in front of him: a barrier the target has to go around. */
    wallAcrossCaster: { kind: 'wall', anchor: 'caster', forwardOffset: 130, spacing: 70 },
    /** A tight wall just in front of the caster, facing the target (the Crystal Laser emitter). */
    wallFacingTarget: { kind: 'wall', anchor: 'caster', forwardOffset: 40, spacing: 18 },
} as const satisfies Record<string, FormationShape>;

export type FormationPresetId = keyof typeof FORMATION_PRESETS;

export const FORMATION_PRESET_IDS = Object.keys(FORMATION_PRESETS) as FormationPresetId[];

/** Unit vector from caster to target; east when they coincide. */
export function formationFacing(ctx: FormationContext): FormationPoint {
    const dx = ctx.target.x - ctx.caster.x;
    const dy = ctx.target.y - ctx.caster.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { x: 1, y: 0 };
    return { x: dx / len, y: dy / len };
}

/** World positions of `count` slots of `shape`. Returns `[]` for `count <= 0`. */
export function formationSlots(shape: FormationShape, count: number, ctx: FormationContext): FormationPoint[] {
    if (count <= 0) return [];
    const anchor = shape.anchor === 'caster' ? ctx.caster : ctx.target;
    const fwd = formationFacing(ctx);
    // Clockwise on screen (y down): rotate forward by +90°.
    const side = { x: -fwd.y, y: fwd.x };
    const at = (along: number, across: number): FormationPoint => ({
        x: anchor.x + fwd.x * along + side.x * across,
        y: anchor.y + fwd.y * along + side.y * across,
    });

    switch (shape.kind) {
        case 'ring': {
            const base = Math.atan2(fwd.y, fwd.x) + ((shape.rotationDeg ?? 0) * Math.PI) / 180;
            const step = (Math.PI * 2) / count;
            return Array.from({ length: count }, (_, i) => ({
                x: anchor.x + Math.cos(base + i * step) * shape.radius,
                y: anchor.y + Math.sin(base + i * step) * shape.radius,
            }));
        }
        case 'line':
            return Array.from({ length: count }, (_, i) => at(shape.startOffset + i * shape.spacing, 0));
        case 'wall': {
            const half = ((count - 1) * shape.spacing) / 2;
            return Array.from({ length: count }, (_, i) => at(shape.forwardOffset, -half + i * shape.spacing));
        }
        case 'box': {
            const h = shape.halfSize;
            const perimeter = 8 * h;
            const step = perimeter / count;
            // Start at the middle of the far side so the cage closes off the target's escape first.
            return Array.from({ length: count }, (_, i) => {
                const d = (h + i * step) % perimeter;
                // Walk the square: far side (along=+h), right side, near side, left side.
                if (d < 2 * h) return at(h, -h + d);
                if (d < 4 * h) return at(h - (d - 2 * h), h);
                if (d < 6 * h) return at(-h, h - (d - 4 * h));
                return at(-h + (d - 6 * h), -h);
            });
        }
    }
}

export interface SlotAssignment {
    unitId: string;
    slot: FormationPoint;
}

/**
 * Pair units with slots, shortest moves first (greedy, deterministic): repeatedly take the closest
 * remaining unit/slot pair, ties broken by list order. Extra units or slots are left out.
 */
export function assignUnitsToSlots(
    units: readonly { id: string; x: number; y: number }[],
    slots: readonly FormationPoint[],
): SlotAssignment[] {
    const freeUnits = units.map((_, i) => i);
    const freeSlots = slots.map((_, i) => i);
    const out: SlotAssignment[] = [];
    while (freeUnits.length > 0 && freeSlots.length > 0) {
        let best = { ui: 0, si: 0, d: Infinity };
        for (let a = 0; a < freeUnits.length; a++) {
            const u = units[freeUnits[a]!]!;
            for (let b = 0; b < freeSlots.length; b++) {
                const s = slots[freeSlots[b]!]!;
                const d = (u.x - s.x) ** 2 + (u.y - s.y) ** 2;
                if (d < best.d) best = { ui: a, si: b, d };
            }
        }
        out.push({ unitId: units[freeUnits[best.ui]!]!.id, slot: slots[freeSlots[best.si]!]! });
        freeUnits.splice(best.ui, 1);
        freeSlots.splice(best.si, 1);
    }
    return out;
}

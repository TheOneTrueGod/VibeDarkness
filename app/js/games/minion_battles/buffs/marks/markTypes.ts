import type { Unit } from '../../game/units/Unit';
import type { BuffRenderEmitContext } from '../../game/effects/buffParticleAura';

/** Render-only state a mark's visual may keep between frames (never serialized). */
export interface MarkRenderState {
    stacks: number;
    /** Fractional emissions carried over between frames. */
    accum: number;
    /** Emissions so far, for hash-based jitter. */
    count: number;
    /** Wall seconds this visual has run (for per-slot timers). */
    elapsed: number;
    /** Per-slot wall time at which that slot may emit again (one slot per stack, for count-by-visual marks). */
    slotReadyAt: number[];
}

/**
 * A mark: a stacking, refreshing debuff that other abilities read and consume (Conductive, ...).
 * Marks carry no behaviour of their own. Abilities apply them (`applyMarkToPrimaryTarget`, `applyMark`)
 * and spend them (`consumeMark`) for a payoff. Static data only; the runtime is `MarkBuff`.
 */
export interface MarkDef {
    id: string;
    /** Player-facing name (tooltips, keywords). */
    name: string;
    maxStacks: number;
    /** World seconds the mark lasts after it was last applied or refreshed. */
    durationSeconds: number;
    /**
     * Colour of the stack pips drawn above the unit (`buffVisuals`). Omit when `renderEmit` already shows the
     * stack count (e.g. Conductive keeps one live arc per stack).
     */
    pipColor?: number;
    /** Outline of the pips. */
    pipOutlineColor?: number;
    /** Glossary reminder text (legacy-encoded) for `{Name}` / `{Name N}` in tooltips. */
    description: string;
    /** Optional render-time visual while the unit is marked (wall time; see `Buff.renderEmit`). */
    renderEmit?(unit: Unit, ctx: BuffRenderEmitContext, state: MarkRenderState): void;
}

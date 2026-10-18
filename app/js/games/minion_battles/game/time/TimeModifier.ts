/**
 * TimeModifier — a tempo source carried by a buff (or projectile buff). Pure data + helpers.
 */
import { TEMPO_MAX, TEMPO_MIN, WORLD_PACE_MIN } from './timeConstants';

export interface TimeModifier {
    /** Who applied it (buff id / source actor id); for stacking and removal. */
    sourceId: string;
    /** Multiplier on the actor's local-time rate relative to world time. */
    tempo: number;
    /**
     * Present = focal dilation: also asks the world to slow so this actor looks normal speed.
     * `worldPace` overrides the default request of `1 / tempo`.
     */
    focal?: { worldPace?: number };
    /** Freezes the actor (tempo 0) regardless of `tempo`. */
    freeze?: boolean;
}

/** Multiply all modifiers then clamp to `[TEMPO_MIN, TEMPO_MAX]`; any `freeze` gives 0. 1 when empty. */
export function resolveTempo(modifiers: readonly TimeModifier[]): number {
    let tempo = 1;
    for (const m of modifiers) {
        if (m.freeze) return 0;
        tempo *= m.tempo;
    }
    if (tempo === 1) return 1;
    return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, tempo));
}

/** The world pace a focal modifier asks for: explicit `focal.worldPace`, else `1 / tempo`. Clamped to `[WORLD_PACE_MIN, 1]`. */
export function resolveFocalWorldPaceRequest(modifier: TimeModifier): number {
    const raw = modifier.focal?.worldPace ?? 1 / Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, modifier.tempo));
    return Math.min(1, Math.max(WORLD_PACE_MIN, raw));
}

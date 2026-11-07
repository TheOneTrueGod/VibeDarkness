/**
 * Display-only unit fade-in on WALL time (`performance.now()`), so it plays at the same speed whether the
 * battle is running, paused for orders or slowed. Started when a unit whose def sets `appearFadeInMs` first
 * appears, or by the `unit_fade_in` event (e.g. the Displacer Spirit reappearing among its decoys).
 */

export interface UnitFadeInState {
    startMs: number;
    durationMs: number;
}

/** Visual alpha for a fade that started at `startMs`: 0 → 1 over `durationMs` (eased out). */
export function unitFadeInAlpha(nowMs: number, fade: UnitFadeInState): number {
    if (fade.durationMs <= 0) return 1;
    const t = Math.max(0, Math.min(1, (nowMs - fade.startMs) / fade.durationMs));
    return 1 - (1 - t) * (1 - t);
}

/** True once the fade has fully played. */
export function isUnitFadeInDone(nowMs: number, fade: UnitFadeInState): boolean {
    return nowMs - fade.startMs >= fade.durationMs;
}

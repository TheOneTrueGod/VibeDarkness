/**
 * Auto-commit is attempted at most once per ITS run. A run is one mark: `begin` / `beginResume` make a
 * new mark, Replay keeps it (so a replayed preview is watched, not auto-committed again).
 *
 * The run must be keyed by the mark, not by "a poll saw ITS inactive": a Combo follow-up preview begins
 * the moment the previous one commits, so no poll sees the gap, and an inactive-only reset left the flag
 * set from the first cast of the chain. Burst at the end of Knife, Knife, Burst then never auto-committed.
 */
export interface ItsAutoCommitRunState {
    /** Mark of the run the flag belongs to (null when no run is active). */
    runMark: object | null;
    /** Auto-commit was already attempted (or Done pressed) for this run. */
    attempted: boolean;
}

/** State for this poll: the flag resets whenever the active run's mark changes, including to none. */
export function syncItsAutoCommitRun(
    state: ItsAutoCommitRunState,
    activeMark: object | null,
): ItsAutoCommitRunState {
    if (state.runMark === activeMark) return state;
    return { runMark: activeMark, attempted: false };
}

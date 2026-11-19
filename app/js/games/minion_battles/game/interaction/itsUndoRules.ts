/**
 * Pure Undo enablement rule for ITS playahead controls. Lives in `game/` so the swap predicate
 * can use it; `ui/components/itsUndoHotkey.ts` re-exports it for the Undo button and hotkey.
 */
export function isItsUndoDisabled(opts: {
    isRewindCrossfade: boolean;
    onlyUndoAtStart: boolean;
    hasCollectedTargets: boolean;
}): boolean {
    return opts.isRewindCrossfade || (opts.onlyUndoAtStart && opts.hasCollectedTargets);
}

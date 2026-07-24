import type { TurnIndicatorState } from './TurnIndicator';

/**
 * Chooses which plaque props to apply when `freezePresentation` is false.
 *
 * Always returns live props. Callers must not re-apply a mid-freeze stash: mark-restore
 * `your_turn` stashed during ITS rewind must not beat `ally_turn` that lands in the same
 * React commit as unfreeze (lobby 03FABA).
 */
export function pickTurnIndicatorPropsAfterUnfreeze(args: {
    liveState: TurnIndicatorState;
    liveAllyName: string;
}): { state: TurnIndicatorState; allyName: string } {
    return { state: args.liveState, allyName: args.liveAllyName };
}

import type { WaitingForOrders } from '../../../game/types';
import type { PlayerState } from '../../../../../types';

/** Props derived for {@link TurnIndicator} from round/turn state. */
export interface TurnIndicatorProps {
    state: 'playing' | 'your_turn' | 'ally_turn';
    allyName: string | undefined;
}

/**
 * True while the plaque should swap its ITS controls for the "waiting for server" spinner: the
 * local turn's commit is running (awaiting the network) and has not reported a submit failure.
 * A failure drops the spinner at once so the normal controls return beside the error notice.
 */
export function computeAwaitingServerAfterSubmit(args: {
    itsCommitInFlight: boolean;
    orderSubmitFailed: boolean;
}): boolean {
    return args.itsCommitInFlight && !args.orderSubmitFailed;
}

/**
 * Computes the `TurnIndicator` state + ally name from the current pause/turn state.
 * Pulled verbatim out of BattlePhase's JSX ternaries — `allyName` is resolved independently
 * of `state` (it does not gate on `storyPauseActive`/`canUseOrderUi`), matching the original.
 */
export function computeTurnIndicatorProps(args: {
    waitingForOrders: WaitingForOrders | null;
    storyPauseActive: boolean;
    canUseOrderUi: boolean;
    /**
     * Host persist-backlog hold: cards are gated via `canUseOrderUi`, but local waiters remain
     * so the plaque stays **Your Turn** (not gray "playing" / waiting-for-host).
     */
    hostPersistBacklogBlocking?: boolean;
    playerId: string;
    players: Record<string, PlayerState>;
}): TurnIndicatorProps {
    const { waitingForOrders, storyPauseActive, canUseOrderUi, hostPersistBacklogBlocking, playerId, players } = args;

    const localIsWaiter = waitingForOrders?.waiters.some((w) => w.ownerId === playerId) === true;
    const keepYourTurnForPersistHold = hostPersistBacklogBlocking === true && localIsWaiter;

    const state: TurnIndicatorProps['state'] = !waitingForOrders
        ? 'playing'
        : storyPauseActive
          ? 'playing'
          : canUseOrderUi || keepYourTurnForPersistHold
            ? 'your_turn'
            : waitingForOrders.waiters.some((w) => w.ownerId !== playerId)
              ? 'ally_turn'
              : 'playing';

    const allyName =
        waitingForOrders && waitingForOrders.waiters.some((w) => w.ownerId !== playerId)
            ? players[waitingForOrders.waiters.find((w) => w.ownerId !== playerId)!.ownerId]?.name ?? 'Player'
            : undefined;

    return { state, allyName };
}

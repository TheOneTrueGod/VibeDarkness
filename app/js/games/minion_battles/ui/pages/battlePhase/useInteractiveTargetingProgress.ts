import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import type { OrderWaiter } from '../../../game/types';
import { getAutoEndTurn } from '../../../game/autoEndTurnSetting';
import { isITSPreviewComplete } from '../../../game/interaction/isITSPreviewComplete';
import {
    ITS_AUTO_COMMIT_BLOCK_TARGETS_INCOMPLETE,
    logItsAutoCommitEval,
    logItsSelectPauseEntered,
} from '../../../game/interaction/itsLobbyLog';

interface UseInteractiveTargetingProgressParams {
    sessionRef: RefObject<BattleSession | null>;
    activeLocalWaiter: OrderWaiter | null;
    setOrderSubmitFailed: (failed: boolean) => void;
}

/** 50 ms ITS poll, AUTO_END_TURN auto-commit, player-tile refresh bump. */
export function useInteractiveTargetingProgress({
    sessionRef,
    activeLocalWaiter,
    setOrderSubmitFailed,
}: UseInteractiveTargetingProgressParams) {
    const [interactiveTargetingState, setInteractiveTargetingState] = useState<
        'inactive' | 'playing' | 'paused' | 'done'
    >('inactive');
    const [playerTileRefresh, setPlayerTileRefresh] = useState(0);
    const prevItsStateRef = useRef<string>('inactive');
    const autoCommitItsAttemptedRef = useRef(false);
    const lastSelectPauseLabelRef = useRef<string | null>(null);

    const getItsPlayaheadTicks = useCallback(() => {
        const session = sessionRef.current;
        const its = session?.interactiveTargeting;
        const engine = session?.getEngine();
        if (!its?.isActive || engine == null) return null;
        const savedLocalTick = its.savedLocalTick;
        if (savedLocalTick == null) return null;
        return { savedLocalTick, playaheadTick: engine.gameTick };
    }, [sessionRef]);

    useEffect(() => {
        const id = window.setInterval(() => {
            const session = sessionRef.current;
            const its = session?.interactiveTargeting;
            if (!its?.isActive) {
                autoCommitItsAttemptedRef.current = false;
                lastSelectPauseLabelRef.current = null;
                setInteractiveTargetingState('inactive');
                if (prevItsStateRef.current !== 'inactive') {
                    prevItsStateRef.current = 'inactive';
                }
                return;
            }
            const eng = session?.getEngine();
            if (!eng) {
                setInteractiveTargetingState('playing');
                return;
            }

            const waitingLabel = eng.waitingForTargetInput?.label ?? null;
            if (waitingLabel != null && waitingLabel !== lastSelectPauseLabelRef.current) {
                lastSelectPauseLabelRef.current = waitingLabel;
                logItsSelectPauseEntered(session!, its, waitingLabel);
            }
            if (waitingLabel == null) {
                lastSelectPauseLabelRef.current = null;
            }

            let nextState: 'playing' | 'paused' | 'done';
            if (eng.waitingForTargetInput) {
                nextState = 'paused';
            } else {
                nextState = isITSPreviewComplete(eng) ? 'done' : 'playing';
            }

            if (nextState === 'done' && getAutoEndTurn() && !autoCommitItsAttemptedRef.current && session) {
                const allTargetsCollected = its.allTargetsCollected();
                // Incomplete selects must not auto-commit (lobbies 12D040 / 10EA88).
                const willCommit = allTargetsCollected;
                logItsAutoCommitEval(session, its, {
                    previewComplete: true,
                    allTargetsCollected,
                    willCommit,
                    blockReason: willCommit ? null : ITS_AUTO_COMMIT_BLOCK_TARGETS_INCOMPLETE,
                });
                autoCommitItsAttemptedRef.current = true;
                if (willCommit) {
                    setOrderSubmitFailed(false);
                    void session.interactiveTargeting.commit(session, 'auto_end_turn');
                }
            }
            setInteractiveTargetingState(nextState);
            setPlayerTileRefresh((n) => n + 1);
            if (prevItsStateRef.current !== nextState) {
                prevItsStateRef.current = nextState;
            }
        }, 50);
        return () => window.clearInterval(id);
    }, [activeLocalWaiter, sessionRef, setOrderSubmitFailed]);

    return {
        interactiveTargetingState,
        playerTileRefresh,
        getItsPlayaheadTicks,
        autoCommitItsAttemptedRef,
    };
}

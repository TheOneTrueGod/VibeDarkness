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
import { InterruptedTextEffect } from '../../../game/effect_defs/hudEffects';
import type { HudEffectCanvasHandle } from '../../components/HudEffectCanvas';

interface UseInteractiveTargetingProgressParams {
    sessionRef: RefObject<BattleSession | null>;
    activeLocalWaiter: OrderWaiter | null;
    setOrderSubmitFailed: (failed: boolean) => void;
    hudEffectCanvasRef: RefObject<HudEffectCanvasHandle | null>;
}

/** 50 ms ITS poll, AUTO_END_TURN auto-commit, interrupted-cast auto-undo, player-tile refresh bump. */
export function useInteractiveTargetingProgress({
    sessionRef,
    activeLocalWaiter,
    setOrderSubmitFailed,
    hudEffectCanvasRef,
}: UseInteractiveTargetingProgressParams) {
    const [interactiveTargetingState, setInteractiveTargetingState] = useState<
        'inactive' | 'playing' | 'paused' | 'done'
    >('inactive');
    const [playerTileRefresh, setPlayerTileRefresh] = useState(0);
    const prevItsStateRef = useRef<string>('inactive');
    const autoCommitItsAttemptedRef = useRef(false);
    const lastSelectPauseLabelRef = useRef<string | null>(null);
    /** Guards the async interrupted-cast reset so the 50 ms poll doesn't fire it twice. */
    const interruptResetInFlightRef = useRef(false);

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

            // Preview cast interrupted before its targets were collected (knockback, stun, caster
            // death): it can never commit and no select pause is coming — auto-undo to the mark
            // instead of sitting in an uncommittable "done" state (lobby 0AD6EA).
            if (its.isPreviewCastInterrupted(eng)) {
                if (!interruptResetInFlightRef.current && session) {
                    interruptResetInFlightRef.current = true;
                    setOrderSubmitFailed(false);
                    hudEffectCanvasRef.current?.addHudEffect(new InterruptedTextEffect());
                    void its.cancelInterruptedPreview(session).finally(() => {
                        interruptResetInFlightRef.current = false;
                    });
                }
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
    }, [activeLocalWaiter, sessionRef, setOrderSubmitFailed, hudEffectCanvasRef]);

    return {
        interactiveTargetingState,
        playerTileRefresh,
        getItsPlayaheadTicks,
        autoCommitItsAttemptedRef,
    };
}

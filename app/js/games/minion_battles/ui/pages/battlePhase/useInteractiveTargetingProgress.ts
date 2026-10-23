import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import type { OrderWaiter } from '../../../game/types';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { getAutoEndTurn } from '../../../game/autoEndTurnSetting';
import {
    getEndedEarlyPreviewStop,
    isAtMissingPickDecision,
    isITSPreviewComplete,
    shouldAutoCommitItsPreview,
} from '../../../game/interaction/isITSPreviewComplete';
import { ONLY_UNDO_AT_START } from '../../../game/gameConstants';
import { isItsUndoDisabled } from '../../components/itsUndoHotkey';
import {
    ITS_AUTO_COMMIT_BLOCK_TARGETS_INCOMPLETE,
    ITS_AUTO_COMMIT_BLOCK_UNDO_ALLOWED,
    logItsAutoCommitEval,
    logItsEndedEarlyStop,
    logItsPreviewEndedEarly,
    logItsSelectPauseEntered,
} from '../../../game/interaction/itsLobbyLog';
import { buildPresetNotice } from '../../components/battleNotices';
import type { BattleNoticePresetId, BattleNoticeStore } from '../../components/battleNotices';
import type { HudEffectCanvasHandle } from '../../components/HudEffectCanvas';

interface UseInteractiveTargetingProgressParams {
    sessionRef: RefObject<BattleSession | null>;
    activeLocalWaiter: OrderWaiter | null;
    setOrderSubmitFailed: (failed: boolean) => void;
    /** Notice container above the "Your Turn" plaque (ended-early and missing-pick notices). */
    battleNoticeStore: BattleNoticeStore;
    /** Unused: the canvas "Interrupted" banner is gone (replaced by battle notices). */
    hudEffectCanvasRef?: RefObject<HudEffectCanvasHandle | null>;
}

const ENDED_EARLY_NOTICE_PRESET: Record<'interrupted' | 'fizzled' | 'caster_died', BattleNoticePresetId> = {
    interrupted: 'cast_interrupted',
    fizzled: 'cast_fizzled',
    caster_died: 'caster_defeated',
};

/**
 * 50 ms ITS poll, AUTO_END_TURN auto-commit, commit-in-flight mirror, player-tile refresh bump,
 * ended-early notices, and re-arming ITS resume mode at a missing-pick pause.
 */
export function useInteractiveTargetingProgress({
    sessionRef,
    activeLocalWaiter,
    setOrderSubmitFailed,
    battleNoticeStore,
}: UseInteractiveTargetingProgressParams) {
    const [interactiveTargetingState, setInteractiveTargetingState] = useState<
        'inactive' | 'playing' | 'paused' | 'done'
    >('inactive');
    const [playerTileRefresh, setPlayerTileRefresh] = useState(0);
    /** Mirrors `interactiveTargeting.isCommitInFlight`, sampled on the same poll as the ITS state. */
    const [itsCommitInFlight, setItsCommitInFlight] = useState(false);
    const prevItsStateRef = useRef<string>('inactive');
    const autoCommitItsAttemptedRef = useRef(false);
    const lastSelectPauseLabelRef = useRef<string | null>(null);
    /** Key of the ended-early notice already shown for this ITS run (reason:atTick); null when none. */
    const endedEarlyKeyRef = useRef<string | null>(null);
    /** Preset id of the ended-early notice currently shown (released when ITS ends). */
    const endedEarlyNoticeIdRef = useRef<string | null>(null);
    const endedEarlyStopLoggedRef = useRef(false);
    const pickNoticeShownRef = useRef(false);

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
        /** Show or release the "Target needed" notice for a missing-pick decision. */
        const syncPickNotice = (session: BattleSession | null): void => {
            const its = session?.interactiveTargeting;
            const atPick = its?.isResumeMode === true;
            if (atPick && !pickNoticeShownRef.current) {
                pickNoticeShownRef.current = true;
                const abilityId = its?.abilityId;
                const abilityName = abilityId != null ? getAbility(abilityId)?.name : undefined;
                battleNoticeStore.show(buildPresetNotice('pick_required', { abilityName }));
            } else if (!atPick && pickNoticeShownRef.current) {
                pickNoticeShownRef.current = false;
                battleNoticeStore.release('pick_required');
            }
        };

        const pollIts = (): void => {
            const session = sessionRef.current;
            const its = session?.interactiveTargeting;
            if (!its?.isActive) {
                autoCommitItsAttemptedRef.current = false;
                lastSelectPauseLabelRef.current = null;
                endedEarlyKeyRef.current = null;
                endedEarlyStopLoggedRef.current = false;
                if (endedEarlyNoticeIdRef.current != null) {
                    battleNoticeStore.release(endedEarlyNoticeIdRef.current);
                    endedEarlyNoticeIdRef.current = null;
                }
                // Missing-pick pause with no ITS running (first arrival, or re-arm after Undo): start
                // resume mode so the cursor appears for the missing pick. beginResume checks its own
                // preconditions and returns false cheaply otherwise (e.g. a stale waiter after commit).
                const idleEngine = session?.getEngine();
                if (
                    session != null
                    && idleEngine != null
                    && activeLocalWaiter != null
                    && isAtMissingPickDecision(idleEngine, activeLocalWaiter.unitId)
                ) {
                    session.interactiveTargeting.beginResume(activeLocalWaiter.unitId, session);
                }
                syncPickNotice(session);
                if (session?.interactiveTargeting.isActive) {
                    // beginResume started a run; the next poll reports its state.
                    setInteractiveTargetingState('playing');
                    prevItsStateRef.current = 'playing';
                    return;
                }
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
            syncPickNotice(session ?? null);

            const waitingLabel = eng.waitingForTargetInput?.label ?? null;
            if (waitingLabel != null && waitingLabel !== lastSelectPauseLabelRef.current) {
                lastSelectPauseLabelRef.current = waitingLabel;
                logItsSelectPauseEntered(session!, its, waitingLabel);
            }
            if (waitingLabel == null) {
                lastSelectPauseLabelRef.current = null;
            }

            // The preview cast ended early (interrupt / fizzle / death): it keeps playing forward (no
            // rewind). Tell the player once per early end.
            const endedEarly = its.getPreviewCastEndedEarly(eng);
            if (endedEarly == null) {
                endedEarlyKeyRef.current = null;
                endedEarlyStopLoggedRef.current = false;
            } else {
                const key = `${endedEarly.reason}:${endedEarly.atTick ?? 'none'}`;
                if (endedEarlyKeyRef.current !== key) {
                    endedEarlyKeyRef.current = key;
                    endedEarlyStopLoggedRef.current = false;
                    const presetId = ENDED_EARLY_NOTICE_PRESET[endedEarly.reason];
                    const sourceAbilityName = endedEarly.source != null
                        ? getAbility(endedEarly.source.abilityId)?.name
                        : undefined;
                    const previousNoticeId = endedEarlyNoticeIdRef.current;
                    if (previousNoticeId != null && previousNoticeId !== presetId) {
                        battleNoticeStore.release(previousNoticeId);
                    }
                    battleNoticeStore.show(buildPresetNotice(presetId, { detail: sourceAbilityName }));
                    endedEarlyNoticeIdRef.current = presetId;
                    logItsPreviewEndedEarly(session!, its, {
                        reason: endedEarly.reason,
                        atTick: endedEarly.atTick,
                        ...(endedEarly.source != null ? { source: endedEarly.source } : {}),
                    });
                }
            }

            let nextState: 'playing' | 'paused' | 'done';
            if (eng.waitingForTargetInput) {
                nextState = 'paused';
            } else {
                nextState = isITSPreviewComplete(eng) ? 'done' : 'playing';
            }

            if (nextState === 'done' && endedEarly != null && !endedEarlyStopLoggedRef.current && session) {
                endedEarlyStopLoggedRef.current = true;
                logItsEndedEarlyStop(session, its, getEndedEarlyPreviewStop(eng));
            }

            const endedEarlyNow = endedEarly != null;
            // Ended-early previews follow the Undo rule (commit when Undo is not allowed, otherwise wait for
            // Pass / Done); everything else follows Auto End. See shouldAutoCommitItsPreview.
            if (
                nextState === 'done'
                && (getAutoEndTurn() || endedEarlyNow)
                && !autoCommitItsAttemptedRef.current
                && session
            ) {
                const allTargetsCollected = its.allTargetsCollected();
                const undoAllowed = !isItsUndoDisabled({
                    isRewindCrossfade: false,
                    onlyUndoAtStart: ONLY_UNDO_AT_START,
                    hasCollectedTargets: Object.keys(its.collectedTargets).length > 0,
                });
                const willCommit = shouldAutoCommitItsPreview({
                    previewComplete: true,
                    allTargetsCollected,
                    endedEarly: endedEarlyNow,
                    autoEndTurn: getAutoEndTurn(),
                    undoAllowed,
                });
                logItsAutoCommitEval(session, its, {
                    previewComplete: true,
                    allTargetsCollected,
                    willCommit,
                    blockReason: willCommit
                        ? null
                        : endedEarlyNow
                          ? ITS_AUTO_COMMIT_BLOCK_UNDO_ALLOWED
                          : ITS_AUTO_COMMIT_BLOCK_TARGETS_INCOMPLETE,
                    endedEarly: endedEarlyNow,
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
        };

        const id = window.setInterval(() => {
            pollIts();
            // Sampled after pollIts (which may start the auto-commit) and in the same batch as the
            // ITS state, so the spinner appears on the commit poll and the ITS controls never flash
            // back between the commit finishing and ITS reading inactive.
            setItsCommitInFlight(sessionRef.current?.interactiveTargeting.isCommitInFlight ?? false);
        }, 50);
        return () => window.clearInterval(id);
    }, [activeLocalWaiter, sessionRef, setOrderSubmitFailed, battleNoticeStore]);

    return {
        interactiveTargetingState,
        itsCommitInFlight,
        playerTileRefresh,
        getItsPlayaheadTicks,
        autoCommitItsAttemptedRef,
    };
}

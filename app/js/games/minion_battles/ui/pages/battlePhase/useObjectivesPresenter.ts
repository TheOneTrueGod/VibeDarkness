import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { RefObject } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import type { GameEngine } from '../../../game/GameEngine';
import {
    OBJECTIVES_POPOVER_ENABLED,
    OBJECTIVES_POPOVER_TIMINGS,
    diffObjectiveRows,
    initialObjectivesPopoverState,
    objectivesPopoverReducer,
} from '../../components/objectivesPopover/objectivePresentation';
import type {
    ObjectivePresentationRow,
    ObjectivesPopoverPhase,
    ObjectivesPopoverState,
} from '../../components/objectivesPopover/objectivePresentation';

const POLL_INTERVAL_MS = 250;

export interface UseObjectivesPresenterInput {
    sessionRef: RefObject<BattleSession | null>;
    engine: GameEngine | null;
    missionId: string | null | undefined;
    lobbyId: string | null | undefined;
    storyPauseActive: boolean;
    /** ITS preview or rewind active: re-baseline silently instead of animating. */
    suppress: boolean;
    /** Mission opt-out (`objectivesIntro === false`). */
    objectivesIntro?: boolean;
}

export interface UseObjectivesPresenterResult {
    state: ObjectivesPopoverState;
    onStart: () => void;
    onPhaseAnimationEnd: (phase: ObjectivesPopoverPhase) => void;
    /** Mission won: hide the objectives card now; the victory popover takes over. */
    hideForVictory: () => void;
}

export function objectivesIntroStorageKey(
    lobbyId: string | null | undefined,
    missionId: string | null | undefined,
): string {
    return `mb_objectives_intro_${lobbyId ?? ''}_${missionId ?? ''}`;
}

function readDismissed(key: string): boolean {
    try {
        return sessionStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

function writeDismissed(key: string): void {
    try {
        sessionStorage.setItem(key, '1');
    } catch {
        // ignore storage failures
    }
}

export function useObjectivesPresenter(input: UseObjectivesPresenterInput): UseObjectivesPresenterResult {
    const { sessionRef, engine, missionId, lobbyId, storyPauseActive, suppress, objectivesIntro } = input;
    const [state, dispatch] = useReducer(objectivesPopoverReducer, initialObjectivesPopoverState);

    const stateRef = useRef(state);
    stateRef.current = state;
    const suppressRef = useRef(suppress);
    suppressRef.current = suppress;
    const storyPauseRef = useRef(storyPauseActive);
    storyPauseRef.current = storyPauseActive;

    const lastEngineRef = useRef<GameEngine | null>(null);
    const lastRowsRef = useRef<ObjectivePresentationRow[] | null>(null);
    const introHandledRef = useRef(false);

    const storageKey = objectivesIntroStorageKey(lobbyId, missionId);

    // Poll the engine for objective rows.
    useEffect(() => {
        if (!OBJECTIVES_POPOVER_ENABLED) return;
        const poll = () => {
            const currentEngine = sessionRef.current?.getEngine() ?? engine;
            if (!currentEngine) return;
            const rows = currentEngine.getBattleObjectiveRows();
            const engineChanged = lastEngineRef.current !== currentEngine;
            const prevRows = lastRowsRef.current;
            lastEngineRef.current = currentEngine;
            lastRowsRef.current = rows;

            if (rows.length === 0) {
                if (prevRows && prevRows.length > 0) {
                    dispatch({ type: 'rebaseline', rows });
                }
                return;
            }

            // Intro: fresh battle, after any opening story pause, once per lobby+mission per tab session.
            if (!introHandledRef.current && stateRef.current.phase === 'hidden') {
                if (objectivesIntro === false || readDismissed(storageKey) || currentEngine.gameTick > 0) {
                    introHandledRef.current = true;
                    dispatch({ type: 'skipIntro', rows });
                    return;
                }
                if (storyPauseRef.current) {
                    return;
                }
                introHandledRef.current = true;
                dispatch({ type: 'showIntro', rows });
                return;
            }

            if (engineChanged || suppressRef.current || !prevRows) {
                dispatch({ type: 'rebaseline', rows });
                return;
            }
            const diff = diffObjectiveRows(prevRows, rows);
            if (diff.newlyCompleted.length || diff.newlyRevealed.length || diff.removed.length) {
                dispatch({ type: 'objectivesChanged', diff, rows });
            }
        };
        poll();
        const interval = setInterval(poll, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [sessionRef, engine, storageKey, objectivesIntro]);

    // Timed phases.
    useEffect(() => {
        const ms = OBJECTIVES_POPOVER_TIMINGS[state.phase];
        if (!ms) return;
        const t = setTimeout(() => dispatch({ type: 'phaseElapsed' }), ms);
        return () => clearTimeout(t);
    }, [state.phase, state.activeDiff]);

    const onStart = useCallback(() => {
        writeDismissed(storageKey);
        dispatch({ type: 'start' });
    }, [storageKey]);

    const onPhaseAnimationEnd = useCallback((phase: ObjectivesPopoverPhase) => {
        // Timers are authoritative; only advance early if the phase is still current.
        if (stateRef.current.phase === phase) {
            dispatch({ type: 'phaseElapsed' });
        }
    }, []);

    const hideForVictory = useCallback(() => {
        dispatch({ type: 'victory' });
    }, []);

    return { state, onStart, onPhaseAnimationEnd, hideForVictory };
}

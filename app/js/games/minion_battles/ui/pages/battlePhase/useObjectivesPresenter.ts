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
    victorySequenceDurationMs,
} from '../../components/objectivesPopover/objectivePresentation';
import type {
    ObjectivePresentationRow,
    ObjectivesPopoverPhase,
    ObjectivesPopoverState,
} from '../../components/objectivesPopover/objectivePresentation';

const POLL_INTERVAL_MS = 250;
const VICTORY_TIMEOUT_SLACK_MS = 1000;

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
    /** Resolves when the victory sequence has finished (immediately when the popover is disabled or idle). */
    playVictory: () => Promise<void>;
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
    const victoryWaitersRef = useRef<Array<() => void>>([]);
    const victoryStartedRef = useRef(false);

    const storageKey = objectivesIntroStorageKey(lobbyId, missionId);

    const resolveVictoryWaiters = useCallback(() => {
        const waiters = victoryWaitersRef.current;
        victoryWaitersRef.current = [];
        for (const w of waiters) w();
    }, []);

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

    // Resolve victory waiters once the sequence is over.
    useEffect(() => {
        if (victoryStartedRef.current && state.phase === 'hidden') {
            resolveVictoryWaiters();
        }
    }, [state.phase, resolveVictoryWaiters]);

    useEffect(() => () => resolveVictoryWaiters(), [resolveVictoryWaiters]);

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

    const playVictory = useCallback((): Promise<void> => {
        if (!OBJECTIVES_POPOVER_ENABLED) return Promise.resolve();
        // No objectives known (or mission has none): nothing to present.
        if (!lastRowsRef.current || lastRowsRef.current.length === 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve();
            };
            const timeout = setTimeout(done, victorySequenceDurationMs() + VICTORY_TIMEOUT_SLACK_MS);
            victoryWaitersRef.current.push(done);
            victoryStartedRef.current = true;
            dispatch({ type: 'victory' });
        });
    }, []);

    return { state, onStart, onPhaseAnimationEnd, playVictory };
}

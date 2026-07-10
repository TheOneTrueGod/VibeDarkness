import React from 'react';
import { Play, Pause, Square } from 'lucide-react';
import type { BattleSession } from '../../../game/BattleSession';
import { AUTO_END_TURN } from '../../../game/gameConstants';

interface InteractiveTargetingControlsProps {
    state: 'playing' | 'paused' | 'done';
    sessionRef: React.RefObject<BattleSession | null>;
    setOrderSubmitFailed: (v: boolean) => void;
    autoCommitItsAttemptedRef: React.MutableRefObject<boolean>;
}

/** ITS status pill + Reset/Replay/Continue controls shown during interactive targeting preview. */
export default function InteractiveTargetingControls({
    state,
    sessionRef,
    setOrderSubmitFailed,
    autoCommitItsAttemptedRef,
}: InteractiveTargetingControlsProps) {
    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-50">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border ${
                state === 'playing'
                    ? 'bg-green-900/50 border-green-700 text-green-300'
                    : state === 'paused'
                        ? 'bg-yellow-900/50 border-yellow-700 text-yellow-300'
                        : 'bg-sky-900/50 border-sky-700 text-sky-300'
            }`}>
                {state === 'playing' && <Play className="w-3.5 h-3.5" />}
                {state === 'paused' && <Pause className="w-3.5 h-3.5" />}
                {state === 'done' && <Square className="w-3.5 h-3.5" />}
                <span>
                    {state === 'playing' ? 'Playing'
                        : state === 'paused' ? 'Paused'
                        : 'Done'}
                </span>
            </div>
            <div className="flex gap-2">
                <button
                    className="px-3 py-1.5 rounded bg-red-900/60 text-red-300 text-sm hover:bg-red-800/60 border border-red-700"
                    onClick={() => {
                        setOrderSubmitFailed(false);
                        const session = sessionRef.current;
                        if (session) void session.interactiveTargeting.reset(session);
                    }}
                >
                    Reset
                </button>
                <button
                    className="px-3 py-1.5 rounded bg-sky-900/60 text-sky-300 text-sm hover:bg-sky-800/60 border border-sky-700"
                    onClick={() => {
                        setOrderSubmitFailed(false);
                        const session = sessionRef.current;
                        if (session) void session.interactiveTargeting.replay(session);
                    }}
                >
                    Replay
                </button>
                {!AUTO_END_TURN && (
                <button
                    className={`px-3 py-1.5 rounded text-sm border transition-opacity ${
                        state === 'done'
                            ? 'bg-primary text-white hover:opacity-90 border-primary cursor-pointer'
                            : 'bg-dark-800 text-light-600 border-dark-600 opacity-40 cursor-not-allowed'
                    }`}
                    disabled={state !== 'done'}
                    onClick={() => {
                        setOrderSubmitFailed(false);
                        autoCommitItsAttemptedRef.current = true;
                        const session = sessionRef.current;
                        if (session) void session.interactiveTargeting.commit(session, 'ui_done');
                    }}
                >
                    Continue
                </button>
                )}
            </div>
        </div>
    );
}

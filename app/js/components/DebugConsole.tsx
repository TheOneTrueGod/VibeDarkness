/**
 * Debug console - press tilde (~) three times to enable, once to disable.
 * Shows game state JSON in a collapsible panel.
 */
import React, { useState, useEffect, useCallback } from 'react';
import type { GameStatePayload } from '../types';

interface DebugConsoleProps {
    gameState: GameStatePayload | null;
}

export default function DebugConsole({ gameState }: DebugConsoleProps) {
    const [debugMode, setDebugMode] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [tildeCount, setTildeCount] = useState(0);

    const onKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key !== '`' && e.key !== '~') return;
            if (debugMode) {
                setDebugMode(false);
                setTildeCount(0);
            } else {
                setTildeCount((prev) => {
                    const next = prev + 1;
                    if (next >= 3) {
                        setDebugMode(true);
                        return 0;
                    }
                    return next;
                });
            }
        },
        [debugMode]
    );

    useEffect(() => {
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onKeyDown]);

    if (!debugMode) return null;

    return (
        <div
            className={`fixed bottom-0 left-1/2 -translate-x-1/2 z-[9999] bg-surface/[0.92] backdrop-blur border border-border-custom rounded-t-lg shadow flex flex-col overflow-hidden transition-all duration-200 ${
                expanded ? 'w-[50vw] h-[50vh]' : 'w-auto h-auto max-h-[60px]'
            }`}
        >
            <div className="p-2 shrink-0">
                <button
                    className="px-4 py-2 text-sm bg-surface-light text-white border border-border-custom rounded hover:bg-border-custom transition-colors"
                    onClick={() => setExpanded(!expanded)}
                >
                    Debug
                </button>
            </div>
            {expanded && (
                <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex gap-1 px-2 border-b border-border-custom shrink-0">
                        <button className="px-3 py-2 bg-transparent border-none border-b-2 border-b-primary text-primary text-sm cursor-pointer">
                            Game State
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-3 min-h-0">
                        <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
                            <code>
                                {gameState
                                    ? JSON.stringify(gameState, null, 2)
                                    : 'No game state yet.'}
                            </code>
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { GameRenderer } from '../../games/minion_battles/game/GameRenderer';
import { Camera } from '../../games/minion_battles/game/Camera';
import { createLiveScenarioRun, type LiveScenarioRun } from '../../games/minion_battles/testing/runner/SimulationRunner';
import type { ScenarioDefinition } from '../../games/minion_battles/testing/types';
import BattleCanvas from '../../games/minion_battles/ui/components/BattleCanvas';
import { PlaybackButton } from './PlaybackButton';

interface RunState {
    run: LiveScenarioRun;
    camera: Camera;
}

function makeRunState(scenario: ScenarioDefinition, renderer: GameRenderer): RunState {
    const run = createLiveScenarioRun(scenario);
    const { terrainManager } = run.engine;
    const grid = terrainManager?.grid;
    if (terrainManager && grid) {
        renderer.setTerrain(terrainManager);
        if (!scenario.renderLighting) {
            // Disable the darkness overlay for scenarios that don't use the lighting system
            renderer.setMissionLightConfig(false, 0);
        }
        const camera = new Camera(800, 600, grid.worldWidth, grid.worldHeight);
        const playerUnit = run.engine.getLocalPlayerUnit();
        if (playerUnit) camera.snapTo(playerUnit.x, playerUnit.y);
        return { run, camera };
    }
    return { run, camera: new Camera(800, 600, 800, 600) };
}

interface ScenarioPreviewModalProps {
    scenario: ScenarioDefinition;
    onClose: () => void;
}

export default function ScenarioPreviewModal({ scenario, onClose }: ScenarioPreviewModalProps) {
    // renderer lives for the full modal lifetime (no explicit destroy — StrictMode-safe)
    const [renderer] = useState(() => new GameRenderer());

    // runState is null until the useEffect initialises it (handles React StrictMode double-invoke)
    const [runState, setRunState] = useState<RunState | null>(null);
    const [playback, setPlayback] = useState<'playing' | 'paused'>('playing');

    // Always tracks the latest active run so the cleanup disposes the right one after replays
    const activeRunRef = useRef<LiveScenarioRun | null>(null);
    const justSettledRef = useRef(false);

    // Create run in useEffect so StrictMode's double-invoke produces a fresh second run
    useEffect(() => {
        const state = makeRunState(scenario, renderer);
        activeRunRef.current = state.run;
        justSettledRef.current = false;
        setRunState(state);
        setPlayback('playing');

        return () => {
            // Dispose via ref, not closure, so replays don't cause double-dispose
            activeRunRef.current?.dispose();
            activeRunRef.current = null;
            setRunState(null);
        };
    }, [scenario, renderer]);

    // Tick loop — auto-pauses when scenario settles
    useEffect(() => {
        if (!runState || playback !== 'playing') return;
        const { run } = runState;
        const id = window.setInterval(() => {
            if (run.isSettled()) {
                if (!justSettledRef.current) {
                    justSettledRef.current = true;
                    setPlayback('paused');
                }
                return;
            }
            run.stepTicks(2);
        }, 40);
        return () => window.clearInterval(id);
    }, [runState, playback]);

    const replay = useCallback(() => {
        // Dispose the current run and update the ref before creating the next
        activeRunRef.current?.dispose();
        justSettledRef.current = false;
        const next = makeRunState(scenario, renderer);
        activeRunRef.current = next.run;
        setRunState(next);
        setPlayback('playing');
    }, [scenario, renderer]);

    const stepOne = useCallback(() => {
        if (!runState || runState.run.isSettled()) return;
        runState.run.stepTicks(1);
    }, [runState]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const settled = runState?.run.isSettled() ?? false;
    const result = settled && runState ? runState.run.getResult() : null;
    const tick = runState?.run.getTicks() ?? 0;

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="flex flex-col rounded-xl border border-border-custom bg-surface shadow-2xl overflow-hidden"
                style={{ width: '90vw', maxWidth: 1100, height: '85vh' }}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-custom shrink-0">
                    <div className="flex items-center gap-1 shrink-0">
                        <PlaybackButton icon={SkipBack} title="Replay" onClick={replay} />
                        <PlaybackButton
                            icon={playback === 'playing' ? Pause : Play}
                            title={playback === 'playing' ? 'Pause' : 'Play'}
                            onClick={() => setPlayback((m) => (m === 'playing' ? 'paused' : 'playing'))}
                        />
                        <PlaybackButton
                            icon={SkipForward}
                            title="Next tick"
                            onClick={stepOne}
                            disabled={settled || playback !== 'paused'}
                            invisible={settled || playback === 'playing'}
                        />
                    </div>
                    <span className="text-xs text-muted shrink-0">Tick {tick}</span>
                    <h2 className="text-sm font-semibold text-white truncate flex-1">{scenario.title}</h2>
                    {result && (
                        <span className={`text-xs font-semibold shrink-0 ${result.passed ? 'text-success' : 'text-danger'}`}>
                            {result.passed ? 'Passed' : `Failed · ${result.message}`}
                        </span>
                    )}
                    <button
                        type="button"
                        className="w-7 h-7 shrink-0 rounded border border-border-custom flex items-center justify-center hover:bg-surface-light text-muted hover:text-white transition-colors"
                        onClick={onClose}
                        aria-label="Close preview"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Full battle canvas — parent must be flex so BattleCanvas's flex-1 div expands */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {runState ? (
                        <BattleCanvas
                            engine={runState.run.engine}
                            camera={runState.camera}
                            renderer={renderer}
                        />
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-muted text-sm">
                            Initializing…
                        </div>
                    )}
                </div>

                {/* Footer: result status */}
                <div className={`shrink-0 px-4 py-2 flex items-center gap-2 text-sm border-t ${
                    !settled
                        ? 'border-border-custom'
                        : result?.passed
                        ? 'border-success bg-success/5'
                        : 'border-danger bg-danger/5'
                }`}>
                    {!settled ? (
                        <span className="text-muted">running… {tick}</span>
                    ) : result?.passed ? (
                        <span className="text-success font-semibold">Passed</span>
                    ) : (
                        <span className="text-danger">{result?.message ?? 'Failed'}</span>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}

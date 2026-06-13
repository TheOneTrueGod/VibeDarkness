import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerState } from '../../../types';
import type { BattleOrderRecord } from '../../../types';
import type { SerializedGameState } from '../game/types';
import { MISSION_MAP } from '../storylines';
import type { IBaseMissionDef } from '../storylines/BaseMissionDef';
import { Camera } from '../game/Camera';
import { GameRenderer } from '../game/GameRenderer';
import { TerrainManager } from '../terrain/TerrainManager';
import BattleCanvas from '../ui/components/BattleCanvas';
import { Replay } from './Replay';

const SPEED_OPTIONS = [1, 2, 4] as const;

function derivePlayersFromInitialState(state: SerializedGameState): PlayerState[] {
    const raw = state as unknown as Record<string, unknown>;
    const selections = (raw.characterSelections ?? raw.character_selections) as Record<string, string> | undefined;
    const names = (raw.characterDisplayNames ?? raw.character_display_names) as Record<string, string> | undefined;
    const playerIds = selections ? Object.keys(selections) : [];
    if (playerIds.length === 0) {
        return [{ id: '1', name: 'Replay Host', color: '#4ecdc4', isHost: true }];
    }
    return playerIds.map((id, i) => ({
        id,
        name: names?.[id] ?? `Player ${i + 1}`,
        color: i === 0 ? '#4ecdc4' : '#a3b3ff',
        isHost: i === 0,
    }));
}

function parseOrdersPayload(text: string): BattleOrderRecord[] {
    const trimmed = text.trim();
    if (trimmed === '') return [];
    if (trimmed.startsWith('[')) {
        const data = JSON.parse(trimmed) as BattleOrderRecord[];
        return Array.isArray(data) ? data : [];
    }
    const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== '');
    return lines.map((line) => JSON.parse(line) as BattleOrderRecord);
}

export default function ReplayUi(): React.ReactElement {
    const [selectedMissionId, setSelectedMissionId] = useState<string>('dark_awakening');
    const [initialStateText, setInitialStateText] = useState<string>('');
    const [ordersText, setOrdersText] = useState<string>('');
    const [loadError, setLoadError] = useState<string | null>(null);
    const [replayState, setReplayState] = useState<{ tick: number; running: boolean; fingerprint: string; speed: number } | null>(
        null,
    );
    const [seekTickInput, setSeekTickInput] = useState<string>('0');

    const replayRef = useRef<Replay | null>(null);
    const replayUnsubscribeRef = useRef<(() => void) | null>(null);
    const rendererRef = useRef<GameRenderer | null>(null);
    const cameraRef = useRef<Camera | null>(null);
    const [, forceRender] = useState(0);

    const missionIds = useMemo(() => Object.keys(MISSION_MAP), []);

    const teardownReplay = useCallback(() => {
        replayUnsubscribeRef.current?.();
        replayUnsubscribeRef.current = null;
        replayRef.current?.dispose();
        replayRef.current = null;
        setReplayState(null);
    }, []);

    useEffect(() => {
        return () => {
            teardownReplay();
            rendererRef.current?.destroy();
            rendererRef.current = null;
        };
    }, [teardownReplay]);

    const handleFileRead = useCallback(
        async (file: File, kind: 'initial' | 'orders') => {
            const text = await file.text();
            if (kind === 'initial') {
                setInitialStateText(text);
            } else {
                setOrdersText(text);
            }
        },
        [],
    );

    const handleLoadReplay = useCallback(() => {
        setLoadError(null);
        const mission: IBaseMissionDef | undefined = MISSION_MAP[selectedMissionId];
        if (!mission) {
            setLoadError(`Unknown mission: ${selectedMissionId}`);
            return;
        }
        try {
            const initialState = JSON.parse(initialStateText) as SerializedGameState;
            const orders = parseOrdersPayload(ordersText);
            const players = derivePlayersFromInitialState(initialState);

            teardownReplay();
            const replay = new Replay({
                initialState,
                orders,
                mission,
                players,
            });
            replayRef.current = replay;
            if (!rendererRef.current) {
                rendererRef.current = new GameRenderer();
            }
            const terrain = mission.createTerrain();
            cameraRef.current = new Camera(800, 600, terrain.worldWidth, terrain.worldHeight);
            rendererRef.current.setTerrain(new TerrainManager(terrain));
            rendererRef.current.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
            replayUnsubscribeRef.current = replay.subscribe((state) => {
                setReplayState(state);
                setSeekTickInput(String(state.tick));
                forceRender((n) => n + 1);
            });
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Failed to parse replay files');
        }
    }, [initialStateText, ordersText, selectedMissionId, teardownReplay]);

    const replay = replayRef.current;
    const engine = replay?.getEngine() ?? null;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;

    return (
        <div className="w-full h-full min-h-0 overflow-hidden p-5">
            <div className="mx-auto flex h-full max-w-[1600px] min-h-0 flex-col gap-4">
                <div className="rounded-lg border border-border-custom bg-surface p-4">
                    <h2 className="text-xl font-semibold text-white">Battle Replay (Admin)</h2>
                    <p className="mt-1 text-sm text-muted">Load `initial_state.json` and `orders.jsonl` to replay deterministic battle ticks.</p>

                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm">
                            <span className="text-muted">Initial state file</span>
                            <input
                                type="file"
                                accept=".json,application/json"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        void handleFileRead(file, 'initial');
                                    }
                                }}
                                className="rounded border border-border-custom bg-surface-light px-3 py-2 text-white"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-sm">
                            <span className="text-muted">Orders file (JSON array or JSONL)</span>
                            <input
                                type="file"
                                accept=".json,.jsonl,text/plain,application/json"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        void handleFileRead(file, 'orders');
                                    }
                                }}
                                className="rounded border border-border-custom bg-surface-light px-3 py-2 text-white"
                            />
                        </label>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="text-sm text-muted">Mission</label>
                        <select
                            value={selectedMissionId}
                            onChange={(e) => setSelectedMissionId(e.target.value)}
                            className="rounded border border-border-custom bg-surface-light px-3 py-2 text-sm text-white"
                        >
                            {missionIds.map((missionId) => (
                                <option key={missionId} value={missionId}>
                                    {missionId}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={handleLoadReplay}
                            className="rounded bg-primary px-4 py-2 text-sm font-semibold text-secondary hover:bg-primary-hover"
                        >
                            Load Replay
                        </button>
                        {loadError && <span className="text-sm text-danger">{loadError}</span>}
                    </div>
                </div>

                <div className="rounded-lg border border-border-custom bg-surface p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={!replay}
                            onClick={() => replay?.play()}
                            className="rounded border border-border-custom bg-surface-light px-3 py-2 text-sm text-white disabled:opacity-50"
                        >
                            Play
                        </button>
                        <button
                            type="button"
                            disabled={!replay}
                            onClick={() => replay?.pause()}
                            className="rounded border border-border-custom bg-surface-light px-3 py-2 text-sm text-white disabled:opacity-50"
                        >
                            Pause
                        </button>
                        <button
                            type="button"
                            disabled={!replay}
                            onClick={() => replay?.step(1)}
                            className="rounded border border-border-custom bg-surface-light px-3 py-2 text-sm text-white disabled:opacity-50"
                        >
                            Step
                        </button>
                        <label className="ml-2 text-sm text-muted">Seek tick</label>
                        <input
                            type="number"
                            min={0}
                            value={seekTickInput}
                            onChange={(e) => setSeekTickInput(e.target.value)}
                            className="w-28 rounded border border-border-custom bg-surface-light px-2 py-2 text-sm text-white"
                        />
                        <button
                            type="button"
                            disabled={!replay}
                            onClick={() => replay?.seek(Number(seekTickInput))}
                            className="rounded border border-border-custom bg-surface-light px-3 py-2 text-sm text-white disabled:opacity-50"
                        >
                            Seek
                        </button>

                        <div className="ml-2 flex items-center gap-2">
                            <span className="text-sm text-muted">Speed</span>
                            {SPEED_OPTIONS.map((speed) => (
                                <button
                                    key={speed}
                                    type="button"
                                    disabled={!replay}
                                    onClick={() => replay?.setSpeed(speed)}
                                    className={`rounded border px-3 py-2 text-sm disabled:opacity-50 ${
                                        replayState?.speed === speed
                                            ? 'border-primary bg-primary/25 text-primary'
                                            : 'border-border-custom bg-surface-light text-white'
                                    }`}
                                >
                                    {speed}x
                                </button>
                            ))}
                        </div>

                        <div className="ml-auto flex flex-wrap gap-4 text-sm text-muted">
                            <span>Tick: {replayState?.tick ?? 0}</span>
                            <span>Fingerprint: {replayState?.fingerprint ?? '-'}</span>
                            <span>Status: {replayState?.running ? 'running' : 'paused'}</span>
                        </div>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border-custom">
                    {engine && renderer && camera ? (
                        <BattleCanvas engine={engine} camera={camera} renderer={renderer} />
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted">
                            Load replay files to render the battle canvas.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

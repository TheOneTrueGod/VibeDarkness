import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ListTree, Moon, Sun } from 'lucide-react';
import { Camera } from '../../../games/minion_battles/game/Camera';
import { GameRenderer } from '../../../games/minion_battles/game/GameRenderer';
import BattleCanvas from '../../../games/minion_battles/ui/components/BattleCanvas';
import type { IBaseMissionDef } from '../../../games/minion_battles/storylines/BaseMissionDef';
import {
    buildMissionPreviewEngine,
    MISSION_PREVIEW_PLAYER_ID,
    type MissionPreview,
} from '../../../games/minion_battles/storylines/missionOverview/buildMissionPreviewEngine';
import {
    collectMissionOverlayShapes,
    MISSION_OVERLAY_LAYERS,
    type MissionOverlayLayer,
} from '../../../games/minion_battles/storylines/missionOverview/missionOverlayShapes';
import type { StartingUnitInput } from '../../../games/minion_battles/storylines/missionOverview/missionSpawnSummary';
import { buildMissionOverlayContainer } from './missionOverlayGraphics';
import MissionSpawnPopover from './MissionSpawnPopover';

interface ViewState {
    preview: MissionPreview;
    camera: Camera;
}

const DEFAULT_LAYERS: ReadonlySet<MissionOverlayLayer> = new Set(['triggerZones', 'objectiveAreas']);

function toHex(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * The mission's real map (the battle renderer at tick 0), draggable and zoomable, with a darkness
 * toggle, zone overlay toggles and the spawn / trigger popover.
 */
export default function MissionMapView({ mission }: { mission: IBaseMissionDef }) {
    // One renderer for the panel's lifetime; missions swap terrain and engine (same pattern as the
    // Ability Test scenario preview).
    const [renderer] = useState(() => new GameRenderer());
    const [view, setView] = useState<ViewState | null>(null);
    const [lightOn, setLightOn] = useState(true);
    const [layers, setLayers] = useState<ReadonlySet<MissionOverlayLayer>>(DEFAULT_LAYERS);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const spawnsButtonRef = useRef<HTMLButtonElement>(null);
    const missionHasDarkness = mission.lightLevelEnabled ?? true;

    // Build the preview in an effect so StrictMode's double-invoke gets a fresh engine each time.
    useEffect(() => {
        const preview = buildMissionPreviewEngine(mission);
        const grid = preview.terrainManager.grid;
        renderer.setTerrain(preview.terrainManager);
        const camera = new Camera(800, 600, grid.worldWidth, grid.worldHeight);
        const player = preview.engine.getLocalPlayerUnit();
        camera.snapTo(player?.x ?? grid.worldWidth / 2, player?.y ?? grid.worldHeight / 2);
        camera.setZoomLevel(Camera.ZOOM_LEVELS[0]);
        setView({ preview, camera });
        return () => {
            setView(null);
            renderer.unbindFromEngine(preview.engine);
            preview.engine.destroy();
        };
    }, [mission, renderer]);

    useEffect(() => {
        renderer.setMissionLightConfig(missionHasDarkness && lightOn, mission.globalLightLevel ?? 0);
    }, [renderer, missionHasDarkness, lightOn, mission.globalLightLevel, view]);

    const shapes = useMemo(
        () => (view ? collectMissionOverlayShapes(mission, { pois: view.preview.engine.mapPOIs, zones: view.preview.engine.mapZones }) : []),
        [mission, view],
    );

    useEffect(() => {
        if (!view) return;
        const overlay = buildMissionOverlayContainer(shapes, layers);
        renderer.setWorldOverlay(overlay);
        return () => {
            renderer.setWorldOverlay(null);
            overlay.destroy({ children: true });
        };
    }, [renderer, view, shapes, layers]);

    const startingUnits = useMemo<StartingUnitInput[]>(() => {
        if (!view) return [];
        return view.preview.engine
            .getUnits()
            .filter((u) => u.teamId !== 'player' && u.ownerId !== MISSION_PREVIEW_PLAYER_ID)
            .map((u) => ({
                characterId: u.characterId,
                name: u.name,
                teamId: u.teamId,
                baseHp: u.maxHp,
                stackSize: u.stackSize,
                abilities: u.abilities,
            }));
    }, [view]);

    const toggleLayer = (id: MissionOverlayLayer) =>
        setLayers((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const layerCounts = useMemo(() => {
        const counts = new Map<MissionOverlayLayer, number>();
        for (const s of shapes) counts.set(s.layer, (counts.get(s.layer) ?? 0) + 1);
        return counts;
    }, [shapes]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-border-custom px-3 py-2">
                <button
                    type="button"
                    disabled={!missionHasDarkness}
                    onClick={() => setLightOn((v) => !v)}
                    aria-pressed={missionHasDarkness && lightOn}
                    title={missionHasDarkness ? 'Show or hide the darkness layer (what the players can see lit)' : 'This mission has no darkness'}
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                        missionHasDarkness && lightOn
                            ? 'border-primary bg-surface-light text-white'
                            : 'border-border-custom text-gray-300 hover:bg-surface-light'
                    }`}
                >
                    {missionHasDarkness && lightOn ? <Moon size={14} /> : <Sun size={14} />}
                    {missionHasDarkness ? `Light layer: ${lightOn ? 'on' : 'off'}` : 'No darkness'}
                </button>
                <span className="mx-1 h-5 w-px bg-border-custom" />
                {MISSION_OVERLAY_LAYERS.map((layer) => {
                    const on = layers.has(layer.id);
                    const count = layerCounts.get(layer.id) ?? 0;
                    return (
                        <label
                            key={layer.id}
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors ${
                                on ? 'border-border-custom bg-surface-light text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
                            } ${count === 0 ? 'opacity-50' : ''}`}
                        >
                            <input type="checkbox" checked={on} onChange={() => toggleLayer(layer.id)} className="sr-only" />
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: toHex(layer.color), opacity: on ? 1 : 0.4 }} />
                            {layer.label}
                            <span className="tabular-nums text-muted">{count}</span>
                        </label>
                    );
                })}
                <button
                    ref={spawnsButtonRef}
                    type="button"
                    onClick={() => setPopoverOpen((v) => !v)}
                    aria-expanded={popoverOpen}
                    className="ml-auto inline-flex items-center gap-1.5 rounded border border-primary px-2 py-1 text-xs font-semibold text-primary hover:bg-surface-light"
                >
                    <ListTree size={14} />
                    Spawns &amp; triggers
                </button>
            </div>
            <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                {view ? (
                    <BattleCanvas engine={view.preview.engine} camera={view.camera} renderer={renderer} followLocalPlayer={false} />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-muted">Building map…</div>
                )}
                <p className="pointer-events-none absolute bottom-2 left-3 rounded bg-black/60 px-2 py-0.5 text-[11px] text-gray-300">
                    Drag to pan · scroll to zoom · the map is at tick 0
                </p>
            </div>
            {popoverOpen && (
                <MissionSpawnPopover
                    mission={mission}
                    startingUnits={startingUnits}
                    anchorRef={spawnsButtonRef}
                    onClose={() => setPopoverOpen(false)}
                />
            )}
        </div>
    );
}

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEditorState } from './useEditorState';
import SegmentSelector from './SegmentSelector';
import TerrainCanvas from './TerrainCanvas';
import ToolPicker from './ToolPicker';
import TerrainTypePicker from './TerrainTypePicker';
import BrushSizePicker from './BrushSizePicker';
import POIEditor from './POIEditor';
import ZoneShapePicker from './ZoneShapePicker';
import ZoneEditor from './ZoneEditor';
import AdjacentPreviewCanvas from './AdjacentPreviewCanvas';
import { EDITOR_CELL_SIZE } from './terrainEditorColors';
import type { MapSegmentData } from '../../../games/minion_battles/terrain/segmentSchema';
import { TerrainType } from '../../../games/minion_battles/terrain/TerrainType';
import PanelLayout from '../PanelLayout';

type RightTab = 'poi' | 'zone';
type CreateDir = 'north' | 'south' | 'east' | 'west';

const PREVIEW_DEPTH = 2;
const PREVIEW_GAP = 8;

function ChevronUp() {
    return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
    );
}
function ChevronDown() {
    return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
    );
}
function ChevronLeft() {
    return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
    );
}
function ChevronRight() {
    return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
    );
}

export default function TerrainEditorTab() {
    const { state, actions } = useEditorState();
    const [searchParams, setSearchParams] = useSearchParams();
    const [availableSegments, setAvailableSegments] = useState<Map<string, MapSegmentData>>(new Map());
    const [rightTab, setRightTab] = useState<RightTab>('poi');
    const [createDir, setCreateDir] = useState<CreateDir | null>(null);
    const [createName, setCreateName] = useState('');
    const createInputRef = useRef<HTMLInputElement>(null);
    const saveSegmentRef = useRef<() => Promise<void>>(async () => {});

    const adjacentSegments = useMemo(() => {
        if (!state.segmentData) return { north: null, south: null, east: null, west: null };
        const { gridCol, gridRow } = state.segmentData;
        const find = (dCol: number, dRow: number): MapSegmentData | null => {
            for (const seg of availableSegments.values()) {
                if (seg.gridCol === gridCol + dCol && seg.gridRow === gridRow + dRow) return seg;
            }
            return null;
        };
        return { north: find(0, -1), south: find(0, 1), west: find(-1, 0), east: find(1, 0) };
    }, [state.segmentData, availableSegments]);

    saveSegmentRef.current = saveSegment;

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                void saveSegmentRef.current();
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    function loadAndTrackSegment(data: MapSegmentData) {
        actions.loadSegment(data);
        setSearchParams((prev) => { prev.set('segment', data.id); return prev; }, { replace: true });
    }

    function guardedLoadSegment(data: MapSegmentData) {
        if (state.isDirty && !window.confirm('There are unsaved changes. Discard them and switch maps?')) return;
        loadAndTrackSegment(data);
    }

    const createCoords = useMemo(() => {
        if (!createDir || !state.segmentData) return null;
        const { gridCol, gridRow } = state.segmentData;
        switch (createDir) {
            case 'north': return { col: gridCol,     row: gridRow - 1 };
            case 'south': return { col: gridCol,     row: gridRow + 1 };
            case 'west':  return { col: gridCol - 1, row: gridRow     };
            case 'east':  return { col: gridCol + 1, row: gridRow     };
        }
    }, [createDir, state.segmentData]);

    useEffect(() => {
        if (createDir) createInputRef.current?.focus();
    }, [createDir]);

    async function createAndLoadMap() {
        if (!createCoords || !createName.trim() || !state.segmentData) return;
        if (state.isDirty && !window.confirm('There are unsaved changes. Discard them and create the new map?')) return;
        const { col, row } = createCoords;
        const name = createName.trim();
        const id = `${col}_${row}_${name}`;
        const { width, height } = state.segmentData;
        const newSegment: MapSegmentData = {
            id,
            gridCol: col,
            gridRow: row,
            width,
            height,
            terrain: Array.from({ length: height }, () => Array<number>(width).fill(TerrainType.Grass)),
            pointsOfInterest: [],
            zones: [],
        };
        try {
            const response = await fetch(`/api/terrain-segments/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSegment),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            setAvailableSegments(prev => {
                const next = new Map(prev);
                next.set(id, newSegment);
                return next;
            });
            loadAndTrackSegment(newSegment);
            setCreateDir(null);
            setCreateName('');
        } catch (err) {
            console.error('Failed to create segment:', err);
        }
    }

    async function saveSegment() {
        if (!state.segmentData) return;
        actions.setSaveStatus('saving');
        try {
            const response = await fetch(`/api/terrain-segments/${state.segmentData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state.segmentData),
            });
            const json = await response.json().catch(() => null);
            console.log('[TerrainEditor] Save response:', response.status, json);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
            actions.setSaveStatus('saved');
            actions.clearDirty();
            const saved = state.segmentData;
            setAvailableSegments(prev => {
                const next = new Map(prev);
                next.set(saved.id, saved);
                return next;
            });
            setTimeout(() => actions.setSaveStatus('idle'), 2000);
        } catch (err) {
            console.error('Failed to save segment:', err);
            actions.setSaveStatus('error');
        }
    }

    const saveButtonLabel = state.isDirty ? 'Save●' : 'Save';
    const saveButtonClass = state.isDirty
        ? 'px-3 py-1.5 rounded text-sm font-medium bg-primary text-white transition-colors disabled:opacity-50'
        : 'px-3 py-1.5 rounded text-sm font-medium bg-surface border border-border-custom text-muted transition-colors disabled:opacity-50';
    const isSaveDisabled = state.saveStatus === 'saving' || !state.segmentData;

    const S = EDITOR_CELL_SIZE;
    const mainWidth = state.segmentData?.width ?? 0;
    const mainHeight = state.segmentData?.height ?? 0;
    const prevPx = PREVIEW_DEPTH * S;

    return (
        <>
            <PanelLayout
                title="Terrain Editor"
                actions={
                    <>
                        <SegmentSelector
                            selectedId={state.segmentId}
                            onSelect={guardedLoadSegment}
                            defaultId={searchParams.get('segment') ?? '50_50_crystal_cave'}
                            onSegmentsChange={setAvailableSegments}
                        />
                        {state.saveStatus === 'saving' && (
                            <span className="text-sm text-muted">Saving...</span>
                        )}
                        {state.saveStatus === 'saved' && (
                            <span className="text-sm text-green-400">Saved ✓</span>
                        )}
                        {state.saveStatus === 'error' && (
                            <span className="text-sm text-red-400">Save failed</span>
                        )}
                        <button
                            className={saveButtonClass}
                            disabled={isSaveDisabled}
                            onClick={() => { void saveSegment(); }}
                        >
                            {saveButtonLabel}
                        </button>
                    </>
                }
                left={
                    <div className="flex flex-col gap-4 p-3">
                        <ToolPicker
                            activeTool={state.activeTool}
                            onSelect={actions.setTool}
                        />
                        {state.activeTool === 'terrain_paint' && (
                            <>
                                <TerrainTypePicker
                                    selectedType={state.selectedTerrainType}
                                    onSelect={actions.setTerrainType}
                                />
                                <BrushSizePicker
                                    brushSize={state.brushSize}
                                    onChange={actions.setBrushSize}
                                />
                            </>
                        )}
                        {state.activeTool === 'zone' && (
                            <ZoneShapePicker
                                activeShape={state.activeZoneShape}
                                onSelect={actions.setZoneShape}
                            />
                        )}
                    </div>
                }
                leftWidth="w-40"
                leftClassName="overflow-y-auto"
                center={
                    state.segmentData ? (
                        <div className="flex flex-col items-center justify-start p-3">
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: `${prevPx}px ${mainWidth * S}px ${prevPx}px`,
                                gridTemplateRows: `${prevPx}px ${mainHeight * S}px ${prevPx}px`,
                                gap: `${PREVIEW_GAP}px`,
                            }}>
                                <div className="rounded-sm bg-zinc-900" />
                                <AdjacentPreviewCanvas
                                    segment={adjacentSegments.north}
                                    direction="north"
                                    mainWidth={mainWidth}
                                    mainHeight={mainHeight}
                                    onClick={adjacentSegments.north ? () => guardedLoadSegment(adjacentSegments.north!) : null}
                                    onCreateMap={adjacentSegments.north ? undefined : () => setCreateDir('north')}
                                    icon={<ChevronUp />}
                                />
                                <div className="rounded-sm bg-zinc-900" />
                                <AdjacentPreviewCanvas
                                    segment={adjacentSegments.west}
                                    direction="west"
                                    mainWidth={mainWidth}
                                    mainHeight={mainHeight}
                                    onClick={adjacentSegments.west ? () => guardedLoadSegment(adjacentSegments.west!) : null}
                                    onCreateMap={adjacentSegments.west ? undefined : () => setCreateDir('west')}
                                    icon={<ChevronLeft />}
                                />
                                <TerrainCanvas
                                    state={state}
                                    actions={{
                                        setHoveredCell: actions.setHoveredCell,
                                        paintCells: actions.paintCells,
                                        addPOI: actions.addPOI,
                                        selectPOI: actions.selectPOI,
                                        addZone: actions.addZone,
                                    }}
                                />
                                <AdjacentPreviewCanvas
                                    segment={adjacentSegments.east}
                                    direction="east"
                                    mainWidth={mainWidth}
                                    mainHeight={mainHeight}
                                    onClick={adjacentSegments.east ? () => guardedLoadSegment(adjacentSegments.east!) : null}
                                    onCreateMap={adjacentSegments.east ? undefined : () => setCreateDir('east')}
                                    icon={<ChevronRight />}
                                />
                                <div className="rounded-sm bg-zinc-900" />
                                <AdjacentPreviewCanvas
                                    segment={adjacentSegments.south}
                                    direction="south"
                                    mainWidth={mainWidth}
                                    mainHeight={mainHeight}
                                    onClick={adjacentSegments.south ? () => guardedLoadSegment(adjacentSegments.south!) : null}
                                    onCreateMap={adjacentSegments.south ? undefined : () => setCreateDir('south')}
                                    icon={<ChevronDown />}
                                />
                                <div className="rounded-sm bg-zinc-900" />
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-64 text-muted">
                            No segment loaded
                        </div>
                    )
                }
                centerClassName="overflow-auto"
                right={
                    <>
                        <div className="flex shrink-0 border-b border-border-custom">
                            <button
                                type="button"
                                className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                                    rightTab === 'poi'
                                        ? 'text-primary border-primary'
                                        : 'text-muted border-transparent hover:text-white'
                                }`}
                                onClick={() => setRightTab('poi')}
                            >
                                Points of Interest
                            </button>
                            <button
                                type="button"
                                className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                                    rightTab === 'zone'
                                        ? 'text-primary border-primary'
                                        : 'text-muted border-transparent hover:text-white'
                                }`}
                                onClick={() => setRightTab('zone')}
                            >
                                Zones
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                            {rightTab === 'poi' && (
                                <>
                                    {state.selectedPOIId && (
                                        <div className="border-b border-border-custom pb-3">
                                            <POIEditor
                                                section="properties"
                                                pointsOfInterest={state.segmentData?.pointsOfInterest ?? []}
                                                selectedPOIId={state.selectedPOIId}
                                                onSelect={actions.selectPOI}
                                                onUpdate={actions.updatePOI}
                                                onDelete={actions.deletePOI}
                                                showPOIs={state.showPOIs}
                                                onTogglePOIs={actions.togglePOIs}
                                            />
                                        </div>
                                    )}
                                    <POIEditor
                                        section="list"
                                        pointsOfInterest={state.segmentData?.pointsOfInterest ?? []}
                                        selectedPOIId={state.selectedPOIId}
                                        onSelect={actions.selectPOI}
                                        onUpdate={actions.updatePOI}
                                        onDelete={actions.deletePOI}
                                        showPOIs={state.showPOIs}
                                        onTogglePOIs={actions.togglePOIs}
                                    />
                                </>
                            )}
                            {rightTab === 'zone' && (
                                <>
                                    {state.selectedZoneId && (
                                        <div className="border-b border-border-custom pb-3">
                                            <ZoneEditor
                                                section="properties"
                                                zones={state.segmentData?.zones ?? []}
                                                selectedZoneId={state.selectedZoneId}
                                                onSelect={actions.selectZone}
                                                onUpdate={actions.updateZone}
                                                onDelete={actions.deleteZone}
                                                showZones={state.showZones}
                                                onToggleZones={actions.toggleZones}
                                            />
                                        </div>
                                    )}
                                    <ZoneEditor
                                        section="list"
                                        zones={state.segmentData?.zones ?? []}
                                        selectedZoneId={state.selectedZoneId}
                                        onSelect={actions.selectZone}
                                        onUpdate={actions.updateZone}
                                        onDelete={actions.deleteZone}
                                        showZones={state.showZones}
                                        onToggleZones={actions.toggleZones}
                                    />
                                </>
                            )}
                        </div>
                    </>
                }
                rightWidth="w-56"
                rightClassName="flex flex-col overflow-hidden"
            />

            {createCoords && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={(e) => { if (e.target === e.currentTarget) { setCreateDir(null); setCreateName(''); } }}
                >
                    <div className="bg-surface border border-border-custom rounded-lg p-6 w-96 shadow-xl">
                        <h3 className="text-white font-semibold mb-2">Create New Terrain Map</h3>
                        <p className="text-muted text-sm mb-4">
                            This will create a new terrain map. Please give it a name.
                        </p>
                        <div className="flex items-center gap-1 mb-4">
                            <span className="text-muted text-sm font-mono shrink-0">
                                {createCoords.col}_{createCoords.row}_
                            </span>
                            <input
                                ref={createInputRef}
                                className="flex-1 min-w-0 bg-zinc-800 border border-border-custom rounded px-2 py-1 text-white text-sm font-mono focus:outline-none focus:border-primary"
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void createAndLoadMap();
                                    if (e.key === 'Escape') { setCreateDir(null); setCreateName(''); }
                                }}
                                placeholder="map_name"
                            />
                            <span className="text-muted text-sm font-mono shrink-0">.json</span>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                className="px-3 py-1.5 rounded text-sm text-muted border border-border-custom hover:text-white transition-colors"
                                onClick={() => { setCreateDir(null); setCreateName(''); }}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-3 py-1.5 rounded text-sm bg-primary text-white font-medium disabled:opacity-50 transition-colors"
                                disabled={!createName.trim()}
                                onClick={() => { void createAndLoadMap(); }}
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

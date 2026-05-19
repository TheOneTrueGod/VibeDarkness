import React, { useState } from 'react';
import { useEditorState } from './useEditorState';
import SegmentSelector from './SegmentSelector';
import TerrainCanvas from './TerrainCanvas';
import ToolPicker from './ToolPicker';
import TerrainTypePicker from './TerrainTypePicker';
import BrushSizePicker from './BrushSizePicker';
import POIEditor from './POIEditor';
import type { MapSegmentData } from '../../games/minion_battles/terrain/segmentSchema';

type RightTab = 'poi';

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
    const [availableSegments, setAvailableSegments] = useState<Map<string, MapSegmentData>>(new Map());
    const [rightTab, setRightTab] = useState<RightTab>('poi');

    function getAdjacentSegment(dCol: number, dRow: number): MapSegmentData | null {
        if (!state.segmentData) return null;
        const { gridCol, gridRow } = state.segmentData;
        const targetCol = gridCol + dCol;
        const targetRow = gridRow + dRow;
        for (const seg of availableSegments.values()) {
            if (seg.gridCol === targetCol && seg.gridRow === targetRow) return seg;
        }
        return null;
    }

    function NavButton({
        dCol,
        dRow,
        icon,
        className,
    }: {
        dCol: number;
        dRow: number;
        icon: React.ReactNode;
        className?: string;
    }) {
        const target = getAdjacentSegment(dCol, dRow);
        return (
            <button
                type="button"
                className={`flex w-full h-full items-center justify-center transition-colors ${
                    target
                        ? 'text-zinc-400 hover:text-white hover:bg-surface-light cursor-pointer'
                        : 'text-zinc-800 cursor-not-allowed'
                } ${className ?? ''}`}
                disabled={!target}
                onClick={() => target && actions.loadSegment(target)}
                title={target ? `Load ${target.id}` : 'No adjacent segment'}
            >
                {icon}
            </button>
        );
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
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            actions.setSaveStatus('saved');
            actions.clearDirty();
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

    return (
        <div className="flex flex-col h-full bg-surface">
            {/* Header */}
            <div className="flex items-center gap-3 p-3 border-b border-border-custom">
                <SegmentSelector
                    selectedId={state.segmentId}
                    onSelect={actions.loadSegment}
                    defaultId="50_50_crystal_cave"
                    onSegmentsChange={setAvailableSegments}
                />
                <div className="flex-1" />
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
            </div>

            {/* Main body */}
            <div className="flex flex-1 min-h-0 overflow-auto">
                {/* Left sidebar */}
                <div className="flex flex-col gap-4 p-3 border-r border-border-custom bg-surface w-40 shrink-0">
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
                </div>

                {/* Center: canvas with nav buttons + properties at bottom */}
                <div className="flex flex-col flex-1 items-center">
                    {/*
                     * Nav layout: left/right buttons are fixed-width columns outside
                     * the canvas; they use self-stretch so they span the full canvas height.
                     * The canvas is never clipped — the outer body scrolls if needed.
                     *
                     *  [left-col: spacer | Left | spacer]
                     *  [center-col: Up | Canvas | Down]
                     *  [right-col: spacer | Right | spacer]
                     */}
                    <div className="flex">
                        {/* Left nav column */}
                        <div className="w-12 shrink-0 self-stretch flex flex-col">
                            <div className="h-12 shrink-0" />
                            <div className="flex-1">
                                <NavButton dCol={-1} dRow={0} icon={<ChevronLeft />} />
                            </div>
                            <div className="h-12 shrink-0" />
                        </div>

                        {/* Center: up + canvas (always full size) + down */}
                        <div className="flex flex-col">
                            <div className="h-12">
                                <NavButton dCol={0} dRow={-1} icon={<ChevronUp />} />
                            </div>
                            <div className="p-3">
                                <TerrainCanvas
                                    state={state}
                                    actions={{
                                        setHoveredCell: actions.setHoveredCell,
                                        paintCells: actions.paintCells,
                                        addPOI: actions.addPOI,
                                        selectPOI: actions.selectPOI,
                                    }}
                                />
                            </div>
                            <div className="h-12">
                                <NavButton dCol={0} dRow={1} icon={<ChevronDown />} />
                            </div>
                        </div>

                        {/* Right nav column */}
                        <div className="w-12 shrink-0 self-stretch flex flex-col">
                            <div className="h-12 shrink-0" />
                            <div className="flex-1">
                                <NavButton dCol={1} dRow={0} icon={<ChevronRight />} />
                            </div>
                            <div className="h-12 shrink-0" />
                        </div>
                    </div>

                </div>

                {/* Right sidebar: tabbed POI list */}
                <div className="flex flex-col w-56 shrink-0 border-l border-border-custom bg-surface">
                    {/* Tab bar */}
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
                    </div>
                    {/* Tab content */}
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
                    </div>
                </div>
            </div>
        </div>
    );
}

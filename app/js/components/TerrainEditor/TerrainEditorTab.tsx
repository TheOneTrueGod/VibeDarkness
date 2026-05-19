import React from 'react';
import { useEditorState } from './useEditorState';
import SegmentSelector from './SegmentSelector';
import TerrainCanvas from './TerrainCanvas';
import ToolPicker from './ToolPicker';
import TerrainTypePicker from './TerrainTypePicker';
import BrushSizePicker from './BrushSizePicker';
import POIEditor from './POIEditor';

export default function TerrainEditorTab() {
    const { state, actions } = useEditorState();

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
            <div className="flex flex-1 overflow-hidden">
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

                {/* Right: canvas + POI panel */}
                <div className="flex flex-col flex-1 overflow-auto">
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
                    <div className="border-t border-border-custom p-3">
                        <POIEditor
                            pointsOfInterest={state.segmentData?.pointsOfInterest ?? []}
                            selectedPOIId={state.selectedPOIId}
                            onSelect={actions.selectPOI}
                            onUpdate={actions.updatePOI}
                            onDelete={actions.deletePOI}
                            showPOIs={state.showPOIs}
                            onTogglePOIs={actions.togglePOIs}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

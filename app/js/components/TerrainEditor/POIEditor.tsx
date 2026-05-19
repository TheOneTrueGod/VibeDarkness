import React from 'react';
import { MapSegmentPOI, POI_TYPES, POIType } from '../../games/minion_battles/terrain/segmentSchema';
import { POI_STYLES } from './terrainEditorColors';

interface POIEditorProps {
    pointsOfInterest: MapSegmentPOI[];
    selectedPOIId: string | null;
    onSelect: (id: string) => void;
    onUpdate: (poi: MapSegmentPOI) => void;
    onDelete: (id: string) => void;
    showPOIs: boolean;
    onTogglePOIs: () => void;
}

export default function POIEditor({
    pointsOfInterest,
    selectedPOIId,
    onSelect,
    onUpdate,
    onDelete,
    showPOIs,
    onTogglePOIs,
}: POIEditorProps) {
    const selectedPOI = pointsOfInterest.find((p) => p.id === selectedPOIId) ?? null;

    function handleFieldChange(field: keyof MapSegmentPOI, value: string | number) {
        if (!selectedPOI) return;
        onUpdate({ ...selectedPOI, [field]: value });
    }

    return (
        <div className="flex flex-col gap-2">
            {/* Header */}
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Points of Interest</span>
                <button
                    onClick={onTogglePOIs}
                    className="px-2 py-1 rounded text-xs border border-border-custom bg-surface text-muted hover:border-primary hover:text-white transition-colors"
                >
                    {showPOIs ? 'Hide POIs' : 'Show POIs'}
                </button>
            </div>

            {/* POI list */}
            {pointsOfInterest.length === 0 ? (
                <div className="text-muted text-sm">No POIs. Use the POI tool to add one.</div>
            ) : (
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                    {pointsOfInterest.map((poi) => {
                        const isSelected = poi.id === selectedPOIId;
                        const style = POI_STYLES[poi.type];
                        return (
                            <div
                                key={poi.id}
                                onClick={() => onSelect(poi.id)}
                                className={[
                                    'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
                                    isSelected
                                        ? 'bg-surface-light border-l-2 border-primary'
                                        : 'bg-surface hover:bg-surface-light border-l-2 border-transparent',
                                ].join(' ')}
                            >
                                {/* Colored dot */}
                                <span
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: style.color }}
                                />
                                {/* Label */}
                                <span className="text-sm text-white flex-1 truncate">
                                    {poi.label || <span className="text-muted italic">Unnamed</span>}
                                </span>
                                {/* Delete button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(poi.id);
                                    }}
                                    className="text-muted hover:text-white text-sm leading-none px-1 flex-shrink-0"
                                    title="Delete POI"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Edit form for selected POI */}
            {selectedPOI && (
                <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-border-custom">
                    {/* Label */}
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted">Label</span>
                        <input
                            type="text"
                            value={selectedPOI.label}
                            onChange={(e) => handleFieldChange('label', e.target.value)}
                            className="w-full px-2 py-1 rounded bg-surface border border-border-custom text-white text-sm focus:outline-none focus:border-primary"
                        />
                    </label>

                    {/* Type */}
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted">Type</span>
                        <select
                            value={selectedPOI.type}
                            onChange={(e) => handleFieldChange('type', e.target.value as POIType)}
                            className="w-full px-2 py-1 rounded bg-surface border border-border-custom text-white text-sm focus:outline-none focus:border-primary"
                        >
                            {POI_TYPES.map((t) => (
                                <option key={t} value={t}>
                                    {POI_STYLES[t].label}
                                </option>
                            ))}
                        </select>
                    </label>

                    {/* Radius */}
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted">Radius (optional)</span>
                        <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={selectedPOI.radius ?? ''}
                            onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                    const { radius: _r, ...rest } = selectedPOI;
                                    onUpdate(rest as MapSegmentPOI);
                                } else {
                                    handleFieldChange('radius', parseFloat(raw));
                                }
                            }}
                            className="w-full px-2 py-1 rounded bg-surface border border-border-custom text-white text-sm focus:outline-none focus:border-primary"
                            placeholder="None"
                        />
                    </label>

                    {/* Row / Col (read-only) */}
                    <div className="flex gap-2">
                        <div className="flex flex-col gap-1 flex-1">
                            <span className="text-xs text-muted">Col</span>
                            <div className="px-2 py-1 rounded bg-surface border border-border-custom text-muted text-sm">
                                {selectedPOI.col}
                            </div>
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <span className="text-xs text-muted">Row</span>
                            <div className="px-2 py-1 rounded bg-surface border border-border-custom text-muted text-sm">
                                {selectedPOI.row}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

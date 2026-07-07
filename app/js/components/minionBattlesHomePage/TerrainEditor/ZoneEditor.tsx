import React from 'react';
import { MapSegmentZone, ZONE_SHAPES, ZoneShape } from '../../../games/minion_battles/terrain/segmentSchema';

interface ZoneEditorProps {
    zones: MapSegmentZone[];
    selectedZoneId: string | null;
    onSelect: (id: string) => void;
    onUpdate: (zone: MapSegmentZone) => void;
    onDelete: (id: string) => void;
    showZones: boolean;
    onToggleZones: () => void;
    /** Which section to render. Defaults to 'all'. */
    section?: 'list' | 'properties' | 'all';
}

export default function ZoneEditor({
    zones,
    selectedZoneId,
    onSelect,
    onUpdate,
    onDelete,
    showZones,
    onToggleZones,
    section = 'all',
}: ZoneEditorProps) {
    const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

    function handleIdChange(newId: string) {
        if (!selectedZone) return;
        onUpdate({ ...selectedZone, id: newId });
    }

    function handleShapeChange(shape: ZoneShape) {
        if (!selectedZone) return;
        onUpdate({ ...selectedZone, shape });
    }

    const showList = section === 'list' || section === 'all';
    const showProperties = section === 'properties' || section === 'all';

    return (
        <div className="flex flex-col gap-2">
            {/* Zone list section */}
            {showList && (
                <>
                    <div className="flex items-center justify-between">
                        <button
                            onClick={onToggleZones}
                            className="px-2 py-1 rounded text-xs border border-border-custom bg-surface text-muted hover:border-primary hover:text-white transition-colors"
                        >
                            {showZones ? 'Hide Zones' : 'Show Zones'}
                        </button>
                    </div>

                    {zones.length === 0 ? (
                        <div className="text-muted text-sm">No zones. Use the Zone tool to drag one out.</div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {zones.map((zone) => {
                                const isSelected = zone.id === selectedZoneId;
                                return (
                                    <div
                                        key={zone.id}
                                        onClick={() => onSelect(zone.id)}
                                        className={[
                                            'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
                                            isSelected
                                                ? 'bg-surface-light border-l-2 border-primary'
                                                : 'bg-surface hover:bg-surface-light border-l-2 border-transparent',
                                        ].join(' ')}
                                    >
                                        <span className="text-sm text-white flex-1 truncate">{zone.id}</span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(zone.id);
                                            }}
                                            className="text-muted hover:text-white text-sm leading-none px-1 flex-shrink-0"
                                            title="Delete zone"
                                        >
                                            ×
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* Properties editor section */}
            {showProperties && selectedZone && (
                <div className={`flex flex-col gap-2 ${showList ? 'mt-1 pt-2 border-t border-border-custom' : ''}`}>
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">
                        {selectedZone.id}
                    </span>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted">Id</span>
                        <input
                            type="text"
                            value={selectedZone.id}
                            onChange={(e) => handleIdChange(e.target.value)}
                            className="w-full px-2 py-1 rounded bg-surface border border-border-custom text-white text-sm focus:outline-none focus:border-primary"
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted">Shape</span>
                        <select
                            value={selectedZone.shape}
                            onChange={(e) => handleShapeChange(e.target.value as ZoneShape)}
                            className="w-full px-2 py-1 rounded bg-surface border border-border-custom text-white text-sm focus:outline-none focus:border-primary"
                        >
                            {ZONE_SHAPES.map((shape) => (
                                <option key={shape} value={shape}>
                                    {shape}
                                </option>
                            ))}
                        </select>
                    </label>

                    <div className="flex gap-2">
                        <div className="flex flex-col gap-1 flex-1">
                            <span className="text-xs text-muted">Top Left</span>
                            <div className="px-2 py-1 rounded bg-surface border border-border-custom text-muted text-sm">
                                {selectedZone.topLeft.col}, {selectedZone.topLeft.row}
                            </div>
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <span className="text-xs text-muted">Bottom Right</span>
                            <div className="px-2 py-1 rounded bg-surface border border-border-custom text-muted text-sm">
                                {selectedZone.bottomRight.col}, {selectedZone.bottomRight.row}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showProperties && !selectedZone && (
                <div className="text-muted text-sm italic">No zone selected.</div>
            )}
        </div>
    );
}

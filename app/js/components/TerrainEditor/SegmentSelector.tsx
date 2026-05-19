import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapSegmentData } from '../../games/minion_battles/terrain/segmentSchema';
import { listSegments } from '../../games/minion_battles/terrain/segmentRegistry';

interface SegmentSelectorProps {
    selectedId: string | null;
    onSelect: (data: MapSegmentData) => void;
    defaultId?: string;
    onSegmentsChange?: (segments: Map<string, MapSegmentData>) => void;
}

export default function SegmentSelector({ selectedId, onSelect, defaultId, onSegmentsChange }: SegmentSelectorProps) {
    const [apiSegments, setApiSegments] = useState<MapSegmentData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function fetchApiSegments() {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/terrain-segments');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const json = await response.json();
            setApiSegments((json as { segments: MapSegmentData[] }).segments ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch segments');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchApiSegments();
    }, []);

    const registrySegments = useMemo(() => listSegments(), []);
    const merged = useMemo(() => {
        const map = new Map<string, MapSegmentData>();
        for (const seg of registrySegments) map.set(seg.id, seg);
        for (const seg of apiSegments) map.set(seg.id, seg);
        return map;
    }, [registrySegments, apiSegments]);

    const allSegments = useMemo(() => Array.from(merged.values()), [merged]);

    const onSelectRef = useRef(onSelect);
    useEffect(() => { onSelectRef.current = onSelect; });

    // Auto-select default segment once segments are available and nothing is selected.
    // Runs on registry segments immediately, but if the API later provides an updated
    // version of the currently-loaded segment, reload it so saved changes are reflected.
    const hasAutoSelected = useRef(false);
    useEffect(() => {
        if (defaultId == null) return;
        const seg = merged.get(defaultId);
        if (!seg) return;
        if (selectedId == null && !hasAutoSelected.current) {
            // Initial load from registry
            hasAutoSelected.current = true;
            onSelectRef.current(seg);
        } else if (selectedId === defaultId && apiSegments.length > 0) {
            // API fetch just completed — reload with the API version if one exists
            const apiSeg = apiSegments.find((s) => s.id === defaultId);
            if (apiSeg) onSelectRef.current(apiSeg);
        }
    }, [merged, apiSegments, selectedId, defaultId]);

    // Notify parent when segment list changes
    const onSegmentsChangeRef = useRef(onSegmentsChange);
    useEffect(() => { onSegmentsChangeRef.current = onSegmentsChange; });
    useEffect(() => {
        onSegmentsChangeRef.current?.(merged);
    }, [merged]);

    function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const id = e.target.value;
        const seg = merged.get(id);
        if (seg) {
            onSelect(seg);
        }
    }

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <select
                    value={selectedId ?? ''}
                    onChange={handleChange}
                    disabled={isLoading}
                    className="flex-1 px-2 py-1.5 rounded bg-surface border border-border-custom text-white text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                >
                    <option value="" disabled>
                        {isLoading ? 'Loading…' : allSegments.length === 0 ? 'No segments' : 'Select segment…'}
                    </option>
                    {allSegments.map((seg) => (
                        <option key={seg.id} value={seg.id}>
                            {seg.id}
                        </option>
                    ))}
                </select>

                <button
                    onClick={fetchApiSegments}
                    disabled={isLoading}
                    title="Refresh segment list"
                    className="px-2 py-1.5 rounded bg-surface border border-border-custom text-muted text-sm hover:border-primary hover:text-white transition-colors disabled:opacity-50"
                >
                    {isLoading ? '…' : '↺'}
                </button>
            </div>

            {error && (
                <div className="text-xs text-red-400">
                    Error: {error}. Showing local segments only.
                </div>
            )}
        </div>
    );
}

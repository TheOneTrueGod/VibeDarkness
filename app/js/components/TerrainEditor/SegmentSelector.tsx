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
    const [apiSegments, setApiSegments] = useState<MapSegmentData[] | null>(null); // null = not yet fetched
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    async function fetchApiSegments() {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/terrain-segments');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const json = await response.json();
            const fetched = (json as { segments: MapSegmentData[] }).segments ?? [];
            console.log('[SegmentSelector] API segments:', fetched.map((s) => s.id));
            setApiSegments(fetched);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch segments');
            setApiSegments([]); // unblock auto-select even on error
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchApiSegments();
    }, []);

    const registrySegments = useMemo(() => {
        const segs = listSegments();
        console.log('[SegmentSelector] Registry segments:', segs.map((s) => s.id));
        return segs;
    }, []);

    // Both sources ready once the API fetch has returned (success or error).
    const bothReady = apiSegments !== null;

    const merged = useMemo(() => {
        const map = new Map<string, MapSegmentData>();
        for (const seg of registrySegments) map.set(seg.id, seg);
        for (const seg of apiSegments ?? []) map.set(seg.id, seg); // API wins on collision
        return map;
    }, [registrySegments, apiSegments]);

    const allSegments = useMemo(() => Array.from(merged.values()), [merged]);

    const selectedSource = useMemo<'json' | 'js' | null>(() => {
        if (!selectedId || apiSegments === null) return null;
        if (apiSegments.some((s) => s.id === selectedId)) return 'json';
        if (registrySegments.some((s) => s.id === selectedId)) return 'js';
        return null;
    }, [selectedId, apiSegments, registrySegments]);

    const onSelectRef = useRef(onSelect);
    useEffect(() => { onSelectRef.current = onSelect; });

    // Auto-select only after both sources are ready so the API version is preferred.
    const hasAutoSelected = useRef(false);
    useEffect(() => {
        if (!bothReady || hasAutoSelected.current || selectedId != null || defaultId == null) return;
        const seg = merged.get(defaultId);
        if (seg) {
            hasAutoSelected.current = true;
            console.log('[SegmentSelector] Auto-selecting:', seg.id, '| source:', apiSegments?.find((s) => s.id === seg.id) ? 'API' : 'registry');
            onSelectRef.current(seg);
        }
    }, [bothReady, merged, selectedId, defaultId]);

    // Notify parent when segment list changes.
    const onSegmentsChangeRef = useRef(onSegmentsChange);
    useEffect(() => { onSegmentsChangeRef.current = onSegmentsChange; });
    useEffect(() => {
        onSegmentsChangeRef.current?.(merged);
    }, [merged]);

    function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const seg = merged.get(e.target.value);
        if (seg) onSelect(seg);
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

                {selectedSource && (
                    <span
                        title={selectedSource === 'json' ? 'Loaded from JSON file' : 'Loaded from JS registry'}
                        className={`px-1.5 py-0.5 rounded text-xs font-mono font-semibold ${
                            selectedSource === 'json'
                                ? 'bg-cyan-900 text-cyan-300 border border-cyan-700'
                                : 'bg-yellow-900 text-yellow-300 border border-yellow-700'
                        }`}
                    >
                        {selectedSource}
                    </span>
                )}
            </div>

            {error && (
                <div className="text-xs text-red-400">
                    Error: {error}. Showing local segments only.
                </div>
            )}
        </div>
    );
}

import React, { useEffect, useState } from 'react';
import { MapSegmentData } from '../../games/minion_battles/terrain/segmentSchema';
import { listSegments } from '../../games/minion_battles/terrain/segmentRegistry';

interface SegmentSelectorProps {
    selectedId: string | null;
    onSelect: (data: MapSegmentData) => void;
}

export default function SegmentSelector({ selectedId, onSelect }: SegmentSelectorProps) {
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

    // Merge registry + API segments; API wins on collision.
    const registrySegments = listSegments();
    const merged = new Map<string, MapSegmentData>();
    for (const seg of registrySegments) {
        merged.set(seg.id, seg);
    }
    for (const seg of apiSegments) {
        merged.set(seg.id, seg);
    }
    const allSegments = Array.from(merged.values());

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

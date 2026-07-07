import React from 'react';
import { ZONE_SHAPES, ZoneShape } from '../../../games/minion_battles/terrain/segmentSchema';

interface ZoneShapePickerProps {
    activeShape: ZoneShape;
    onSelect: (shape: ZoneShape) => void;
}

const SHAPE_LABELS: Record<ZoneShape, { icon: string; label: string }> = {
    box: { icon: '▭', label: 'Box' },
    circle: { icon: '◯', label: 'Circle' },
};

export default function ZoneShapePicker({ activeShape, onSelect }: ZoneShapePickerProps) {
    return (
        <div className="flex flex-col gap-2">
            {ZONE_SHAPES.map((shape) => {
                const isActive = activeShape === shape;
                const { icon, label } = SHAPE_LABELS[shape];
                return (
                    <button
                        key={shape}
                        onClick={() => onSelect(shape)}
                        className={[
                            'w-full flex items-center gap-2 px-3 py-2 rounded text-sm font-medium border-2 transition-colors',
                            isActive
                                ? 'border-primary bg-surface-light text-white'
                                : 'border-border-custom bg-surface text-muted hover:border-primary hover:text-white',
                        ].join(' ')}
                    >
                        <span className="text-base leading-none">{icon}</span>
                        <span>{label}</span>
                    </button>
                );
            })}
        </div>
    );
}

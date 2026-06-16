import React from 'react';

interface BrushSizePickerProps {
    brushSize: 1 | 2 | 3 | 4 | 5 | 7;
    onChange: (size: 1 | 2 | 3 | 4 | 5 | 7) => void;
}

const BRUSH_OPTIONS: { size: 1 | 2 | 3 | 4 | 5 | 7; label: string }[] = [
    { size: 1, label: '1×1' },
    { size: 2, label: '2×2' },
    { size: 3, label: '3×3' },
    { size: 4, label: '4×4' },
    { size: 5, label: '5×5' },
    { size: 7, label: '7×7' },
];

export default function BrushSizePicker({ brushSize, onChange }: BrushSizePickerProps) {
    return (
        <div className="grid grid-cols-2 gap-1">
            {BRUSH_OPTIONS.map(({ size, label }) => {
                const isActive = brushSize === size;
                return (
                    <button
                        key={size}
                        onClick={() => onChange(size)}
                        className={[
                            'px-2 py-1.5 rounded text-sm font-medium transition-colors',
                            isActive
                                ? 'bg-primary text-white'
                                : 'bg-surface border border-border-custom text-muted hover:border-primary',
                        ].join(' ')}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

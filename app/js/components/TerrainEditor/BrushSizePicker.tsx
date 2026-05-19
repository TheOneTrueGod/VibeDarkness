import React from 'react';

interface BrushSizePickerProps {
    brushSize: 1 | 2 | 3;
    onChange: (size: 1 | 2 | 3) => void;
}

const BRUSH_OPTIONS: { size: 1 | 2 | 3; label: string }[] = [
    { size: 1, label: '1×1' },
    { size: 2, label: '3×3' },
    { size: 3, label: '5×5' },
];

export default function BrushSizePicker({ brushSize, onChange }: BrushSizePickerProps) {
    return (
        <div className="flex flex-row gap-1">
            {BRUSH_OPTIONS.map(({ size, label }) => {
                const isActive = brushSize === size;
                return (
                    <button
                        key={size}
                        onClick={() => onChange(size)}
                        className={[
                            'px-3 py-1.5 rounded text-sm font-medium transition-colors',
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

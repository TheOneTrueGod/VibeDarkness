import React from 'react';

interface ToolPickerProps {
    activeTool: 'terrain_paint' | 'poi';
    onSelect: (tool: 'terrain_paint' | 'poi') => void;
}

export default function ToolPicker({ activeTool, onSelect }: ToolPickerProps) {
    const tools: { id: 'terrain_paint' | 'poi'; icon: string; label: string }[] = [
        { id: 'terrain_paint', icon: '▪', label: 'Paint' },
        { id: 'poi', icon: '◉', label: 'POI' },
    ];

    return (
        <div className="flex flex-col gap-2">
            {tools.map(({ id, icon, label }) => {
                const isActive = activeTool === id;
                return (
                    <button
                        key={id}
                        onClick={() => onSelect(id)}
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

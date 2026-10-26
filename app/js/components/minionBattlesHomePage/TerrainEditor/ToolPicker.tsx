import React from 'react';
import { EditorTool } from './useEditorState';

interface ToolPickerProps {
    activeTool: EditorTool;
    onSelect: (tool: EditorTool) => void;
}

const tools: { id: EditorTool; icon: string; label: string }[] = [
    { id: 'terrain_paint', icon: '▪', label: 'Paint' },
    { id: 'fill', icon: '■', label: 'Fill' },
    { id: 'ellipse', icon: '●', label: 'Ellipse' },
    { id: 'road', icon: '╱', label: 'Road' },
    { id: 'curve', icon: '∿', label: 'Curved Road' },
    { id: 'poi', icon: '◉', label: 'POI' },
    { id: 'zone', icon: '▭', label: 'Zone' },
];

export default function ToolPicker({ activeTool, onSelect }: ToolPickerProps) {
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

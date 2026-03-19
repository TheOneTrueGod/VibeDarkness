import React from 'react';

interface DebugOnOffButtonProps {
    enabled: boolean;
    onToggle: () => void;
    onLabel: string;
    offLabel: string;
}

export default function DebugOnOffButton({ enabled, onToggle, onLabel, offLabel }: DebugOnOffButtonProps) {
    return (
        <button
            type="button"
            className={`px-3 py-1.5 text-xs rounded border border-border-custom ${
                enabled ? 'bg-primary/20 text-primary border-primary/50' : 'bg-surface-light text-white hover:bg-border-custom'
            }`}
            onClick={onToggle}
        >
            {enabled ? onLabel : offLabel}
        </button>
    );
}


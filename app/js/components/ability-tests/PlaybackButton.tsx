import React from 'react';

export function PlaybackButton({
    icon: Icon,
    title,
    onClick,
    disabled = false,
    invisible = false,
}: {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    title: string;
    onClick: () => void;
    disabled?: boolean;
    invisible?: boolean;
}) {
    return (
        <button
            type="button"
            className={`w-7 h-7 rounded border border-border-custom flex items-center justify-center transition-colors ${
                invisible
                    ? 'opacity-0 pointer-events-none'
                    : disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-surface-light text-primary'
            }`}
            title={title}
            onClick={onClick}
            disabled={disabled || invisible}
            aria-label={title}
        >
            <Icon size={14} />
        </button>
    );
}

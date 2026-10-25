import React from 'react';
import { X } from 'lucide-react';

export default function MapTooltipCloseButton({
    onClick,
    testId,
    ariaLabel,
}: {
    onClick: () => void;
    testId: string;
    ariaLabel: string;
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            className="h-7 w-7 shrink-0 rounded border border-border-custom bg-surface-light text-white flex items-center justify-center hover:bg-border-custom cursor-pointer"
            aria-label={ariaLabel}
            title="Close"
        >
            <X className="h-3.5 w-3.5" aria-hidden />
        </button>
    );
}

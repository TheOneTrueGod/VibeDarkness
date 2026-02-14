/**
 * CardDescription - Overlay showing an ability's description.
 *
 * On desktop: shown on hover.
 * On mobile: shown as a full overlay with an X to dismiss.
 */

import React from 'react';

interface CardDescriptionProps {
    description: string;
    abilityName: string;
    /** Whether this is a mobile overlay (full-width with dismiss). */
    isMobileOverlay?: boolean;
    /** Called when the mobile overlay's X button is tapped. */
    onDismiss?: () => void;
}

export default function CardDescription({
    description,
    abilityName,
    isMobileOverlay = false,
    onDismiss,
}: CardDescriptionProps) {
    if (isMobileOverlay) {
        return (
            <div className="absolute inset-x-0 bottom-0 bg-dark-900/95 border-t border-dark-600 p-4 z-50">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-white font-bold text-sm">{abilityName}</h3>
                    <button
                        onClick={onDismiss}
                        className="text-muted hover:text-white text-lg leading-none px-1"
                    >
                        &times;
                    </button>
                </div>
                <p className="text-muted text-xs leading-relaxed">{description}</p>
            </div>
        );
    }

    // Desktop tooltip
    return (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-dark-900 border border-dark-600 rounded-lg p-3 shadow-lg pointer-events-none z-50">
            <h3 className="text-white font-bold text-xs mb-1">{abilityName}</h3>
            <p className="text-muted text-xs leading-relaxed">{description}</p>
        </div>
    );
}

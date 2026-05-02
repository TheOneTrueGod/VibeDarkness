import React from 'react';

interface StoryPanelCardProps {
    children: React.ReactNode;
    /** Override default full-bleed width (e.g. centered column for choices / votes). */
    maxWidthClassName?: string;
}

export default function StoryPanelCard({ children, maxWidthClassName }: StoryPanelCardProps) {
    return (
        <div
            className={`border-2 border-border-custom rounded-lg bg-surface-light shadow-lg overflow-hidden p-4 sm:p-6 w-full min-w-0 mx-auto ${maxWidthClassName ?? 'max-w-full'}`}
        >
            {children}
        </div>
    );
}

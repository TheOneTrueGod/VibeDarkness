/**
 * Visual novel style text box: bordered panel with distinct background and larger text.
 * Used for pre-mission story dialogue and choices.
 * Layout: title (speaker name), fixed-height scrollable body, optional actions overlaid bottom-right.
 */
import React from 'react';

export type VNTextBoxDensity = 'desktop' | 'laptop';

/** Fixed scroll body heights — stable panel size; laptop is taller (portrait moved beside the box). */
const BODY_HEIGHT: Record<VNTextBoxDensity, string> = {
    desktop: 'h-[7.75rem] sm:h-[9rem]',
    laptop: 'h-[11rem] sm:h-[12.5rem]',
};

const ACTION_BOTTOM_PADDING: Record<VNTextBoxDensity, string> = {
    desktop: 'pb-11 sm:pb-12',
    laptop: 'pb-12 sm:pb-14',
};

interface VNTextBoxProps {
    /** Optional speaker name shown above the main content, in the given colour */
    title?: string;
    titleColor?: string;
    children: React.ReactNode;
    /** Overlaid at bottom-right of the panel (e.g. Next); does not consume a full layout row */
    actions?: React.ReactNode;
    className?: string;
    /** `laptop`: taller body when portrait sits in a sidebar column */
    density?: VNTextBoxDensity;
}

export default function VNTextBox({
    title,
    titleColor,
    children,
    actions,
    className = '',
    density = 'desktop',
}: VNTextBoxProps) {
    const reserveSpaceForActions = actions != null;
    const bodyH = BODY_HEIGHT[density];
    const actionPad = ACTION_BOTTOM_PADDING[density];

    return (
        <div
            className={`relative border-2 border-border-custom rounded-lg bg-surface-light shadow-lg overflow-hidden w-full min-w-0 ${className}`}
        >
            <div className="px-4 pt-3 pb-3 sm:px-5 sm:pt-4 sm:pb-4">
                {title != null && title !== '' && (
                    <div
                        className="font-bold text-lg sm:text-xl mb-2 text-white shrink-0"
                        style={titleColor ? { color: titleColor } : undefined}
                    >
                        {title}
                    </div>
                )}
                <div
                    className={`text-white text-base sm:text-lg leading-relaxed whitespace-pre-line overflow-y-auto shrink-0 ${bodyH} ${
                        reserveSpaceForActions ? actionPad : ''
                    }`}
                >
                    {children}
                </div>
            </div>
            {actions != null && (
                <div className="absolute bottom-3 right-4 z-10 sm:bottom-4 sm:right-5">{actions}</div>
            )}
        </div>
    );
}

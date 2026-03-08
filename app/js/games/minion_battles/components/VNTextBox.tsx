/**
 * Visual novel style text box: bordered panel with distinct background and larger text.
 * Used for pre-mission story dialogue and choices.
 * Layout: title (narrator name), scrollable text area (4 lines), then optional actions (e.g. Next button) outside scroll.
 */
import React from 'react';

interface VNTextBoxProps {
    /** Optional speaker name shown above the main content, in the given colour */
    title?: string;
    titleColor?: string;
    children: React.ReactNode;
    /** Rendered below the text area, outside the scrollable region (e.g. Next button) */
    actions?: React.ReactNode;
    className?: string;
}

export default function VNTextBox({ title, titleColor, children, actions, className = '' }: VNTextBoxProps) {
    return (
        <div
            className={`border-2 border-border-custom rounded-lg bg-surface-light shadow-lg overflow-hidden min-h-[16rem] flex flex-col ${className}`}
        >
            <div className="p-6 flex-1 flex flex-col min-h-0">
                {title != null && title !== '' && (
                    <div
                        className="font-bold text-xl mb-3 text-white shrink-0"
                        style={titleColor ? { color: titleColor } : undefined}
                    >
                        {title}
                    </div>
                )}
                <div className="text-white text-lg leading-relaxed h-[7.5rem] overflow-y-auto shrink-0">
                    {children}
                </div>
                {actions != null && (
                    <div className="mt-4 shrink-0 flex justify-end">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
}

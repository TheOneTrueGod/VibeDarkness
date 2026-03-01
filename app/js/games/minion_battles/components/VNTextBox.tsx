/**
 * Visual novel style text box: bordered panel with distinct background and larger text.
 * Used for pre-mission story dialogue and choices.
 */
import React from 'react';

interface VNTextBoxProps {
    /** Optional speaker name shown above the main content, in the given colour */
    title?: string;
    titleColor?: string;
    children: React.ReactNode;
    className?: string;
}

export default function VNTextBox({ title, titleColor, children, className = '' }: VNTextBoxProps) {
    return (
        <div
            className={`border-2 border-border-custom rounded-lg bg-surface-light shadow-lg overflow-hidden ${className}`}
        >
            <div className="p-6">
                {title != null && title !== '' && (
                    <div
                        className="font-bold text-xl mb-3 text-white"
                        style={titleColor ? { color: titleColor } : undefined}
                    >
                        {title}
                    </div>
                )}
                <div className="text-white text-lg leading-relaxed">{children}</div>
            </div>
        </div>
    );
}

import React from 'react';

type DebugButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Shared "debug UI" button styling used throughout the debug console.
 * Keep it narrow and composable (pass through className/other props).
 */
export function DebugButton({ className = '', type = 'button', ...props }: DebugButtonProps) {
    return (
        <button
            type={type}
            className={`px-3 py-2 bg-surface-light border border-border-custom rounded text-sm hover:bg-border-custom transition-colors text-left ${className}`}
            {...props}
        />
    );
}


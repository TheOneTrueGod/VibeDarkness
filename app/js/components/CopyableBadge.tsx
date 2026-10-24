/**
 * Gray monospace badge that copies its value to the clipboard when clicked.
 */
import React, { useEffect, useRef, useState } from 'react';

interface CopyableBadgeProps {
    value: string;
    title: string;
    className?: string;
    'data-testid'?: string;
}

export default function CopyableBadge({ value, title, className = '', ...rest }: CopyableBadgeProps) {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    const handleClick = async () => {
        try {
            await navigator.clipboard.writeText(value);
        } catch {
            return;
        }
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1200);
    };

    return (
        <button
            type="button"
            data-testid={rest['data-testid']}
            title={copied ? 'Copied!' : `${title} (click to copy)`}
            onClick={handleClick}
            className={`px-2 py-1 bg-surface-light hover:bg-surface-light/80 rounded font-mono text-xs sm:text-sm shrink-0 cursor-pointer transition-colors ${className}`}
        >
            {copied ? 'Copied!' : value}
        </button>
    );
}

import React from 'react';

interface DebugJsonBlockProps {
    value: unknown;
    emptyText: string;
}

export default function DebugJsonBlock({ value, emptyText }: DebugJsonBlockProps) {
    return (
        <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
            <code>{value !== null ? JSON.stringify(value, null, 2) : emptyText}</code>
        </pre>
    );
}


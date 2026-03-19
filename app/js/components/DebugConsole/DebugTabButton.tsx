import React from 'react';

interface DebugTabButtonProps {
    isActive: boolean;
    isDisabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title?: string;
}

export default function DebugTabButton({ isActive, isDisabled = false, onClick, children, title }: DebugTabButtonProps) {
    const className = isDisabled && !isActive
        ? 'px-3 py-2 bg-transparent border-none border-b-2 text-sm cursor-pointer border-b-transparent text-muted opacity-60 hover:text-white'
        : isActive
          ? 'px-3 py-2 bg-transparent border-none border-b-2 text-sm cursor-pointer border-b-primary text-primary'
          : 'px-3 py-2 bg-transparent border-none border-b-2 text-sm cursor-pointer border-b-transparent text-muted hover:text-white';

    return (
        <button type="button" className={className} onClick={onClick} title={title}>
            {children}
        </button>
    );
}


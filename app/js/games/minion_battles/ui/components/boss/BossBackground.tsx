import React from 'react';

/** Thick-bordered black panel for arcade-style boss UI. */
export function BossBackground({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="w-full max-w-3xl rounded-sm border-4 border-gray-500 bg-black px-4 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.65)]"
            role="presentation"
        >
            {children}
        </div>
    );
}

/**
 * Resource display with crystal SVG pills
 */
import React from 'react';
import type { AccountState } from '../types';

const RESOURCE_ORDER: (keyof Pick<AccountState, 'fire' | 'water' | 'earth' | 'air'>)[] = [
    'fire',
    'water',
    'earth',
    'air',
];

const RESOURCE_COLORS: Record<string, string> = {
    fire: '#E74C3C',
    water: '#3498DB',
    earth: '#27AE60',
    air: '#9B59B6',
};

function CrystalSvg({ color }: { color: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="w-[18px] h-[18px] shrink-0"
            style={{ fill: color }}
        >
            <path d="M12 2L22 12L12 22L2 12Z" />
        </svg>
    );
}

interface ResourceDisplayProps {
    resources: AccountState;
}

export default function ResourceDisplay({ resources }: ResourceDisplayProps) {
    return (
        <div className="flex items-center gap-2" aria-label="Your resources">
            {RESOURCE_ORDER.map((key) => {
                const color = RESOURCE_COLORS[key] ?? '#888';
                return (
                    <span
                        key={key}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[13px] font-semibold bg-surface-light"
                        style={{ borderColor: color, color, border: `1px solid ${color}` }}
                        title={`${key.charAt(0).toUpperCase() + key.slice(1)}: ${resources[key]}`}
                    >
                        <CrystalSvg color={color} />
                        {resources[key]}
                    </span>
                );
            })}
        </div>
    );
}

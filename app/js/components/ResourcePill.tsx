/**
 * Single campaign resource: icon + count in a rounded pill with a thin solid border.
 */
import React from 'react';
import type { CampaignResourceKey } from '../types';

const RESOURCE_ORDER: CampaignResourceKey[] = ['food', 'metal', 'population', 'crystals'];

const RESOURCE_META: Record<
    CampaignResourceKey,
    { label: string; color: string; Icon: React.FC<{ color: string }> }
> = {
    food: { label: 'Food', color: '#E67E22', Icon: FoodIcon },
    metal: { label: 'Metal', color: '#95A5A6', Icon: MetalIcon },
    population: { label: 'Population', color: '#3498DB', Icon: PopulationIcon },
    crystals: { label: 'Crystals', color: '#9B59B6', Icon: CrystalIcon },
};

function FoodIcon({ color }: { color: string }) {
    return (
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" aria-hidden>
            <path
                fill={color}
                d="M12 2C8 6 6 10 6 14c0 3.3 2.7 6 6 6s6-2.7 6-6c0-4-2-8-6-12zm0 16c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
            />
        </svg>
    );
}

function MetalIcon({ color }: { color: string }) {
    return (
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" aria-hidden>
            <path
                fill={color}
                d="M4 18h16v2H4v-2zm2-2h12l1-8H5l1 8zm2-10h8l-1-4H9l-1 4z"
            />
        </svg>
    );
}

function PopulationIcon({ color }: { color: string }) {
    return (
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" aria-hidden>
            <path
                fill={color}
                d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.84 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
            />
        </svg>
    );
}

function CrystalIcon({ color }: { color: string }) {
    return (
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" aria-hidden>
            <path fill={color} d="M12 2L22 12L12 22L2 12Z" />
        </svg>
    );
}

export interface ResourcePillProps {
    resource: CampaignResourceKey;
    count: number;
    className?: string;
}

export default function ResourcePill({ resource, count, className = '' }: ResourcePillProps) {
    const meta = RESOURCE_META[resource];
    const { color, Icon, label } = meta;
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-semibold bg-surface-light ${className}`}
            style={{ borderWidth: 1, borderStyle: 'solid', borderColor: color, color }}
            title={`${count} ${label}`}
        >
            <Icon color={color} />
            {count}
        </span>
    );
}

/** Campaign resource keys in display order. */
export { RESOURCE_ORDER };

/** Non-zero entries from a reward delta, in canonical order. */
export function campaignResourceGains(
    delta: Partial<Record<CampaignResourceKey, number>> | undefined
): { resource: CampaignResourceKey; count: number }[] {
    if (!delta) return [];
    const out: { resource: CampaignResourceKey; count: number }[] = [];
    for (const key of RESOURCE_ORDER) {
        const n = delta[key];
        if (n != null && n > 0) {
            out.push({ resource: key, count: n });
        }
    }
    return out;
}

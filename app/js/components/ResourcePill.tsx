/**
 * Single campaign resource: icon + count in a rounded pill with a thin solid border.
 */
import React from 'react';
import { Heart } from 'lucide-react';
import type { CampaignResourceKey } from '../types';

export const EXHAUSTION_PILL_RED = '#ef4444';
export const EXHAUSTION_PILL_BACKGROUND = '#b91c1c';
export const ENDURANCE_PILL_BACKGROUND = '#000000';

function ExhaustionHeartIcon({ className = 'w-[18px] h-[18px]' }: { color?: string; className?: string }) {
    return (
        <Heart
            className={`${className} shrink-0`}
            fill="#000000"
            stroke="#ffffff"
            strokeWidth={2}
            aria-hidden
        />
    );
}

function EnduranceHeartIcon({ className = 'w-[18px] h-[18px]' }: { color?: string; className?: string }) {
    return (
        <Heart
            className={`${className} shrink-0`}
            fill={EXHAUSTION_PILL_RED}
            stroke={EXHAUSTION_PILL_RED}
            strokeWidth={2}
            aria-hidden
        />
    );
}

const RESOURCE_ORDER: CampaignResourceKey[] = ['food', 'metal', 'population', 'crystals', 'exhaustion'];

export const EXHAUSTION_TOOLTIP =
    'Exhaustion: Represents how tired this mission has left you. Based on the damage you\'ve taken.';

export const ENDURANCE_TOOLTIP =
    'Endurance: The most exhaustion this character can have.';

export const REMAINING_ENDURANCE_TOOLTIP =
    'Endurance: How much more exhaustion this character can take.';

const RESOURCE_META: Record<
    CampaignResourceKey,
    {
        label: string;
        color: string;
        Icon: React.FC<{ color: string; className?: string }>;
        backgroundColor?: string;
        textColor?: string;
        tooltip?: string;
    }
> = {
    food: { label: 'Food', color: '#E67E22', Icon: FoodIcon },
    metal: { label: 'Metal', color: '#95A5A6', Icon: MetalIcon },
    population: { label: 'Population', color: '#3498DB', Icon: PopulationIcon },
    crystals: { label: 'Crystals', color: '#9B59B6', Icon: CrystalIcon },
    exhaustion: {
        label: 'Exhaustion',
        color: EXHAUSTION_PILL_RED,
        backgroundColor: EXHAUSTION_PILL_BACKGROUND,
        textColor: '#ffffff',
        Icon: ExhaustionHeartIcon,
        tooltip: EXHAUSTION_TOOLTIP,
    },
};

function FoodIcon({ color, className = 'w-[18px] h-[18px]' }: { color: string; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={`${className} shrink-0`} aria-hidden>
            <path
                fill={color}
                d="M12 2C8 6 6 10 6 14c0 3.3 2.7 6 6 6s6-2.7 6-6c0-4-2-8-6-12zm0 16c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
            />
        </svg>
    );
}

function MetalIcon({ color, className = 'w-[18px] h-[18px]' }: { color: string; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={`${className} shrink-0`} aria-hidden>
            <path
                fill={color}
                d="M4 18h16v2H4v-2zm2-2h12l1-8H5l1 8zm2-10h8l-1-4H9l-1 4z"
            />
        </svg>
    );
}

function PopulationIcon({ color, className = 'w-[18px] h-[18px]' }: { color: string; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={`${className} shrink-0`} aria-hidden>
            <path
                fill={color}
                d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.84 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
            />
        </svg>
    );
}

function CrystalIcon({ color, className = 'w-[18px] h-[18px]' }: { color: string; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={`${className} shrink-0`} aria-hidden>
            <path fill={color} d="M12 2L22 12L12 22L2 12Z" />
        </svg>
    );
}

export const RESOURCE_PILL_SIZE_SMALL = 'small';
export const RESOURCE_PILL_SIZE_MEDIUM = 'medium';
export const RESOURCE_PILL_SIZE_DEFAULT = 'default';

export type ResourcePillSize =
    | typeof RESOURCE_PILL_SIZE_SMALL
    | typeof RESOURCE_PILL_SIZE_MEDIUM
    | typeof RESOURCE_PILL_SIZE_DEFAULT;

export const RESOURCE_PILL_SIZE_CLASS: Record<ResourcePillSize, { pill: string; icon: string }> = {
    [RESOURCE_PILL_SIZE_SMALL]: {
        pill: 'gap-1 rounded px-1.5 py-[2px] text-[10px]',
        icon: 'w-3 h-3',
    },
    [RESOURCE_PILL_SIZE_MEDIUM]: {
        pill: 'min-h-6 gap-1 rounded-md px-2 py-0.5 text-[11px]',
        icon: 'w-3.5 h-3.5',
    },
    [RESOURCE_PILL_SIZE_DEFAULT]: {
        pill: 'min-h-[32px] gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px]',
        icon: 'w-[18px] h-[18px]',
    },
};

export interface ResourcePillProps {
    resource: CampaignResourceKey;
    count: number;
    /** When set, the pill shows `count/max` (exhaustion over endurance). */
    max?: number;
    /** Upgrades remaining-endurance chrome: red heart on black (inverse of exhaustion). */
    appearance?: 'default' | 'endurance';
    size?: ResourcePillSize;
    className?: string;
}

export default function ResourcePill({
    resource,
    count,
    max,
    appearance = 'default',
    size = RESOURCE_PILL_SIZE_DEFAULT,
    className = '',
}: ResourcePillProps) {
    const meta = RESOURCE_META[resource];
    const showEndurance = appearance === 'endurance';
    const { color, Icon, label, backgroundColor, textColor, tooltip } = showEndurance
        ? {
              color: EXHAUSTION_PILL_RED,
              Icon: EnduranceHeartIcon,
              label: 'Endurance',
              backgroundColor: ENDURANCE_PILL_BACKGROUND,
              textColor: '#ffffff' as const,
              tooltip: REMAINING_ENDURANCE_TOOLTIP,
          }
        : meta;
    const isNegative = count < 0;
    const displayColor = isNegative ? '#f87171' : color;
    const sizeClass = RESOURCE_PILL_SIZE_CLASS[size];
    const filled = backgroundColor != null;
    return (
        <span
            className={`inline-flex shrink-0 items-center font-semibold leading-snug cursor-default select-none ${
                filled ? '' : 'bg-surface-light'
            } ${sizeClass.pill} ${className}`}
            style={{
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: displayColor,
                color: filled ? (textColor ?? '#ffffff') : displayColor,
                ...(filled ? { backgroundColor } : {}),
            }}
            title={
                showEndurance
                    ? tooltip
                    : max != null && resource === 'exhaustion'
                      ? `${EXHAUSTION_TOOLTIP} ${ENDURANCE_TOOLTIP}`
                      : (tooltip ?? `${count} ${label}`)
            }
        >
            <Icon color={displayColor} className={sizeClass.icon} />
            {max != null ? `${count}/${max}` : count}
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

/**
 * Single campaign resource: icon + count in a rounded pill with a thin solid border.
 */
import React from 'react';
import { Ham } from 'lucide-react';
import type { CampaignResourceKey } from '../types';
import { HUNGER_BAR_TOOLTIP } from '../games/minion_battles/character_defs/hungerHealth';
import { HUNGER_PER_MISSING_HP } from '../games/minion_battles/storylines/matchHunger';

/** Tailwind orange-500: the Hunger colour everywhere (pills, character bar). */
export const HUNGER_ORANGE = '#f97316';
export const HUNGER_BLACK = '#000000';

/** Hunger icon: `Ham` outlined in the given colour. */
function HungerIcon({ color, className = 'w-[18px] h-[18px]' }: { color: string; className?: string }) {
    return <Ham className={`${className} shrink-0`} stroke={color} strokeWidth={2} aria-hidden />;
}

const RESOURCE_ORDER: CampaignResourceKey[] = ['food', 'metal', 'population', 'crystals', 'hunger'];

/** HP of missing health that costs 1 Hunger at match end (derived from the loss rule). */
const HP_PER_HUNGER = 1 / HUNGER_PER_MISSING_HP;
export const HUNGER_LOSS_TOOLTIP = `Hunger lost.  ${HP_PER_HUNGER}HP = 1 Hunger`;
export const HUNGER_RECOVERY_TOOLTIP = 'Hunger recovered.';
export const MAX_HUNGER_TOOLTIP = 'Max Hunger: The most Hunger this character can store.';

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
    // Hunger chrome is sign-driven; see `hungerPillStyle`.
    hunger: { label: 'Hunger', color: HUNGER_ORANGE, Icon: HungerIcon },
};

export interface HungerPillStyle {
    color: string;
    backgroundColor: string;
    textColor: string;
    tooltip: string;
}

/**
 * Hunger pill chrome. Recovered (positive): solid orange, black icon + text.
 * Lost (negative): black, orange border + icon + text. `current` shows a remaining-Hunger value (black, orange).
 */
export function hungerPillStyle(count: number, current = false): HungerPillStyle {
    if (!current && count > 0) {
        return {
            color: HUNGER_BLACK,
            backgroundColor: HUNGER_ORANGE,
            textColor: HUNGER_BLACK,
            tooltip: HUNGER_RECOVERY_TOOLTIP,
        };
    }
    return {
        color: HUNGER_ORANGE,
        backgroundColor: HUNGER_BLACK,
        textColor: HUNGER_ORANGE,
        tooltip: current ? HUNGER_BAR_TOOLTIP : HUNGER_LOSS_TOOLTIP,
    };
}

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
    /** When set, the pill shows `count/max` (current Hunger over max Hunger). */
    max?: number;
    /** `'hunger'`: current-Hunger chrome (orange Ham on black) instead of the sign-driven gain/loss chrome. */
    appearance?: 'default' | 'hunger';
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
    const isHunger = resource === 'hunger';
    const { color, Icon, label, backgroundColor, textColor, tooltip } = isHunger
        ? { ...meta, ...hungerPillStyle(count, appearance === 'hunger') }
        : meta;
    const isNegative = count < 0;
    const displayColor = isNegative && !isHunger ? '#f87171' : color;
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
            title={tooltip ?? `${count} ${label}`}
        >
            <Icon color={displayColor} className={sizeClass.icon} />
            {max != null ? `${count}/${max}` : isHunger && count > 0 && appearance !== 'hunger' ? `+${count}` : count}
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
        // Hunger is signed: a negative delta is a loss that should still render (as a loss pill).
        if (n != null && (n > 0 || (key === 'hunger' && n < 0))) {
            out.push({ resource: key, count: n });
        }
    }
    return out;
}

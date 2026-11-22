/**
 * Single character value (Health, Attack, ...): icon + amount in the same chrome as `ResourcePill`.
 * Label, colour and kind come from `CHARACTER_STAT_DEFS`; icons live here.
 */
import React from 'react';
import { Heart, Sword } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { characterStatDef, formatStatPillText, type CharacterStatKey } from '../characterStats';
import {
    RESOURCE_PILL_SIZE_CLASS,
    RESOURCE_PILL_SIZE_SMALL,
    type ResourcePillSize,
} from './ResourcePill';

const STAT_ICONS: Record<CharacterStatKey, LucideIcon> = {
    health: Heart,
    attack: Sword,
};

export interface StatPillProps {
    stat: CharacterStatKey;
    /** Shown as given, e.g. `+20` or `3`. */
    amount: string | number;
    size?: ResourcePillSize;
    className?: string;
}

export default function StatPill({ stat, amount, size = RESOURCE_PILL_SIZE_SMALL, className = '' }: StatPillProps) {
    const def = characterStatDef(stat);
    const Icon = STAT_ICONS[stat];
    const sizeClass = RESOURCE_PILL_SIZE_CLASS[size];
    const text = String(amount);
    return (
        <span
            data-stat-kind={def.kind}
            className={`inline-flex shrink-0 items-center align-middle font-semibold leading-snug cursor-default select-none bg-surface-light ${sizeClass.pill} ${className}`}
            style={{ borderWidth: 1, borderStyle: 'solid', borderColor: def.color, color: def.color }}
            title={formatStatPillText(stat, text)}
        >
            <Icon className={`${sizeClass.icon} shrink-0`} stroke={def.color} strokeWidth={2} aria-hidden />
            {text}
        </span>
    );
}

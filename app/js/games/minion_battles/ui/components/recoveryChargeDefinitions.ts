import type { LucideIcon } from 'lucide-react';
import { Clock, Sun, Zap, ShieldAlert } from 'lucide-react';

import type { RecoveryChargeType } from '../../abilities/abilityUses';

export interface RecoveryChargeDefinition {
    /** Tailwind bg class applied to partial-fill animation inside the circle. */
    fillClass: string;
    /** Tailwind border class for the icon circle. */
    iconCircleBorderClass: string;
    /** Tailwind bg class for the circle when the pip is possessed. */
    possessedBgClass: string;
    Icon: LucideIcon;
    /** Icon colour when pip is missing (light icon on dark background). */
    iconClassName: string;
    /** Icon colour when pip is possessed (dark icon on light background). */
    darkIconClassName: string;
    strokeWidth: number;
    /** `title` / `aria-label` on recovery rule rows using this charge type. */
    rowExplanation: string;
    /** Hex colour for the main accent (icon, border, stroke) — the darker of the pair. */
    mainHex: number;
    /** Hex colour for the soft background — the lighter of the pair. */
    softHex: number;
}

export const RECOVERY_CHARGE_DEFINITIONS: Record<RecoveryChargeType, RecoveryChargeDefinition> = {
    staminaCharge: {
        fillClass: 'bg-amber-600',
        iconCircleBorderClass: 'border-amber-600',
        possessedBgClass: 'bg-white',
        Icon: Zap,
        iconClassName: 'text-amber-400',
        darkIconClassName: 'text-amber-600',
        strokeWidth: 2.25,
        rowExplanation: 'Stamina charges — gained from round-start surge and other effects; fill bars to recover uses.',
        mainHex: 0xd97706,
        softHex: 0xffffff,
    },
    lightCharge: {
        fillClass: 'bg-amber-700',
        iconCircleBorderClass: 'border-amber-700',
        possessedBgClass: 'bg-amber-50',
        Icon: Sun,
        iconClassName: 'text-yellow-300',
        darkIconClassName: 'text-amber-700',
        strokeWidth: 2.25,
        rowExplanation: 'Light charges — fill bars to recover uses.',
        mainHex: 0xb45309,
        softHex: 0xfffbeb,
    },
    energyCharge: {
        fillClass: 'bg-cyan-700',
        iconCircleBorderClass: 'border-cyan-700',
        possessedBgClass: 'bg-cyan-50',
        Icon: Zap,
        iconClassName: 'text-cyan-300',
        darkIconClassName: 'text-cyan-700',
        strokeWidth: 2.25,
        rowExplanation: 'Energy charges — fill bars to recover uses.',
        mainHex: 0x0e7490,
        softHex: 0xecfeff,
    },
    roundCharge: {
        fillClass: 'bg-gray-900',
        iconCircleBorderClass: 'border-gray-900',
        possessedBgClass: 'bg-white',
        Icon: Clock,
        iconClassName: 'text-white',
        darkIconClassName: 'text-gray-900',
        strokeWidth: 2.25,
        rowExplanation: 'Round charges — gain one at the start of each round while this card can recharge.',
        mainHex: 0x111827,
        softHex: 0xffffff,
    },
    commandCharge: {
        fillClass: 'bg-orange-600',
        iconCircleBorderClass: 'border-orange-600',
        possessedBgClass: 'bg-orange-50',
        Icon: ShieldAlert,
        iconClassName: 'text-orange-300',
        darkIconClassName: 'text-orange-700',
        strokeWidth: 2.25,
        rowExplanation: 'Command charges — restored when the player issues a command.',
        mainHex: 0xea580c,
        softHex: 0xfff7ed,
    },
};

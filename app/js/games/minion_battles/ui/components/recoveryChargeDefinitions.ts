import type { LucideIcon } from 'lucide-react';
import { Clock, Sun, Zap } from 'lucide-react';

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
}

export const RECOVERY_CHARGE_DEFINITIONS: Record<RecoveryChargeType, RecoveryChargeDefinition> = {
    staminaCharge: {
        fillClass: 'bg-gray-300',
        iconCircleBorderClass: 'border-gray-300',
        possessedBgClass: 'bg-gray-300',
        Icon: Zap,
        iconClassName: 'text-gray-300',
        darkIconClassName: 'text-gray-800',
        strokeWidth: 2.25,
        rowExplanation: 'Stamina charges — gained from round-start surge and other effects; fill bars to recover uses.',
    },
    lightCharge: {
        fillClass: 'bg-yellow-300',
        iconCircleBorderClass: 'border-yellow-300',
        possessedBgClass: 'bg-yellow-300',
        Icon: Sun,
        iconClassName: 'text-yellow-300',
        darkIconClassName: 'text-yellow-900',
        strokeWidth: 2.25,
        rowExplanation: 'Light charges — fill bars to recover uses.',
    },
    energyCharge: {
        fillClass: 'bg-cyan-300',
        iconCircleBorderClass: 'border-cyan-300',
        possessedBgClass: 'bg-cyan-300',
        Icon: Zap,
        iconClassName: 'text-cyan-300',
        darkIconClassName: 'text-cyan-900',
        strokeWidth: 2.25,
        rowExplanation: 'Energy charges — fill bars to recover uses.',
    },
    roundCharge: {
        fillClass: 'bg-white',
        iconCircleBorderClass: 'border-white',
        possessedBgClass: 'bg-white',
        Icon: Clock,
        iconClassName: 'text-white',
        darkIconClassName: 'text-gray-900',
        strokeWidth: 2.25,
        rowExplanation: 'Round charges — gain one at the start of each round while this card can recharge.',
    },
};

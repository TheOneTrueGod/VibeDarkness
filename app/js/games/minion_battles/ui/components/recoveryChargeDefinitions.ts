import type { LucideIcon } from 'lucide-react';
import { Clock, Footprints, Sun, Zap } from 'lucide-react';

import type { RecoveryChargeType } from '../../abilities/abilityUses';

export interface RecoveryChargeDefinition {
    /** Tailwind bg class applied to segment fill. */
    fillClass: string;
    Icon: LucideIcon;
    /** Classes for the lucide SVG (colour / opacity on the gauge). */
    iconClassName: string;
    strokeWidth: number;
    /** `title` / `aria-label` on recovery rule rows using this charge type. */
    rowExplanation: string;
}

export const RECOVERY_CHARGE_DEFINITIONS: Record<RecoveryChargeType, RecoveryChargeDefinition> = {
    staminaCharge: {
        fillClass: 'bg-gray-300',
        Icon: Footprints,
        iconClassName: 'text-dark-900 opacity-90',
        strokeWidth: 2.25,
        rowExplanation: 'Stamina charges — distributed from the round timer; fill bars to recover uses.',
    },
    lightCharge: {
        fillClass: 'bg-yellow-300',
        Icon: Sun,
        iconClassName: 'text-amber-950 opacity-95',
        strokeWidth: 2.25,
        rowExplanation: 'Light charges — fill bars to recover uses.',
    },
    energyCharge: {
        fillClass: 'bg-cyan-300',
        Icon: Zap,
        iconClassName: 'text-cyan-950 opacity-95',
        strokeWidth: 2.25,
        rowExplanation: 'Energy charges — fill bars to recover uses.',
    },
    roundCharge: {
        fillClass: 'bg-white',
        Icon: Clock,
        iconClassName: 'text-dark-900 opacity-90',
        strokeWidth: 2.25,
        rowExplanation: 'Round charges — gain one at the start of each round while this card can recharge.',
    },
};

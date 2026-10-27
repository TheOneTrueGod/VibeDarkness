import type { LucideIcon } from 'lucide-react';
import { Clock, Sun, Zap, ShieldAlert } from 'lucide-react';

import type { AbilityRecoveryRule, RecoveryChargeType } from '../../abilities/abilityUses';

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
    /** Player-facing name, e.g. `Stamina charge`. */
    displayName: string;
    /** Player-facing sentence on how this charge is gained (tooltips, "No uses remaining"). */
    howToGain: string;
    /** Hex colour for the main accent (icon, border, stroke) — the darker of the pair. */
    mainHex: number;
    /** Hex colour for the soft background — the lighter of the pair. */
    softHex: number;
}

export const RECOVERY_CHARGE_DEFINITIONS: Record<RecoveryChargeType, RecoveryChargeDefinition> = {
    staminaCharge: {
        displayName: 'Stamina charge',
        howToGain: 'You gain Stamina charges at the start of each round.',
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
        displayName: 'Light charge',
        howToGain: 'Gained from abilities that build Light charges.',
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
        displayName: 'Energy charge',
        howToGain: 'Gained from abilities that build Energy charges.',
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
        displayName: 'Round charge',
        howToGain: 'You gain one at the start of each round.',
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
        displayName: 'Command charge',
        howToGain: 'Gained when you issue a command.',
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

/** One sentence per recovery rule: how many uses a charge restores and how the charge is gained. */
export function describeAbilityRecovery(recoveries: readonly AbilityRecoveryRule[]): string {
    return recoveries
        .map((rule) => {
            const def = RECOVERY_CHARGE_DEFINITIONS[rule.chargeType];
            const uses = rule.usesRecovered === 1 ? '{1} use' : `{${rule.usesRecovered}} uses`;
            const charges =
                rule.chargesPerRecovery === 1
                    ? `each ${def.displayName}`
                    : `every {${rule.chargesPerRecovery}} ${def.displayName}s`;
            return `Recovers ${uses} for ${charges}. ${def.howToGain}`;
        })
        .join(' ');
}

/** Reminder card on ability tooltips explaining how the ability gets its uses back. */
export function recoveryGlossaryEntries(
    recoveries: readonly AbilityRecoveryRule[],
): { title: string; description: string }[] {
    if (recoveries.length === 0) return [];
    return [{ title: 'Recovery', description: describeAbilityRecovery(recoveries) }];
}

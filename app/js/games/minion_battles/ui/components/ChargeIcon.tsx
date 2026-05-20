/**
 * Recovery pip: a circular icon that is light-coloured (possessed) or dark (missing).
 * Partial fill animates inside the circle during charge transitions.
 */

import type { RecoveryChargeType } from '../../abilities/abilityUses';

import { RECOVERY_CHARGE_DEFINITIONS } from './recoveryChargeDefinitions';

export interface ChargeIconProps {
    chargeType: RecoveryChargeType;
    showFill: boolean;
    /** e.g. `opacity-100` vs `opacity-50` when at full uses. */
    fillOpacity: string;
    innerWidthPct: number;
    /** Left offset in px — positive = gap, negative = overlap with previous pip. */
    marginLeft?: number;
}

export function ChargeIcon({ chargeType, showFill, fillOpacity, innerWidthPct, marginLeft }: ChargeIconProps) {
    const def = RECOVERY_CHARGE_DEFINITIONS[chargeType];
    const { Icon } = def;
    const isPossessed = showFill && innerWidthPct >= 100;

    return (
        <span
            className={`relative flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border overflow-hidden p-[3px] pointer-events-none ${def.iconCircleBorderClass} ${
                isPossessed ? def.possessedBgClass : 'bg-black'
            } ${fillOpacity}`}
            style={marginLeft !== undefined ? { marginLeft } : undefined}
        >
            {showFill && !isPossessed && innerWidthPct > 0 && (
                <div
                    className={`absolute bottom-0 left-0 top-0 z-0 ${def.fillClass}`}
                    style={{ width: `${innerWidthPct}%` }}
                />
            )}
            <Icon
                className={`relative z-[1] h-3 w-3 ${isPossessed ? def.darkIconClassName : def.iconClassName}`}
                strokeWidth={def.strokeWidth}
                aria-hidden
            />
        </span>
    );
}

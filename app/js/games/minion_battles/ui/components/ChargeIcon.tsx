/**
 * Recovery segment gauge: clipped fill track + centred Lucide icon from {@link RECOVERY_CHARGE_DEFINITIONS}.
 */

import type { RecoveryChargeType } from '../../abilities/abilityUses';

import { RECOVERY_CHARGE_DEFINITIONS } from './recoveryChargeDefinitions';

export interface ChargeIconProps {
    chargeType: RecoveryChargeType;
    showFill: boolean;
    /** e.g. `opacity-100` vs `opacity-50` when at full uses. */
    fillOpacity: string;
    innerWidthPct: number;
}

export function ChargeIcon({ chargeType, showFill, fillOpacity, innerWidthPct }: ChargeIconProps) {
    const def = RECOVERY_CHARGE_DEFINITIONS[chargeType];
    const { Icon } = def;

    return (
        <div className="relative flex min-h-[14px] max-w-[40px] flex-1 shrink-0 items-center justify-center overflow-visible">
            <div className="absolute inset-x-0 top-1/2 h-2 w-full -translate-y-1/2 overflow-hidden rounded-[2px] border border-gray-600 bg-gray-800">
                <div
                    className={`absolute bottom-0 left-0 top-0 rounded-[1px] ${
                        showFill ? `${def.fillClass} ${fillOpacity}` : 'bg-transparent'
                    }`}
                    style={{ width: `${innerWidthPct}%` }}
                />
            </div>
            <Icon
                className={`relative z-[2] h-3.5 w-3.5 shrink-0 pointer-events-none ${def.iconClassName}`}
                strokeWidth={def.strokeWidth}
                aria-hidden
            />
        </div>
    );
}

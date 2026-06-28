/**
 * ResourceCostIcon — circular icon badge for displaying a resource cost on ability cards.
 * Style matches the ChargeIcon "recovery pip" pattern: circular border, solid background,
 * icon in the resource's primary colour. If amount > 1, a count circle appears below.
 */

import { Footprints, type LucideIcon } from 'lucide-react';

interface ResourceCostDisplay {
    icon: LucideIcon;
    borderClass: string;
    iconClass: string;
}

const RESOURCE_COST_DISPLAY: Record<string, ResourceCostDisplay> = {
    movement: {
        icon: Footprints,
        borderClass: 'border-green-500',
        iconClass: 'text-green-400',
    },
};

interface ResourceCostIconProps {
    resourceId: string;
    amount: number;
}

export function ResourceCostIcon({ resourceId, amount }: ResourceCostIconProps) {
    const display = RESOURCE_COST_DISPLAY[resourceId];
    if (!display) return null;
    const { icon: Icon, borderClass, iconClass } = display;

    return (
        <div className="flex flex-col items-center gap-0.5">
            <span
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border bg-black ${borderClass}`}
            >
                <Icon className={`h-3 w-3 ${iconClass}`} strokeWidth={2} aria-hidden />
            </span>
            {amount > 1 && (
                <span
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border bg-black text-[10px] font-bold ${borderClass} ${iconClass}`}
                >
                    {amount}
                </span>
            )}
        </div>
    );
}

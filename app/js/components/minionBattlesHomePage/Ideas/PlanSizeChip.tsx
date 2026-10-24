import React from 'react';
import { PLAN_SIZE_LABELS, type PlanSize } from './plansData';

export const PLAN_SIZE_CHIP_CLASSES: Record<PlanSize, string> = {
    sm: 'border-green-500/60 bg-green-900/40 text-green-300',
    md: 'border-amber-500/60 bg-amber-900/40 text-amber-300',
    lg: 'border-red-500/60 bg-red-900/40 text-red-300',
};

const SIZE_TITLES: Record<PlanSize, string> = {
    sm: 'Small: low complexity',
    md: 'Medium: medium complexity',
    lg: 'Large: large complexity',
};

/** T-shirt size badge (Sm / Md / Lg) for a plan item, coloured by effort. */
export default function PlanSizeChip({ size }: { size: PlanSize }) {
    return (
        <span
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${PLAN_SIZE_CHIP_CLASSES[size]}`}
            title={SIZE_TITLES[size]}
        >
            {PLAN_SIZE_LABELS[size]}
        </span>
    );
}

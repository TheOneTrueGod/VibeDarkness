import React from 'react';
import { PLAN_SIZES, PLAN_SIZE_LABELS, type PlanFilters, type PlanSize } from './plansData';
import { PLAN_SIZE_CHIP_CLASSES } from './PlanSizeChip';

const TOGGLE_BASE = 'rounded border px-2 py-0.5 text-xs font-semibold transition-colors';
const TOGGLE_OFF = 'border-border-custom text-muted line-through hover:text-white';

/** Plan filters: hide done items, and show or hide each T-shirt size. */
export default function PlanFilterBar({
    filters,
    onChange,
    hiddenCount,
}: {
    filters: PlanFilters;
    onChange: (filters: PlanFilters) => void;
    hiddenCount: number;
}) {
    const toggleSize = (size: PlanSize) => {
        const hidden = filters.hiddenSizes.includes(size);
        onChange({
            ...filters,
            hiddenSizes: hidden ? filters.hiddenSizes.filter((s) => s !== size) : [...filters.hiddenSizes, size],
        });
    };

    return (
        <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-muted -mr-1">Filters:</span>
            <button
                type="button"
                aria-pressed={filters.hideDone}
                onClick={() => onChange({ ...filters, hideDone: !filters.hideDone })}
                className={`${TOGGLE_BASE} ${
                    filters.hideDone ? 'border-primary bg-surface-light text-white' : 'border-border-custom text-gray-300 hover:text-white'
                }`}
            >
                Hide done
            </button>
            <div className="flex items-center gap-1" role="group" aria-label="Sizes shown">
                <span className="text-muted mr-1">Sizes</span>
                {PLAN_SIZES.map((size) => {
                    const shown = !filters.hiddenSizes.includes(size);
                    return (
                        <button
                            key={size}
                            type="button"
                            aria-pressed={shown}
                            title={shown ? `Hide ${PLAN_SIZE_LABELS[size]} items` : `Show ${PLAN_SIZE_LABELS[size]} items`}
                            onClick={() => toggleSize(size)}
                            className={`${TOGGLE_BASE} ${shown ? PLAN_SIZE_CHIP_CLASSES[size] : TOGGLE_OFF}`}
                        >
                            {PLAN_SIZE_LABELS[size]}
                        </button>
                    );
                })}
            </div>
            {hiddenCount > 0 && (
                <span className="text-muted">
                    {hiddenCount} {hiddenCount === 1 ? 'item' : 'items'} hidden
                </span>
            )}
        </div>
    );
}

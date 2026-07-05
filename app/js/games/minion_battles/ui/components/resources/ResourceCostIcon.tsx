/**
 * ResourceCostIcon — shows the cost of an ability in resource tokens.
 *
 * Renders up to {@link RESOURCE_COST_STACKED_ICON_MAX} overlapping ResourceIcon discs
 * (right-to-left stacking). Higher costs use a compact pill: `10x <icon>`.
 */

import { ALL_RESOURCE_DISPLAY_DEFS } from '../../../resources/resourceDisplayDefs';
import { ResourceIcon } from './ResourceIcon';

/** Costs above this use the compact pill instead of repeated stacked icons. */
export const RESOURCE_COST_STACKED_ICON_MAX = 4;

const RESOURCE_DEF_BY_ID = Object.fromEntries(
    ALL_RESOURCE_DISPLAY_DEFS.map((d) => [d.id, d]),
);

interface ResourceCostIconProps {
    resourceId: string;
    amount: number;
}

export function ResourceCostIcon({ resourceId, amount }: ResourceCostIconProps) {
    if (amount <= 0) return null;

    if (amount > RESOURCE_COST_STACKED_ICON_MAX) {
        const def = RESOURCE_DEF_BY_ID[resourceId];
        const color = def?.color ?? '#e5e7eb';
        return (
            <span
                className="inline-flex shrink-0 items-center gap-0.5 rounded border bg-neutral-900/90 px-1 py-0.5 text-[10px] font-semibold tabular-nums leading-none"
                style={{ borderColor: color, color }}
                title={def ? `${amount} ${def.name}` : `${amount}`}
            >
                <span>{amount}x</span>
                <ResourceIcon resourceId={resourceId} size={14} />
            </span>
        );
    }

    return (
        <div className="flex">
            {Array.from({ length: amount }).map((_, i) => (
                <ResourceIcon
                    key={i}
                    resourceId={resourceId}
                    size={22}
                    style={{ marginLeft: i === 0 ? 0 : -8, zIndex: amount - i }}
                />
            ))}
        </div>
    );
}

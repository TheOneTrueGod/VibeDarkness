/**
 * ResourceCostIcon — shows the cost of an ability in resource tokens.
 *
 * Renders `amount` overlapping ResourceIcon discs, right-to-left stacking
 * so the first disc sits on top. Used in the top-right corner of AbilitySlot cards.
 */

import { ResourceIcon } from './ResourceIcon';

interface ResourceCostIconProps {
    resourceId: string;
    amount: number;
}

export function ResourceCostIcon({ resourceId, amount }: ResourceCostIconProps) {
    if (amount <= 0) return null;
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

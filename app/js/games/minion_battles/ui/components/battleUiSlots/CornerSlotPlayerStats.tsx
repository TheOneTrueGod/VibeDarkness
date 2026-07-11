/**
 * CornerSlotPlayerStats - the Bottom-Left Corner slot's content: portrait, HP, and resource bars
 * for the player's active unit. Thin wrapper around UnitResourcePanel.
 */
import React from 'react';
import type { Unit } from '../../../game/units/Unit';
import { UnitResourcePanel } from '../resources/UnitResourcePanel';

interface CornerSlotPlayerStatsProps {
    unit: Unit | null;
}

export default function CornerSlotPlayerStats({ unit }: CornerSlotPlayerStatsProps) {
    return (
        <div className="flex h-full w-full items-start">
            <UnitResourcePanel unit={unit} />
        </div>
    );
}

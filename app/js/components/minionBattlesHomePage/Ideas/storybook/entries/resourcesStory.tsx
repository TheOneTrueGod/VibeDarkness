import React from 'react';
import type { ResourceDisplay } from '../../../../../games/minion_battles/resources/Resource';
import { ALL_RESOURCE_DISPLAY_DEFS } from '../../../../../games/minion_battles/resources/resourceDisplayDefs';
import { ResourceCostIcon } from '../../../../../games/minion_battles/ui/components/resources/ResourceCostIcon';
import { ResourceBarRow } from '../../../../../games/minion_battles/ui/components/resources/ResourceBarRow';
import { HealthSegmentBar } from '../../../../../games/minion_battles/ui/components/resources/HealthSegmentBar';
import {
    controlNumber,
    controlString,
    matchesSearch,
    type StorybookControlValues,
    type StorybookEntry,
} from '../storybookTypes';

type ResourceDef = (typeof ALL_RESOURCE_DISPLAY_DEFS)[number];

/** Bar fills per column; each column stacks its fills vertically to save width. */
const FILL_COLUMNS: readonly (readonly number[])[] = [
    [0, 33],
    [66, 100],
];

/**
 * The bar a resource uses in battle. HP draws as the segmented health bar under the portrait, and
 * Shield as that bar's overlay; every other resource is a `ResourceBarRow` in the unit panel.
 */
function ResourceBarAtFill({ def, fillPct }: { def: ResourceDef; fillPct: number }) {
    const current = Math.round((fillPct / 100) * def.max);
    if (def.id === 'hp') {
        return (
            <div className="w-[100px]">
                <HealthSegmentBar hp={current} maxHp={def.max} />
            </div>
        );
    }
    if (def.id === 'shield') {
        return (
            <div className="w-[100px]">
                <HealthSegmentBar hp={def.max} maxHp={def.max} shieldHp={current} />
            </div>
        );
    }
    const resource: ResourceDisplay = { ...def, current };
    return <ResourceBarRow resource={resource} />;
}

const TH_CLASS = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted whitespace-nowrap';
const TD_CLASS = 'px-3 py-2 align-middle';

function ResourcesTable({ values }: { values: StorybookControlValues }) {
    const search = controlString(values, 'resource');
    const customFill = controlNumber(values, 'fill');
    const customCost = controlNumber(values, 'cost');
    const defs = ALL_RESOURCE_DISPLAY_DEFS.filter((d) => matchesSearch(search, d.name, d.id, d.barStyle ?? ''));

    return (
        <div className="overflow-x-auto rounded-lg border border-border-custom">
            <table className="min-w-full text-sm text-gray-200">
                <thead className="bg-dark-900/60">
                    <tr>
                        <th className={TH_CLASS}>Resource</th>
                        <th className={TH_CLASS}>1x cost</th>
                        <th className={TH_CLASS}>3x cost</th>
                        <th className={TH_CLASS}>{customCost}x cost</th>
                        {FILL_COLUMNS.map((fills) => (
                            <th key={fills.join('-')} className={TH_CLASS}>
                                Bar {fills.map((f) => `${f}%`).join(' / ')}
                            </th>
                        ))}
                        <th className={TH_CLASS}>Bar {customFill}%</th>
                    </tr>
                </thead>
                <tbody>
                    {defs.map((def) => (
                        <tr key={def.id} className="border-t border-border-custom">
                            <td className={TD_CLASS}>
                                <div className="flex flex-col">
                                    <span className="font-medium" style={{ color: def.color }}>
                                        {def.name}
                                    </span>
                                    <span className="font-mono text-[11px] text-muted">
                                        {def.id} · max {def.max}
                                        {def.barStyle ? ` · ${def.barStyle}` : ''}
                                    </span>
                                </div>
                            </td>
                            <td className={TD_CLASS}>
                                <ResourceCostIcon resourceId={def.id} amount={1} />
                            </td>
                            <td className={TD_CLASS}>
                                <ResourceCostIcon resourceId={def.id} amount={3} />
                            </td>
                            <td className={TD_CLASS}>
                                <ResourceCostIcon resourceId={def.id} amount={customCost} />
                            </td>
                            {FILL_COLUMNS.map((fills) => (
                                <td key={fills.join('-')} className={TD_CLASS}>
                                    <div className="flex flex-col gap-2">
                                        {fills.map((f) => (
                                            <ResourceBarAtFill key={f} def={def} fillPct={f} />
                                        ))}
                                    </div>
                                </td>
                            ))}
                            <td className={TD_CLASS}>
                                <ResourceBarAtFill def={def} fillPct={customFill} />
                            </td>
                        </tr>
                    ))}
                    {defs.length === 0 && (
                        <tr>
                            <td colSpan={4 + FILL_COLUMNS.length + 1} className={`${TD_CLASS} text-muted`}>
                                No resource matches “{search}”.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

/** Every battle resource: its cost badges and its in-game bar at several fills. */
export const RESOURCES_STORY: StorybookEntry = {
    id: 'resources',
    name: 'Resources',
    description:
        'One row per ALL_RESOURCE_DISPLAY_DEFS entry: ResourceCostIcon at 1x / 3x, and the in-game bar at several fills (HealthSegmentBar for HP and Shield, ResourceBarRow otherwise). Every control is a URL parameter, e.g. ?resource=water&fill=25.',
    controls: [
        {
            kind: 'search',
            id: 'resource',
            label: 'Resource',
            placeholder: 'Search resources…',
            suggestions: ALL_RESOURCE_DISPLAY_DEFS.map((d) => d.name),
            defaultValue: '',
        },
        { kind: 'range', id: 'fill', label: 'Custom bar fill', min: 0, max: 100, defaultValue: 50, unit: '%' },
        { kind: 'range', id: 'cost', label: 'Custom cost', min: 1, max: 9, defaultValue: 2, unit: 'x' },
    ],
    render: (values) => <ResourcesTable values={values} />,
};

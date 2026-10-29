import React, { useMemo } from 'react';
import type { ResearchNodeDef, ResearchNodeLevels } from '../../../../researchTrees/types';
import {
    buildResearchNodePreview,
    researchPreviewIsEmpty,
    type ResearchPreviewStat,
    type ResearchView,
} from '../../research/researchNodePreview';
import { getAbility } from '../../abilities/AbilityRegistry';
import ResourcePill, { RESOURCE_PILL_SIZE_SMALL } from '../../../../components/ResourcePill';
import { AbilitySlotPreview } from './AbilitySlotPreview';
import { ResourceIcon } from './resources/ResourceIcon';

const COLUMN_LABEL = 'text-[9px] uppercase tracking-wider text-zinc-500 px-0.5';

export interface ResearchAbilityPreviewProps {
    treeId: string;
    node: ResearchNodeDef;
    researchTrees?: Record<string, string[]>;
    researchNodeLevels?: ResearchNodeLevels;
    currentLevel?: number;
    equipment?: readonly string[];
    /** Draw a divider when flavor or a selection reason sits above this block. */
    divided?: boolean;
}

function StatValue({ row, side }: { row: ResearchPreviewStat; side: 'before' | 'after' }) {
    const value = side === 'before' ? row.before : row.after;
    if (row.kind === 'text') {
        return <p className="text-[11px] leading-snug text-gray-200">{value}</p>;
    }
    if (row.kind === 'campaign') {
        return (
            <div className="flex flex-col gap-0.5" title={row.label}>
                <span className="text-[10px] text-gray-400">{row.label}</span>
                <ResourcePill
                    resource={row.resource}
                    count={Number(value)}
                    size={RESOURCE_PILL_SIZE_SMALL}
                    appearance={row.resource === 'hunger' ? 'hunger' : 'default'}
                />
            </div>
        );
    }
    return (
        <div className="flex items-center gap-1.5" title={row.label}>
            <ResourceIcon resourceId={row.resourceId} size={16} />
            <span className="text-[10px] text-gray-400">{row.label}</span>
            <span className="text-[12px] font-semibold tabular-nums text-white">{value}</span>
        </div>
    );
}

function ResearchAbilityCard({ abilityId, gameState }: { abilityId: string; gameState: ResearchView }) {
    const ability = getAbility(abilityId);
    if (!ability) return null;
    return <AbilitySlotPreview ability={ability} tooltipContext={gameState} />;
}

function StatColumns({ rows }: { rows: ResearchPreviewStat[] }) {
    return (
        <div className="flex items-start gap-2">
            <div className="flex min-w-[148px] flex-col gap-1">
                <div className={COLUMN_LABEL}>Before</div>
                <div className="flex flex-col gap-1.5 rounded-lg border border-white bg-black px-2 py-1.5">
                    {rows.map((row) => (
                        <StatValue key={row.id} row={row} side="before" />
                    ))}
                </div>
            </div>
            <div className="shrink-0 self-center text-base text-zinc-400">→</div>
            <div className="flex min-w-[148px] flex-col gap-1">
                <div className={COLUMN_LABEL}>After</div>
                <div className="flex flex-col gap-1.5 rounded-lg border border-white bg-black px-2 py-1.5">
                    {rows.map((row) => (
                        <StatValue key={row.id} row={row} side="after" />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function ResearchAbilityPreview({
    treeId,
    node,
    researchTrees,
    researchNodeLevels,
    currentLevel = 0,
    equipment,
    divided = false,
}: ResearchAbilityPreviewProps) {
    const preview = useMemo(
        () => buildResearchNodePreview({
            treeId,
            node,
            researchTrees,
            researchNodeLevels,
            currentLevel,
            equipment,
        }),
        [treeId, node, researchTrees, researchNodeLevels, currentLevel, equipment],
    );

    if (researchPreviewIsEmpty(preview)) return null;

    return (
        <div
            data-className="ResearchAbilityPreview"
            className={`flex flex-col gap-3 ${divided ? 'mt-2 border-t border-zinc-700 pt-2' : ''}`}
        >
            {preview.stats.length > 0 && <StatColumns rows={preview.stats} />}
            {preview.unlocks.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className={COLUMN_LABEL}>Unlocks</div>
                    <div className="flex flex-wrap items-start gap-2">
                        {preview.unlocks.map((abilityId) => (
                            <ResearchAbilityCard
                                key={abilityId}
                                abilityId={abilityId}
                                gameState={preview.afterView}
                            />
                        ))}
                    </div>
                </div>
            )}
            {preview.upgrades.map((pair) => (
                <div
                    key={`${pair.beforeAbilityId}->${pair.afterAbilityId}`}
                    className="flex items-start gap-2"
                >
                    <div className="flex flex-col gap-1">
                        <div className={COLUMN_LABEL}>Before</div>
                        <ResearchAbilityCard
                            abilityId={pair.beforeAbilityId}
                            gameState={preview.beforeView}
                        />
                    </div>
                    <div className="shrink-0 self-center text-base text-zinc-400">→</div>
                    <div className="flex flex-col gap-1">
                        <div className={COLUMN_LABEL}>After</div>
                        <ResearchAbilityCard
                            abilityId={pair.afterAbilityId}
                            gameState={preview.afterView}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { MissionResult } from '../../../../../../types';
import { STORYLINES, MISSION_MAP } from '../../../../storylines/index';
import { canPlayerSelectMission, hasVictoryResult, isSideMissionId } from '../../../../storylines/unlock';
import { getResolvedMissionResearchRewards } from '../../../../../../researchTrees/list';
import ResearchRewardTinyChip, { MISSION_REWARD_CHIP_CLASSNAME } from '../../../../../../components/ResearchRewardTinyChip';
import ResourcePill, { campaignResourceGains } from '../../../../../../components/ResourcePill';
import { MISSION_RESULTS_LABEL } from '../../../../../../components/missionResultCopy';
import { getItemDef } from '../../../../character_defs/items';
import { TestIds } from '../../../../../../testing/testIds';
import { MAP_NODE_DISABLED_LABEL } from '../questBankUi';
import MapTooltipCloseButton from './MapTooltipCloseButton';
import { CIRCLE_R, getStatusLabel, type TooltipData } from './missionMapHelpers';

export default function MissionTooltip({
    data,
    missionResults,
    isAdmin,
    isLocked,
    isDisabled,
    unlockHint,
    onStartMission,
    onMarkVictory,
    onDismiss,
}: {
    data: TooltipData;
    missionResults: MissionResult[];
    isAdmin: boolean;
    isLocked: boolean;
    isDisabled: boolean;
    unlockHint?: string;
    onStartMission: (id: string) => void;
    onMarkVictory?: (id: string) => Promise<void>;
    onDismiss: () => void;
}) {
    const def = MISSION_MAP[data.id];
    const isSide = def?.isSideMission === true || isSideMissionId(data.id, STORYLINES);
    const status = getStatusLabel(data.id, missionResults);
    const result = missionResults.find((r) => r.missionId === data.id);

    // Earned rewards — same resolution logic as CampaignHomeScreen mission select
    const gainedResources = useMemo(() => campaignResourceGains(result?.resourceDelta), [result?.resourceDelta]);
    const gainedResearchRewards = useMemo(() => getResolvedMissionResearchRewards(result), [result]);
    const gainedItemCardIds = useMemo(() => [
        ...(Array.isArray(result?.itemCardIds) ? result.itemCardIds : []),
        ...(Array.isArray(result?.itemIds) ? result.itemIds : []),
        ...(result?.itemId ? [result.itemId] : []),
    ], [result]);
    const hasRewards = gainedResources.length > 0 || gainedResearchRewards.length > 0 || gainedItemCardIds.length > 0;

    const TOOLTIP_W = 300;
    const TOOLTIP_APPROX_H = 160;
    const MARGIN = 12;

    // Position above the node circle; flip to below if near top of viewport
    const nodeR = CIRCLE_R;
    const spaceAbove = data.cy - nodeR - MARGIN;
    const placeAbove = spaceAbove > TOOLTIP_APPROX_H + 8;
    const top = placeAbove
        ? data.cy - nodeR - MARGIN - TOOLTIP_APPROX_H
        : data.cy + nodeR + MARGIN;

    // Clamp horizontally so tooltip stays in viewport
    const rawLeft = data.cx - TOOLTIP_W / 2;
    const left = Math.max(MARGIN, Math.min(rawLeft, window.innerWidth - TOOLTIP_W - MARGIN));
    const canStart = canPlayerSelectMission({
        isAdmin,
        isUnlocked: !isLocked,
        isDisabled,
    });

    return createPortal(
        <div
            data-mission-tooltip
            className="fixed z-[9999] pointer-events-none"
            style={{ top, left, width: TOOLTIP_W }}
        >
            <div
                className={`rounded-xl border bg-[#0f172a]/95 backdrop-blur-sm shadow-2xl overflow-hidden
                    ${data.pinned ? 'border-primary/60 pointer-events-auto' : 'border-white/10'}`}
                style={{ transition: 'opacity 0.1s ease' }}
            >
                {/* Header: name + status */}
                <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2 border-b border-white/8">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        {isSide && (
                            <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">Side Quest</span>
                        )}
                        <span className="text-sm font-bold text-white leading-snug">{def?.name ?? data.id}</span>
                    </div>
                    <div className="flex items-start gap-1.5 shrink-0">
                        {status ? (
                            <span
                                className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border mt-0.5"
                                style={{ color: status.color, borderColor: `${status.color}55`, background: `${status.color}18` }}
                            >
                                {status.label}
                            </span>
                        ) : (
                            <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border mt-0.5 text-zinc-400 border-zinc-600 bg-zinc-800/50">
                                Not started
                            </span>
                        )}
                        {data.pinned && (
                            <MapTooltipCloseButton
                                onClick={onDismiss}
                                testId={TestIds.missionMapTooltipClose}
                                ariaLabel="Close mission details"
                            />
                        )}
                    </div>
                </div>

                {/* Description */}
                <div className="px-4 py-2.5">
                    {def?.description ? (
                        <p className="text-[13px] italic text-zinc-300 leading-relaxed">{def.description}</p>
                    ) : (
                        <p className="text-[13px] italic text-zinc-500">No description available.</p>
                    )}
                    {isDisabled && (
                        <p className="text-[11px] italic text-zinc-500 mt-1">{MAP_NODE_DISABLED_LABEL}</p>
                    )}
                </div>

                {/* Earned rewards (only shown after completing the mission) */}
                {result && (
                    <div className="px-4 pb-3 border-t border-white/8">
                        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mt-2.5 mb-1.5">{MISSION_RESULTS_LABEL}</p>
                        {hasRewards ? (
                            <div className="flex flex-wrap gap-1.5">
                                {gainedResearchRewards.map(({ treeId, nodeId, node }) => (
                                    <ResearchRewardTinyChip key={`${treeId}-${nodeId}`} node={node} />
                                ))}
                                {gainedItemCardIds.map((itemId, idx) => {
                                    const itemDef = getItemDef(itemId);
                                    return (
                                        <span key={`${itemId}-${idx}`} className={`${MISSION_REWARD_CHIP_CLASSNAME} text-white`} title={itemDef?.name ?? itemId}>
                                            {itemDef?.name ?? itemId}
                                        </span>
                                    );
                                })}
                                {gainedResources.map(({ resource, count }) => (
                                    <ResourcePill key={resource} resource={resource} count={count} />
                                ))}
                            </div>
                        ) : (
                            <p className="text-[12px] text-zinc-500 italic">None</p>
                        )}
                    </div>
                )}

                {isLocked && !isAdmin && !isDisabled && (
                    <div className="px-4 pb-3">
                        <span className="text-[11px] text-zinc-500 italic">
                            {unlockHint ?? 'Complete earlier missions to unlock.'}
                        </span>
                    </div>
                )}

                {/* Pinned footer: Host Mission button */}
                {data.pinned && canStart && (
                    <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-white/8 bg-white/3">
                        {isAdmin && onMarkVictory && !hasVictoryResult(data.id, missionResults) && (
                            <button
                                type="button"
                                data-testid={TestIds.missionMarkVictory}
                                onClick={() => { void onMarkVictory(data.id); onDismiss(); }}
                                className="px-3 py-1.5 rounded-lg border border-green-700/60 bg-green-950/50 text-green-400 text-xs font-semibold hover:bg-green-900/50 active:scale-95 transition-all cursor-pointer"
                            >
                                Mark Victory
                            </button>
                        )}
                        <button
                            type="button"
                            data-testid={TestIds.missionHost}
                            onClick={() => { onStartMission(data.id); onDismiss(); }}
                            className="px-4 py-1.5 rounded-lg bg-primary text-secondary text-sm font-bold hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                        >
                            Host Mission
                        </button>
                    </div>
                )}
            </div>

            {/* Arrow */}
            <div
                className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
                style={placeAbove
                    ? { bottom: -6, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid rgba(255,255,255,0.08)' }
                    : { top: -6, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '6px solid rgba(255,255,255,0.08)' }
                }
            />
        </div>,
        document.body,
    );
}

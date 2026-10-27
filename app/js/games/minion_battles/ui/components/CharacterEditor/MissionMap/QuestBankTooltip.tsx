import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import type { StartQuestOptions } from '../../../../storylines/questLobby';
import type { QuestDef, QuestResult, QuestRunState, QuestSlotBank } from '../../../../storylines/questTypes';
import { isDedicatedQuestBank, isQuestDisabled } from '../../../../storylines/unlock';
import { getQuestDef } from '../../../../storylines/questRegistry';
import { getLocationCardDef } from '../../../../storylines/locationCards';
import { getResolvedMissionResearchRewards } from '../../../../../../researchTrees/list';
import ResearchRewardTinyChip, { MISSION_REWARD_CHIP_CLASSNAME } from '../../../../../../components/ResearchRewardTinyChip';
import ResourcePill, { visibleCampaignResourceGains } from '../../../../../../components/ResourcePill';
import { useCurrentUser } from '../../../../../../user/useCurrentUser';
import { getItemDef } from '../../../../character_defs/items';
import { TestIds } from '../../../../../../testing/testIds';
import { MAP_NODE_DISABLED_LABEL, questBankHoverDescription } from '../questBankUi';
import MapTooltipCloseButton from './MapTooltipCloseButton';
import {
    CIRCLE_R,
    COMPLETED_MISSION_ACCENT,
    buildQuestSlotRows,
    type QuestBankTooltipData,
    type QuestSlotRow,
} from './missionMapHelpers';

/** Compact footer button used by the quest bank tooltip (Start / Continue / Abandon / Reset). */
const QUEST_ACTION_BTN =
    'block text-left px-2.5 py-1 rounded-md text-[11px] font-bold active:scale-95 transition-all cursor-pointer';

function QuestSlotList({ rows, isAdmin }: { rows: QuestSlotRow[]; isAdmin: boolean }) {
    return (
        <ul data-className="QuestSlotList" className="flex flex-col gap-1 mt-2" data-testid="quest-bank-tooltip-slots">
            {rows.map((row) => (
                <li key={row.key} className="flex items-center gap-2 text-[13px] text-zinc-200">
                    {row.done ? (
                        <Check
                            className="h-4 w-4 shrink-0"
                            style={{ color: COMPLETED_MISSION_ACCENT }}
                            aria-label="Completed"
                        />
                    ) : (
                        <span
                            className="h-4 w-4 shrink-0 rounded-[3px] border border-zinc-500 bg-zinc-700/50"
                            aria-label="To do"
                        />
                    )}
                    <span className="flex flex-col min-w-0">
                        <span className={row.done ? '' : 'text-zinc-400'}>{row.label}</span>
                        {isAdmin && row.missionId && (
                            <span className="text-[10px] leading-tight font-mono text-muted">{row.missionId}</span>
                        )}
                    </span>
                </li>
            ))}
        </ul>
    );
}

/** Chips for what a cleared quest granted (resources, research, items, location cards). */
function QuestRewardChips({ result }: { result: QuestResult | undefined }) {
    const { knowledge } = useCurrentUser();
    const resources = useMemo(
        () => visibleCampaignResourceGains(result?.resourceDelta, knowledge),
        [result?.resourceDelta, knowledge],
    );
    const research = useMemo(() => getResolvedMissionResearchRewards(result), [result]);
    const itemIds = result?.unlockItemIds ?? [];
    const locationCardIds = result?.locationCardIds ?? [];
    if (research.length + resources.length + itemIds.length + locationCardIds.length === 0) {
        return <p className="text-[12px] text-zinc-500 italic">None</p>;
    }
    return (
        <div className="flex flex-wrap gap-1.5">
            {research.map(({ treeId, nodeId, node }) => (
                <ResearchRewardTinyChip key={`${treeId}-${nodeId}`} node={node} />
            ))}
            {itemIds.map((itemId) => (
                <span key={itemId} className={`${MISSION_REWARD_CHIP_CLASSNAME} text-white`} title={getItemDef(itemId)?.name ?? itemId}>
                    {getItemDef(itemId)?.name ?? itemId}
                </span>
            ))}
            {locationCardIds.map((cardId, idx) => (
                <span key={`${cardId}-${idx}`} className={`${MISSION_REWARD_CHIP_CLASSNAME} text-white`}>
                    {getLocationCardDef(cardId)?.displayName ?? `Location ${cardId}`}
                </span>
            ))}
            {resources.map(({ resource, count }) => (
                <ResourcePill key={resource} resource={resource} count={count} />
            ))}
        </div>
    );
}

export default function QuestBankTooltip({
    data,
    bank,
    eligibleQuests,
    clears,
    isLocked,
    unlockRequirementLabel,
    isAdmin,
    activeQuestDefId,
    activeQuestRun,
    questCompleted,
    questResult,
    onStartQuest,
    onAbandonQuest,
    onResetQuest,
    onMarkQuestVictory,
    onDismiss,
}: {
    data: QuestBankTooltipData;
    bank: QuestSlotBank;
    eligibleQuests: QuestDef[];
    clears: number;
    isLocked: boolean;
    unlockRequirementLabel: string | null;
    isAdmin: boolean;
    /** Singular active run's questDefId, if any. */
    activeQuestDefId?: string | null;
    activeQuestRun?: QuestRunState | null;
    /** Dedicated quest already cleared (victory recorded). */
    questCompleted: boolean;
    /** Victory result of the pinned quest, used for the Rewards section. */
    questResult?: QuestResult;
    onStartQuest?: (questDefId: string, options?: StartQuestOptions) => void;
    onAbandonQuest?: () => void | Promise<void>;
    onResetQuest?: (questDefId: string) => void | Promise<void>;
    onMarkQuestVictory?: (questDefId: string, bankId: string) => Promise<void>;
    onDismiss: () => void;
}) {
    const TOOLTIP_W = 300;
    const TOOLTIP_APPROX_H = 200;
    const MARGIN = 12;
    const nodeR = CIRCLE_R;
    const spaceAbove = data.cy - nodeR - MARGIN;
    const placeAbove = spaceAbove > TOOLTIP_APPROX_H + 8;
    const top = placeAbove
        ? data.cy - nodeR - MARGIN - TOOLTIP_APPROX_H
        : data.cy + nodeR + MARGIN;
    const rawLeft = data.cx - TOOLTIP_W / 2;
    const left = Math.max(MARGIN, Math.min(rawLeft, window.innerWidth - TOOLTIP_W - MARGIN));
    const label = bank.title ?? bank.id.replace(/_/g, ' ');
    const pinnedQuest = bank.questDefId ? getQuestDef(bank.questDefId) : undefined;
    const isDedicated = isDedicatedQuestBank(bank);
    const questDisabled = isQuestDisabled(pinnedQuest);
    const description = questBankHoverDescription({
        isLocked,
        isDedicated,
        unlockRequirementLabel,
        questDescription: pinnedQuest?.description,
    });
    const startableQuests = eligibleQuests.filter((q) => isAdmin || !isQuestDisabled(q));
    const showCompleteEmpty = !isLocked && startableQuests.length === 0 && !questDisabled;
    const showQuestActions = !isLocked && startableQuests.length > 0;
    const questCompleteLabel = isDedicated && showCompleteEmpty ? 'Quest complete.' : null;
    const showReset = isAdmin && isDedicated && questCompleted && !!pinnedQuest && !!onResetQuest;
    const showRewards = isDedicated && questCompleted && !!pinnedQuest;
    const showFooter = data.pinned
        && (isLocked || showRewards || showReset || (showCompleteEmpty && !isDedicated) || showQuestActions);

    return createPortal(
        <div
            data-className="QuestBankTooltip"
            data-testid={TestIds.questBankTooltip}
            data-quest-bank-tooltip
            className="fixed z-[9999] pointer-events-none"
            style={{ top, left, width: TOOLTIP_W }}
        >
            <div
                className={`rounded-xl border bg-[#0f172a]/95 backdrop-blur-sm shadow-2xl overflow-hidden
                    ${data.pinned ? 'border-violet-500/60 pointer-events-auto' : 'border-white/10'}`}
            >
                <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2 border-b border-white/8">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        {((bank.isSideQuest ?? true) || questCompleteLabel) && (
                            <span className="flex items-baseline gap-1.5">
                                {(bank.isSideQuest ?? true) && (
                                    <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">
                                        Side Quest
                                    </span>
                                )}
                                {questCompleteLabel && (
                                    <span className="text-[9px] italic text-zinc-500">
                                        {questCompleteLabel}
                                    </span>
                                )}
                            </span>
                        )}
                        <span className="text-sm font-bold text-white leading-snug flex items-baseline gap-1.5 min-w-0">
                            <span className="truncate">{label}</span>
                            {isAdmin && (
                                <span className="shrink-0 text-[10px] font-mono font-normal text-muted">
                                    {isDedicated ? (pinnedQuest?.id ?? bank.questDefId) : bank.id}
                                </span>
                            )}
                        </span>
                    </div>
                    <div className="flex items-start gap-1.5 shrink-0">
                        {!isDedicated && (
                            <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border mt-0.5 text-zinc-300 border-zinc-600 bg-zinc-800/50">
                                {clears}/{bank.requiredClears}
                            </span>
                        )}
                        {data.pinned && (
                            <MapTooltipCloseButton
                                onClick={onDismiss}
                                testId={TestIds.questBankTooltipClose}
                                ariaLabel="Close quest details"
                            />
                        )}
                    </div>
                </div>
                <div className="px-4 py-2.5">
                    {description && (
                        <p className="text-[13px] italic text-zinc-300 leading-relaxed">
                            {description}
                        </p>
                    )}
                    {isDedicated && pinnedQuest && (
                        <QuestSlotList
                            rows={buildQuestSlotRows(pinnedQuest, activeQuestRun, questCompleted)}
                            isAdmin={isAdmin}
                        />
                    )}
                    {questDisabled && (
                        <p className="text-[11px] italic text-zinc-500 mt-1">
                            {MAP_NODE_DISABLED_LABEL}
                        </p>
                    )}
                </div>
                {showFooter && (
                    <div className="flex flex-col gap-2 px-4 py-2.5 border-t border-white/8 bg-white/3">
                        {isLocked ? (
                            <p
                                data-testid="quest-bank-tooltip-locked"
                                className="text-[12px] text-amber-200/90"
                            >
                                Locked — complete {unlockRequirementLabel ?? 'the previous requirement'} to {isDedicated ? 'start this quest' : 'assign a quest here'}.
                            </p>
                        ) : showRewards && pinnedQuest ? (
                            <>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                                        Rewards
                                    </span>
                                    {showReset && (
                                <button
                                    type="button"
                                    data-testid={TestIds.questReset}
                                    onClick={() => {
                                        if (
                                            !window.confirm(
                                                `Reset “${pinnedQuest.title}”? Its completion and any run for it will be cleared so it can be run again.`,
                                            )
                                        ) {
                                            return;
                                        }
                                        void onResetQuest?.(pinnedQuest.id);
                                        onDismiss();
                                    }}
                                    className={`${QUEST_ACTION_BTN} bg-red-800/90 text-red-100 border border-red-600 hover:bg-red-700`}
                                >
                                    Reset
                                </button>
                                    )}
                                </div>
                                <QuestRewardChips result={questResult} />
                            </>
                        ) : showCompleteEmpty ? (
                            <p className="text-[12px] text-zinc-500 italic">
                                No eligible quests left.
                            </p>
                        ) : (
                            startableQuests.map((q) => {
                                const isActive = activeQuestDefId === q.id;
                                if (isActive) {
                                    return (
                                        <div key={q.id} className="flex items-center justify-between gap-2">
                                            <button
                                                type="button"
                                                data-testid={TestIds.questContinue}
                                                title={`Continue “${q.title}”`}
                                                onClick={() => {
                                                    onStartQuest?.(q.id, { mode: 'continue' });
                                                    onDismiss();
                                                }}
                                                className={`${QUEST_ACTION_BTN} min-w-0 truncate bg-primary text-secondary hover:opacity-90`}
                                            >
                                                Continue “{q.title}”
                                            </button>
                                            {onAbandonQuest && (
                                                <button
                                                    type="button"
                                                    data-testid={TestIds.questAbandon}
                                                    onClick={() => {
                                                        if (
                                                            !window.confirm(
                                                                `Abandon “${q.title}”? This run’s progress will be discarded.`,
                                                            )
                                                        ) {
                                                            return;
                                                        }
                                                        void onAbandonQuest();
                                                        onDismiss();
                                                    }}
                                                    className={`${QUEST_ACTION_BTN} shrink-0 bg-red-800/90 text-red-100 border border-red-600 hover:bg-red-700`}
                                                >
                                                    Abandon
                                                </button>
                                            )}
                                        </div>
                                    );
                                }
                                return (
                                    <div key={q.id} className="flex items-center justify-between gap-2">
                                    {isAdmin && onMarkQuestVictory ? (
                                        <button
                                            type="button"
                                            data-testid={TestIds.questMarkVictory}
                                            onClick={() => {
                                                void onMarkQuestVictory(q.id, bank.id);
                                                onDismiss();
                                            }}
                                            className={`${QUEST_ACTION_BTN} shrink-0 border border-green-700/60 bg-green-950/50 text-green-400 hover:bg-green-900/50`}
                                        >
                                            Mark Victory
                                        </button>
                                    ) : <span />}
                                    <button
                                        type="button"
                                        data-testid={`${TestIds.questStartPrefix}${q.id}`}
                                        onClick={() => {
                                            if (
                                                activeQuestDefId
                                                && activeQuestDefId !== q.id
                                                && !window.confirm(
                                                    'You already have an active quest. Starting this quest abandons the current run. Continue?',
                                                )
                                            ) {
                                                return;
                                            }
                                            onStartQuest?.(q.id, {
                                                mode: 'start',
                                                assignedBankId: bank.id,
                                            });
                                            onDismiss();
                                        }}
                                        title={`Start “${q.title}”`}
                                        className={`${QUEST_ACTION_BTN} min-w-0 truncate bg-primary text-secondary hover:opacity-90`}
                                    >
                                        Start “{q.title}”
                                    </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}

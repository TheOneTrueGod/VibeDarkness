/**
 * MissionMapTab — SVG-based mission progress map for a campaign character.
 *
 * Shows all missions in the character's campaign as circles connected by lines.
 * Node fill: gray = finished; red = battle; blue = story; radial gradient = boss.
 * Locked missions are dimmed; admins can click them anyway.
 * Hovering a node shows a tooltip; clicking pins it and shows a "Host Mission" button.
 */
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown, Scroll, Skull, Swords } from 'lucide-react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { MissionResult } from '../../../../../types';
import type { MissionType } from '../../../storylines/types';
import type { StartQuestOptions } from '../../../storylines/questLobby';
import { STORYLINES, MISSION_MAP } from '../../../storylines/index';
import {
    getUnlockedMissionIds,
    hasVictoryResult,
    isMissionCompleted,
    getAllMissionIdsInOrder,
    isSideMissionId,
    getUnlockedQuestSlotBanks,
    countQuestBankClears,
    isQuestSlotBankUnlocked,
    getEligibleQuestsForBank,
    getOptionalEligibleQuests,
    listQuestVictoryResults,
} from '../../../storylines/unlock';
import type { QuestDef, QuestSlotBank } from '../../../storylines/questTypes';
import { getResolvedMissionResearchRewards } from '../../../../../researchTrees/list';
import ResearchRewardTinyChip from '../../../../../components/ResearchRewardTinyChip';
import ResourcePill, { campaignResourceGains } from '../../../../../components/ResourcePill';
import { MISSION_REWARD_CHIP_CLASSNAME } from '../../../../../components/ResearchRewardTinyChip';
import { getItemDef } from '../../../character_defs/items';
import {
    TestIds,
    missionMapNodeTestId,
    missionMapQuestBankTestId,
} from '../../../../../testing/testIds';
import QuestBanksPanel from './QuestBanksPanel';

type MissionMapPane = 'map' | 'quests';

const CIRCLE_R = 28;
const SIDE_CIRCLE_R = 18;
/** ViewBox inset — covers node radius, name label below, and hover rings without huge empty margins. */
const PADDING = 48;
const MISSION_ICON_SIZE = 22;

const MISSION_TYPE_ICONS: Record<MissionType, LucideIcon> = {
    battle: Swords,
    story: Scroll,
    boss: Skull,
};

const DEFAULT_MISSION_TYPE: MissionType = 'battle';

/** Solid fills for finished / battle / story nodes. */
const MISSION_NODE_FILL = {
    finished: '#6b7280', // gray-500
    battle: '#ef4444', // red-500
    story: '#3b82f6', // blue-500
} as const;

/** Solid accent used for boss hover glow (gradient fill cannot drive drop-shadow alone). */
const BOSS_GLOW_COLOR = '#e11d48'; // rose-600
const BOSS_GRADIENT_ID = 'mission-map-boss-fill';

interface Props {
    character: CampaignCharacter;
    isAdmin: boolean;
    onStartMission: (missionId: string) => void;
    /** Start / continue a quest (prep handled by CharacterEditor when mode is start). */
    onStartQuest?: (questDefId: string, options?: StartQuestOptions) => void;
    /** Clear the character's single active quest run (after confirm). */
    onAbandonQuest?: () => void | Promise<void>;
    onMarkVictory?: (missionId: string) => Promise<void>;
    /** Admin-only: change the character's campaign from the map toolbar. */
    onCampaignChange?: (campaignId: string) => void | Promise<void>;
}

/** SVG fill for a mission node: gray when finished, else type-based (boss uses gradient url). */
function getMissionNodeFill(
    missionId: string,
    missionType: MissionType,
    missionResults: MissionResult[],
): string {
    if (isMissionCompleted(missionId, missionResults)) return MISSION_NODE_FILL.finished;
    if (missionType === 'boss') return `url(#${BOSS_GRADIENT_ID})`;
    if (missionType === 'story') return MISSION_NODE_FILL.story;
    return MISSION_NODE_FILL.battle;
}

/** Solid color for hover glow / drop-shadow (never a gradient url). */
function getMissionGlowColor(
    missionId: string,
    missionType: MissionType,
    missionResults: MissionResult[],
): string {
    if (isMissionCompleted(missionId, missionResults)) return MISSION_NODE_FILL.finished;
    if (missionType === 'boss') return BOSS_GLOW_COLOR;
    if (missionType === 'story') return MISSION_NODE_FILL.story;
    return MISSION_NODE_FILL.battle;
}

function getStatusLabel(missionId: string, missionResults: MissionResult[]): { label: string; color: string } | null {
    if (hasVictoryResult(missionId, missionResults)) return { label: 'Victory', color: '#22c55e' };
    if (isMissionCompleted(missionId, missionResults)) return { label: 'Defeat', color: '#ef4444' };
    return null;
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipData {
    id: string;
    /** Viewport coordinates of the node circle center */
    cx: number;
    cy: number;
    pinned: boolean;
}

interface QuestBankTooltipData {
    bankId: string;
    cx: number;
    cy: number;
    pinned: boolean;
}

function QuestBankTooltip({
    data,
    bank,
    eligibleQuests,
    clears,
    isLocked,
    activeQuestDefId,
    onStartQuest,
    onAbandonQuest,
    onDismiss,
}: {
    data: QuestBankTooltipData;
    bank: QuestSlotBank;
    eligibleQuests: QuestDef[];
    clears: number;
    isLocked: boolean;
    /** Singular active run's questDefId, if any. */
    activeQuestDefId?: string | null;
    onStartQuest?: (questDefId: string, options?: StartQuestOptions) => void;
    onAbandonQuest?: () => void | Promise<void>;
    onDismiss: () => void;
}) {
    const TOOLTIP_W = 300;
    const TOOLTIP_APPROX_H = 200;
    const MARGIN = 12;
    const nodeR = SIDE_CIRCLE_R;
    const spaceAbove = data.cy - nodeR - MARGIN;
    const placeAbove = spaceAbove > TOOLTIP_APPROX_H + 8;
    const top = placeAbove
        ? data.cy - nodeR - MARGIN - TOOLTIP_APPROX_H
        : data.cy + nodeR + MARGIN;
    const rawLeft = data.cx - TOOLTIP_W / 2;
    const left = Math.max(MARGIN, Math.min(rawLeft, window.innerWidth - TOOLTIP_W - MARGIN));
    const label = bank.title ?? bank.id.replace(/_/g, ' ');

    return createPortal(
        <div
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
                        {(bank.isSideQuest ?? true) && (
                            <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">
                                Side Quest
                            </span>
                        )}
                        <span className="text-sm font-bold text-white leading-snug truncate">{label}</span>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border mt-0.5 text-zinc-300 border-zinc-600 bg-zinc-800/50">
                        {clears}/{bank.requiredClears}
                    </span>
                </div>
                <div className="px-4 py-2.5">
                    <p className="text-[13px] italic text-zinc-300 leading-relaxed">
                        {isLocked
                            ? 'This quest slot unlocks after Core Awakening. You can still run matching quests from Optional / side quests.'
                            : 'Choose a quest for this slot. Loadout freezes at prep for the whole run.'}
                    </p>
                </div>
                {data.pinned && (
                    <div className="flex flex-col gap-2 px-4 py-2.5 border-t border-white/8 bg-white/3">
                        {isLocked ? (
                            <p
                                data-testid="quest-bank-tooltip-locked"
                                className="text-[12px] text-amber-200/90"
                            >
                                Locked — beat Core Awakening to assign a quest here.
                            </p>
                        ) : eligibleQuests.length === 0 ? (
                            <p className="text-[12px] text-zinc-500 italic">No eligible quests left.</p>
                        ) : (
                            eligibleQuests.map((q) => {
                                const isActive = activeQuestDefId === q.id;
                                if (isActive) {
                                    return (
                                        <div key={q.id} className="flex flex-col gap-1.5">
                                            <button
                                                type="button"
                                                data-testid={TestIds.questContinue}
                                                onClick={() => {
                                                    onStartQuest?.(q.id, { mode: 'continue' });
                                                    onDismiss();
                                                }}
                                                className="w-full text-left px-3 py-2 rounded-lg bg-primary text-secondary text-xs font-bold hover:opacity-90 active:scale-95 transition-all cursor-pointer"
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
                                                    className="w-full text-left px-3 py-2 rounded-lg bg-red-800/90 text-red-100 text-xs font-bold border border-red-600 hover:bg-red-700 active:scale-95 transition-all cursor-pointer"
                                                >
                                                    Abandon
                                                </button>
                                            )}
                                        </div>
                                    );
                                }
                                return (
                                    <button
                                        key={q.id}
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
                                        className="w-full text-left px-3 py-2 rounded-lg bg-primary text-secondary text-xs font-bold hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                                    >
                                        Start “{q.title}”
                                    </button>
                                );
                            })
                        )}
                        <button
                            type="button"
                            onClick={onDismiss}
                            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer self-start"
                        >
                            Dismiss
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}

function MissionTooltip({
    data,
    missionResults,
    isAdmin,
    isLocked,
    onStartMission,
    onMarkVictory,
    onDismiss,
}: {
    data: TooltipData;
    missionResults: MissionResult[];
    isAdmin: boolean;
    isLocked: boolean;
    onStartMission: (id: string) => void;
    onMarkVictory?: (id: string) => Promise<void>;
    onDismiss: () => void;
}) {
    const def = MISSION_MAP[data.id];
    const isSide = isSideMissionId(data.id, STORYLINES);
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
    const nodeR = isSide ? SIDE_CIRCLE_R : CIRCLE_R;
    const spaceAbove = data.cy - nodeR - MARGIN;
    const placeAbove = spaceAbove > TOOLTIP_APPROX_H + 8;
    const top = placeAbove
        ? data.cy - nodeR - MARGIN - TOOLTIP_APPROX_H
        : data.cy + nodeR + MARGIN;

    // Clamp horizontally so tooltip stays in viewport
    const rawLeft = data.cx - TOOLTIP_W / 2;
    const left = Math.max(MARGIN, Math.min(rawLeft, window.innerWidth - TOOLTIP_W - MARGIN));

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
                    <div className="flex flex-col gap-0.5">
                        {isSide && (
                            <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">Side Quest</span>
                        )}
                        <span className="text-sm font-bold text-white leading-snug">{def?.name ?? data.id}</span>
                    </div>
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
                </div>

                {/* Description */}
                <div className="px-4 py-2.5">
                    {def?.description ? (
                        <p className="text-[13px] italic text-zinc-300 leading-relaxed">{def.description}</p>
                    ) : (
                        <p className="text-[13px] italic text-zinc-500">No description available.</p>
                    )}
                </div>

                {/* Earned rewards (only shown after completing the mission) */}
                {result && (
                    <div className="px-4 pb-3 border-t border-white/8">
                        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mt-2.5 mb-1.5">Rewards</p>
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

                {/* Locked notice */}
                {isLocked && !isAdmin && (
                    <div className="px-4 pb-3">
                        <span className="text-[11px] text-zinc-500 italic">Complete earlier missions to unlock.</span>
                    </div>
                )}

                {/* Pinned footer: Host Mission button */}
                {data.pinned && (
                    <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-white/8 bg-white/3">
                        <button
                            type="button"
                            onClick={onDismiss}
                            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                        >
                            Dismiss
                        </button>
                        <div className="flex items-center gap-2">
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

// ── Main component ────────────────────────────────────────────────────────────

export default function MissionMapTab({
    character,
    isAdmin,
    onStartMission,
    onStartQuest,
    onAbandonQuest,
    onMarkVictory,
    onCampaignChange,
}: Props) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [pressedId, setPressedId] = useState<string | null>(null);
    const [tooltip, setTooltip] = useState<TooltipData | null>(null);
    const [bankTooltip, setBankTooltip] = useState<QuestBankTooltipData | null>(null);
    const [focusedBankId, setFocusedBankId] = useState<string | null>(null);
    const [activePane, setActivePane] = useState<MissionMapPane>('map');
    const questBanksPanelRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const storyline = useMemo(
        () => STORYLINES.find((s) => s.id === character.campaignId) ?? null,
        [character.campaignId],
    );

    const missionResults = useMemo(
        () => character.missionResults[character.campaignId] ?? [],
        [character.missionResults, character.campaignId],
    );

    const questResults = useMemo(
        () => character.questResults[character.campaignId] ?? [],
        [character.questResults, character.campaignId],
    );

    const unlockedIds = useMemo(
        () => (storyline ? getUnlockedMissionIds(storyline, missionResults, questResults) : new Set<string>()),
        [storyline, missionResults, questResults],
    );

    const missionIds = useMemo(
        () => (storyline ? getAllMissionIdsInOrder(storyline) : []),
        [storyline],
    );

    // Resolve mission defs and assign fallback grid positions for any missing mapPosition.
    const missions = useMemo(() => {
        const COLS = 5;
        const COL_STEP = 170;
        const ROW_STEP = 200;
        return missionIds.map((id, idx) => {
            const def = MISSION_MAP[id];
            const isSide = storyline ? isSideMissionId(id, STORYLINES) : false;
            const col = idx % COLS;
            const row = Math.floor(idx / COLS);
            const xDir = row % 2 === 0 ? 1 : -1;
            const baseX = row % 2 === 0 ? 100 : 100 + COL_STEP * (COLS - 1);
            const pos = def?.mapPosition ?? {
                x: baseX + xDir * col * COL_STEP,
                y: 120 + row * ROW_STEP,
            };
            return { id, def, pos, isSide };
        });
    }, [missionIds, storyline]);

    const questBanksOnMap = useMemo((): QuestSlotBank[] => {
        if (!storyline) return [];
        return (storyline.questSlotBanks ?? []).filter((b) => b.mapPosition != null);
    }, [storyline]);

    const unlockedQuestBankIds = useMemo(() => {
        if (!storyline) return new Set<string>();
        return new Set(getUnlockedQuestSlotBanks(storyline, missionResults).map((b) => b.id));
    }, [storyline, missionResults]);

    const hasQuestsContent = useMemo(() => {
        if (!onStartQuest || !storyline) return false;
        const unlockedBanks = getUnlockedQuestSlotBanks(storyline, missionResults);
        const optionalQuests = getOptionalEligibleQuests(character.campaignId, questResults);
        const victoryResults = listQuestVictoryResults(questResults);
        const activeQuest =
            character.activeQuestRun?.status === 'active'
            || character.activeQuestRun?.status === 'prep'
                ? character.activeQuestRun
                : null;
        return (
            unlockedBanks.length > 0
            || optionalQuests.length > 0
            || victoryResults.length > 0
            || activeQuest != null
        );
    }, [
        onStartQuest,
        storyline,
        missionResults,
        questResults,
        character.campaignId,
        character.activeQuestRun,
    ]);

    const usePaneTabs = hasQuestsContent;
    const showMap = !usePaneTabs || activePane === 'map';
    const showQuests = usePaneTabs && activePane === 'quests';

    const posMap = useMemo(() => {
        const m = new Map<string, { x: number; y: number }>();
        for (const { id, pos } of missions) m.set(id, pos);
        for (const bank of questBanksOnMap) {
            if (bank.mapPosition) m.set(`questBank:${bank.id}`, bank.mapPosition);
        }
        return m;
    }, [missions, questBanksOnMap]);

    // Compute SVG viewBox from mission + quest-bank extents.
    const { minX, minY, maxX, maxY } = useMemo(() => {
        const points = [
            ...missions.map((m) => m.pos),
            ...questBanksOnMap.map((b) => b.mapPosition!).filter(Boolean),
        ];
        if (points.length === 0) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pos of points) {
            if (pos.x < minX) minX = pos.x;
            if (pos.y < minY) minY = pos.y;
            if (pos.x > maxX) maxX = pos.x;
            if (pos.y > maxY) maxY = pos.y;
        }
        return { minX, minY, maxX, maxY };
    }, [missions, questBanksOnMap]);

    const vbX = minX - PADDING;
    const vbY = minY - PADDING;
    const vbW = maxX - minX + PADDING * 2;
    const vbH = maxY - minY + PADDING * 2;

    /** Convert SVG-space coordinates to viewport coordinates. */
    const svgToViewport = useCallback((svgX: number, svgY: number): { x: number; y: number } => {
        const svg = svgRef.current;
        if (!svg) return { x: 0, y: 0 };
        const rect = svg.getBoundingClientRect();
        const scaleX = rect.width / vbW;
        const scaleY = rect.height / vbH;
        return {
            x: rect.left + (svgX - vbX) * scaleX,
            y: rect.top + (svgY - vbY) * scaleY,
        };
    }, [vbX, vbY, vbW, vbH]);

    const handleNodeEnter = useCallback((id: string, svgPosX: number, svgPosY: number) => {
        setHoveredId(id);
        if (tooltip?.pinned) return; // keep pinned tooltip
        const { x, y } = svgToViewport(svgPosX, svgPosY);
        setTooltip({ id, cx: x, cy: y, pinned: false });
    }, [tooltip?.pinned, svgToViewport]);

    const handleNodeLeave = useCallback((id: string) => {
        setHoveredId((h) => h === id ? null : h);
        setPressedId((p) => p === id ? null : p);
        if (!tooltip?.pinned) setTooltip(null);
    }, [tooltip?.pinned]);

    const handleNodeClick = useCallback((id: string, svgPosX: number, svgPosY: number) => {
        const { x, y } = svgToViewport(svgPosX, svgPosY);
        setBankTooltip(null);
        setTooltip({ id, cx: x, cy: y, pinned: true });
    }, [svgToViewport]);

    const dismissTooltip = useCallback(() => setTooltip(null), []);
    const dismissBankTooltip = useCallback(() => setBankTooltip(null), []);

    const handleQuestBankClick = useCallback(
        (bank: QuestSlotBank, svgPosX: number, svgPosY: number) => {
            setFocusedBankId(bank.id);
            setTooltip(null);
            if (hasQuestsContent) {
                // Quests live on a separate pane — jump there instead of a map-anchored tooltip.
                setActivePane('quests');
                setBankTooltip(null);
                requestAnimationFrame(() => {
                    questBanksPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
            } else {
                const { x, y } = svgToViewport(svgPosX, svgPosY);
                setBankTooltip({ bankId: bank.id, cx: x, cy: y, pinned: true });
            }
        },
        [svgToViewport, hasQuestsContent],
    );

    // Dismiss pinned tooltip on Escape or outside click
    useEffect(() => {
        if (!tooltip?.pinned && !bankTooltip?.pinned) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                dismissTooltip();
                dismissBankTooltip();
            }
        };
        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-mission-tooltip]')) dismissTooltip();
            if (!target.closest('[data-quest-bank-tooltip]')) dismissBankTooltip();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onMouseDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onMouseDown);
        };
    }, [tooltip?.pinned, bankTooltip?.pinned, dismissTooltip, dismissBankTooltip]);

    if (!storyline) {
        return (
            <div className="flex items-center justify-center h-full text-muted text-sm">
                No campaign assigned to this character.
            </div>
        );
    }

    // Match Campaign select height (`text-xs` + `py-1`).
    const pillClass = (pane: MissionMapPane) =>
        `px-2.5 py-0.5 rounded-full text-xs font-semibold leading-5 transition-colors cursor-pointer ${
            activePane === pane
                ? 'bg-primary text-secondary'
                : 'text-muted hover:text-white'
        }`;

    const showToolbar = usePaneTabs || Boolean(onCampaignChange);

    return (
        <div className="w-full h-full overflow-auto">
            {showToolbar && (
                <div className="shrink-0 flex items-center gap-3 pb-2 border-b border-border-custom mb-2">
                    {usePaneTabs && (
                        <div
                            className="inline-flex gap-0.5 p-0.5 rounded-full border border-border-custom bg-background/60 shrink-0"
                            role="tablist"
                            aria-label="Mission map panes"
                        >
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activePane === 'map'}
                                data-testid={TestIds.missionMapSubTabMap}
                                className={pillClass('map')}
                                onClick={() => {
                                    setActivePane('map');
                                }}
                            >
                                Map
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activePane === 'quests'}
                                data-testid={TestIds.missionMapSubTabQuests}
                                className={pillClass('quests')}
                                onClick={() => {
                                    setActivePane('quests');
                                    setTooltip(null);
                                    setBankTooltip(null);
                                }}
                            >
                                Quests
                            </button>
                        </div>
                    )}
                    {onCampaignChange && (
                        <div className={`flex items-center gap-2 min-w-0 ${usePaneTabs ? 'ml-auto' : ''}`}>
                            <label className="text-xs text-muted shrink-0">Campaign:</label>
                            <div className="relative w-44 max-w-[40vw] shrink-0">
                                <select
                                    value={character.campaignId}
                                    onChange={(e) => void onCampaignChange(e.target.value)}
                                    className="w-full appearance-none text-xs bg-surface border border-border-custom rounded pl-2 pr-7 py-1 text-white"
                                >
                                    {STORYLINES.map((s) => (
                                        <option key={s.id} value={s.id}>{s.title}</option>
                                    ))}
                                </select>
                                <ChevronDown
                                    className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white"
                                    aria-hidden
                                    strokeWidth={2.25}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
            {showQuests && onStartQuest && (
                <div ref={questBanksPanelRef}>
                    <QuestBanksPanel
                        character={character}
                        onStartQuest={onStartQuest}
                        onAbandonQuest={onAbandonQuest}
                        focusedBankId={focusedBankId}
                        hideSectionTitle={usePaneTabs}
                        isAdmin={isAdmin}
                    />
                </div>
            )}
            {showMap && (
            <svg
                ref={svgRef}
                viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
                className="w-full h-auto block"
                style={{ aspectRatio: `${vbW} / ${vbH}` }}
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    {/* Subtle two-tone radial fill for unfinished boss nodes */}
                    <radialGradient id={BOSS_GRADIENT_ID} cx="32%" cy="28%" r="78%">
                        <stop offset="0%" stopColor="#fb7185" />
                        <stop offset="55%" stopColor="#e11d48" />
                        <stop offset="100%" stopColor="#7f1d1d" />
                    </radialGradient>
                </defs>

                {/* Connection lines */}
                {(storyline.edges ?? []).map((edge) => {
                    const from = posMap.get(edge.fromMissionId);
                    const to = posMap.get(edge.toMissionId);
                    if (!from || !to) return null;
                    return (
                        <line
                            key={`${edge.fromMissionId}-${edge.toMissionId}`}
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            stroke={edge.isSideMission ? '#4c1d95' : '#374151'}
                            strokeWidth={edge.isSideMission ? 2 : 3}
                            strokeDasharray={edge.isSideMission ? '5 4' : undefined}
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Side-quest edges from unlock mission → quest bank node */}
                {questBanksOnMap.map((bank) => {
                    if (!bank.unlockAfterMissionId || !bank.mapPosition) return null;
                    const from = posMap.get(bank.unlockAfterMissionId);
                    const to = bank.mapPosition;
                    if (!from) return null;
                    return (
                        <line
                            key={`quest-bank-edge-${bank.id}`}
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            stroke="#4c1d95"
                            strokeWidth={2}
                            strokeDasharray="5 4"
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Mission nodes */}
                {missions.map(({ id, def, pos, isSide }) => {
                    const isUnlocked = unlockedIds.has(id);
                    const clickable = isUnlocked || isAdmin;
                    const missionType = def?.missionType ?? DEFAULT_MISSION_TYPE;
                    const finished = isMissionCompleted(id, missionResults);
                    const color = getMissionNodeFill(id, missionType, missionResults);
                    const glowColor = getMissionGlowColor(id, missionType, missionResults);
                    const dimmed = !isUnlocked && !isAdmin;
                    const isHovered = hoveredId === id;
                    const isPressed = pressedId === id;
                    const isPinned = tooltip?.pinned && tooltip.id === id;
                    const r = isSide ? SIDE_CIRCLE_R : CIRCLE_R;
                    const MissionIcon = MISSION_TYPE_ICONS[missionType];

                    const nodeScale = isPressed ? 0.92 : (isHovered || isPinned) ? 1.1 : 1;

                    return (
                        // Outer g: positioning via SVG transform (no CSS transform here to avoid conflict)
                        <g
                            key={id}
                            transform={`translate(${pos.x}, ${pos.y})`}
                            onClick={clickable ? () => handleNodeClick(id, pos.x, pos.y) : undefined}
                            onMouseEnter={clickable ? () => handleNodeEnter(id, pos.x, pos.y) : undefined}
                            onMouseLeave={clickable ? () => handleNodeLeave(id) : undefined}
                            onMouseDown={clickable ? () => setPressedId(id) : undefined}
                            onMouseUp={clickable ? () => setPressedId(null) : undefined}
                            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNodeClick(id, pos.x, pos.y); } } : undefined}
                            tabIndex={clickable ? 0 : undefined}
                            role={clickable ? 'button' : undefined}
                            data-testid={clickable ? missionMapNodeTestId(id) : undefined}
                            aria-label={clickable ? `${def?.name ?? id} — click to view details` : undefined}
                            style={{
                                cursor: clickable ? 'pointer' : 'default',
                                opacity: dimmed ? 0.35 : 1,
                                outline: 'none',
                            }}
                        >
                            {/* Inner g: CSS scale + filter, origin at local (0,0) = circle center */}
                            <g
                                style={{
                                    transform: `scale(${nodeScale})`,
                                    transformOrigin: '0px 0px',
                                    transition: 'transform 0.12s ease, filter 0.12s ease',
                                    filter: (isHovered || isPinned) && !isPressed
                                        ? `brightness(1.25) drop-shadow(0 0 8px ${glowColor}88)`
                                        : isPressed
                                            ? 'brightness(0.85)'
                                            : undefined,
                                }}
                            >
                                {/* Outer ring for locked-but-admin-accessible */}
                                {isAdmin && !isUnlocked && (
                                    <circle
                                        r={r + 3}
                                        fill="none"
                                        stroke="#f59e0b"
                                        strokeWidth={1.5}
                                        strokeDasharray="4 3"
                                    />
                                )}
                                {/* Pinned ring */}
                                {isPinned && (
                                    <circle
                                        r={r + 6}
                                        fill="none"
                                        stroke="rgba(78,205,196,0.5)"
                                        strokeWidth={2}
                                    />
                                )}
                                {/* Hover highlight ring */}
                                {(isHovered || isPinned) && !isPressed && (
                                    <circle
                                        r={r + 4}
                                        fill="none"
                                        stroke="white"
                                        strokeWidth={2}
                                        strokeOpacity={0.35}
                                    />
                                )}
                                <circle
                                    r={r}
                                    fill={color}
                                    stroke={isSide
                                        ? (finished ? '#9ca3af' : '#7c3aed')
                                        : ((isHovered || isPinned) ? 'white' : '#1f2937')}
                                    strokeWidth={isSide ? 2 : ((isHovered || isPinned) ? 2.5 : 2)}
                                    strokeOpacity={(isHovered || isPinned) ? 0.7 : 1}
                                />
                                {/* Checkmark / star for side missions; type icon for main missions */}
                                {isSide ? (
                                    <text
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fontSize={10}
                                        fill={finished ? '#e5e7eb' : '#a78bfa'}
                                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                                    >
                                        {hasVictoryResult(id, missionResults) ? '✓' : '★'}
                                    </text>
                                ) : (
                                    <MissionIcon
                                        width={MISSION_ICON_SIZE}
                                        height={MISSION_ICON_SIZE}
                                        x={-MISSION_ICON_SIZE / 2}
                                        y={-MISSION_ICON_SIZE / 2}
                                        color="white"
                                        strokeWidth={2.25}
                                        aria-hidden
                                        style={{ pointerEvents: 'none' }}
                                    />
                                )}
                                {/* Side Quest label above node */}
                                {isSide && (
                                    <text
                                        y={-r - 5}
                                        textAnchor="middle"
                                        fontSize={8}
                                        fill="#7c3aed"
                                        fontStyle="italic"
                                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                                    >
                                        side quest
                                    </text>
                                )}
                                {/* Mission name below */}
                                <text
                                    y={r + 14}
                                    textAnchor="middle"
                                    fontSize={10}
                                    fill={(isHovered || isPinned) ? '#ffffff' : '#d1d5db'}
                                    style={{ pointerEvents: 'none', userSelect: 'none', transition: 'fill 0.12s ease' }}
                                >
                                    {def?.name ?? id}
                                </text>
                            </g>
                        </g>
                    );
                })}

                {/* Quest slot bank nodes (side-quest style) */}
                {questBanksOnMap.map((bank) => {
                    const pos = bank.mapPosition!;
                    const nodeId = `questBank:${bank.id}`;
                    const unlocked =
                        unlockedQuestBankIds.has(bank.id)
                        || (storyline
                            ? isQuestSlotBankUnlocked(bank, missionResults)
                            : false);
                    const clears = countQuestBankClears(bank, questResults);
                    const dimmed = !unlocked;
                    const isHovered = hoveredId === nodeId;
                    const isPressed = pressedId === nodeId;
                    const r = SIDE_CIRCLE_R;
                    const nodeScale = isPressed ? 0.92 : isHovered ? 1.1 : 1;
                    const finished = clears >= bank.requiredClears;
                    const label = bank.title ?? bank.id.replace(/_/g, ' ');

                    const isBankPinned = bankTooltip?.pinned && bankTooltip.bankId === bank.id;

                    return (
                        <g
                            key={nodeId}
                            transform={`translate(${pos.x}, ${pos.y})`}
                            onClick={() => handleQuestBankClick(bank, pos.x, pos.y)}
                            onMouseEnter={() => setHoveredId(nodeId)}
                            onMouseLeave={() => {
                                setHoveredId((h) => (h === nodeId ? null : h));
                                setPressedId((p) => (p === nodeId ? null : p));
                            }}
                            onMouseDown={() => setPressedId(nodeId)}
                            onMouseUp={() => setPressedId(null)}
                            tabIndex={0}
                            role="button"
                            data-testid={missionMapQuestBankTestId(bank.id)}
                            aria-label={`${label} quest bank`}
                            aria-expanded={isBankPinned || undefined}
                            style={{
                                cursor: 'pointer',
                                opacity: dimmed ? 0.45 : 1,
                                outline: 'none',
                            }}
                        >
                            <g
                                style={{
                                    transform: `scale(${nodeScale})`,
                                    transformOrigin: '0px 0px',
                                    transition: 'transform 0.12s ease, filter 0.12s ease',
                                    filter: isHovered && !isPressed
                                        ? 'brightness(1.25) drop-shadow(0 0 8px #7c3aed88)'
                                        : undefined,
                                }}
                            >
                                {(bank.isSideQuest ?? true) && (
                                    <text
                                        y={-r - 5}
                                        textAnchor="middle"
                                        fontSize={8}
                                        fill="#7c3aed"
                                        fontStyle="italic"
                                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                                    >
                                        side quest
                                    </text>
                                )}
                                <circle
                                    r={r}
                                    fill={finished ? '#6b7280' : '#7c3aed'}
                                    stroke={finished ? '#9ca3af' : '#a78bfa'}
                                    strokeWidth={2}
                                />
                                <text
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fontSize={10}
                                    fill={finished ? '#e5e7eb' : '#ede9fe'}
                                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                                >
                                    {finished ? '✓' : 'Q'}
                                </text>
                                <text
                                    y={r + 14}
                                    textAnchor="middle"
                                    fontSize={10}
                                    fill={isHovered ? '#ffffff' : '#d1d5db'}
                                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                                >
                                    {label}
                                </text>
                                <text
                                    y={r + 26}
                                    textAnchor="middle"
                                    fontSize={8}
                                    fill="#a1a1aa"
                                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                                >
                                    {clears}/{bank.requiredClears}
                                </text>
                            </g>
                        </g>
                    );
                })}
            </svg>
            )}

            {/* Tooltip portal */}
            {tooltip && showMap && (
                <MissionTooltip
                    data={tooltip}
                    missionResults={missionResults}
                    isAdmin={isAdmin}
                    isLocked={!unlockedIds.has(tooltip.id)}
                    onStartMission={onStartMission}
                    onMarkVictory={onMarkVictory}
                    onDismiss={dismissTooltip}
                />
            )}
            {bankTooltip && showMap && (() => {
                const bank = questBanksOnMap.find((b) => b.id === bankTooltip.bankId);
                if (!bank) return null;
                const unlocked = unlockedQuestBankIds.has(bank.id);
                const eligible = getEligibleQuestsForBank(
                    bank,
                    character.campaignId,
                    questResults,
                );
                return (
                    <QuestBankTooltip
                        data={bankTooltip}
                        bank={bank}
                        eligibleQuests={eligible}
                        clears={countQuestBankClears(bank, questResults)}
                        isLocked={!unlocked && !isAdmin}
                        activeQuestDefId={
                            character.activeQuestRun
                            && (character.activeQuestRun.status === 'active'
                                || character.activeQuestRun.status === 'prep')
                                ? character.activeQuestRun.questDefId
                                : null
                        }
                        onStartQuest={onStartQuest}
                        onAbandonQuest={onAbandonQuest}
                        onDismiss={dismissBankTooltip}
                    />
                );
            })()}
        </div>
    );
}

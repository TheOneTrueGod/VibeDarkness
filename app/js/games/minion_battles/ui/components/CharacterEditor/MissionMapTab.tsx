/**
 * MissionMapTab — SVG-based mission progress map for a campaign character.
 *
 * Shows all missions in the character's campaign as circles connected by lines.
 * Colors: green = victory, red = defeat, gray = no result.
 * Locked missions are dimmed; admins can click them anyway.
 * Hovering a node shows a tooltip; clicking pins it and shows a "Host Mission" button.
 */
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { MissionResult } from '../../../../../types';
import { STORYLINES, MISSION_MAP } from '../../../storylines/index';
import { getUnlockedMissionIds, hasVictoryResult, isMissionCompleted, getAllMissionIdsInOrder, isSideMissionId } from '../../../storylines/unlock';
import { getResolvedMissionResearchRewards } from '../../../../../researchTrees/list';
import ResearchRewardTinyChip from '../../../../../components/ResearchRewardTinyChip';
import ResourcePill, { campaignResourceGains } from '../../../../../components/ResourcePill';
import { MISSION_REWARD_CHIP_CLASSNAME } from '../../../../../components/ResearchRewardTinyChip';
import { getItemDef } from '../../../character_defs/items';
import { TestIds, missionMapNodeTestId } from '../../../../../testing/testIds';

const CIRCLE_R = 28;
const SIDE_CIRCLE_R = 18;
const PADDING = 70;

interface Props {
    character: CampaignCharacter;
    isAdmin: boolean;
    onStartMission: (missionId: string) => void;
    onMarkVictory?: (missionId: string) => Promise<void>;
}

function getMissionColor(missionId: string, missionResults: MissionResult[]): string {
    if (hasVictoryResult(missionId, missionResults)) return '#22c55e'; // green-500
    if (isMissionCompleted(missionId, missionResults)) return '#ef4444'; // red-500
    return '#6b7280'; // gray-500
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

export default function MissionMapTab({ character, isAdmin, onStartMission, onMarkVictory }: Props) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [pressedId, setPressedId] = useState<string | null>(null);
    const [tooltip, setTooltip] = useState<TooltipData | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const storyline = useMemo(
        () => STORYLINES.find((s) => s.id === character.campaignId) ?? null,
        [character.campaignId],
    );

    const missionResults = useMemo(
        () => character.missionResults[character.campaignId] ?? [],
        [character.missionResults, character.campaignId],
    );

    const unlockedIds = useMemo(
        () => (storyline ? getUnlockedMissionIds(storyline, missionResults) : new Set<string>()),
        [storyline, missionResults],
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
            return { id, def, pos, number: idx + 1, isSide };
        });
    }, [missionIds, storyline]);

    const posMap = useMemo(() => {
        const m = new Map<string, { x: number; y: number }>();
        for (const { id, pos } of missions) m.set(id, pos);
        return m;
    }, [missions]);

    // Compute SVG viewBox from mission extents.
    const { minX, minY, maxX, maxY } = useMemo(() => {
        if (missions.length === 0) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const { pos } of missions) {
            if (pos.x < minX) minX = pos.x;
            if (pos.y < minY) minY = pos.y;
            if (pos.x > maxX) maxX = pos.x;
            if (pos.y > maxY) maxY = pos.y;
        }
        return { minX, minY, maxX, maxY };
    }, [missions]);

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
        setTooltip({ id, cx: x, cy: y, pinned: true });
    }, [svgToViewport]);

    const dismissTooltip = useCallback(() => setTooltip(null), []);

    // Dismiss pinned tooltip on Escape or outside click
    useEffect(() => {
        if (!tooltip?.pinned) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissTooltip(); };
        const onMouseDown = (e: MouseEvent) => {
            // Only dismiss if click is outside the tooltip portal (checked via data attribute)
            const target = e.target as HTMLElement;
            if (!target.closest('[data-mission-tooltip]')) dismissTooltip();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onMouseDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onMouseDown);
        };
    }, [tooltip?.pinned, dismissTooltip]);

    if (!storyline) {
        return (
            <div className="flex items-center justify-center h-full text-muted text-sm">
                No campaign assigned to this character.
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-auto p-2">
            <p className="text-xs text-muted mb-2 px-1">{storyline.title}</p>
            <svg
                ref={svgRef}
                viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
                className="w-full"
                style={{ minHeight: Math.max(vbH, 300) }}
                xmlns="http://www.w3.org/2000/svg"
            >
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

                {/* Mission nodes */}
                {missions.map(({ id, def, pos, number, isSide }) => {
                    const isUnlocked = unlockedIds.has(id);
                    const clickable = isUnlocked || isAdmin;
                    const color = getMissionColor(id, missionResults);
                    const dimmed = !isUnlocked && !isAdmin;
                    const isHovered = hoveredId === id;
                    const isPressed = pressedId === id;
                    const isPinned = tooltip?.pinned && tooltip.id === id;
                    const r = isSide ? SIDE_CIRCLE_R : CIRCLE_R;

                    const nodeScale = isPressed ? 0.92 : (isHovered || isPinned) ? 1.1 : 1;
                    const glowColor = color;

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
                                    fill={isSide ? '#1e1b4b' : color}
                                    stroke={isSide ? (hasVictoryResult(id, missionResults) ? '#22c55e' : '#7c3aed') : ((isHovered || isPinned) ? 'white' : '#1f2937')}
                                    strokeWidth={isSide ? 2 : ((isHovered || isPinned) ? 2.5 : 2)}
                                    strokeOpacity={(isHovered || isPinned) ? 0.7 : 1}
                                />
                                {/* Checkmark or number inside side mission circle */}
                                {isSide ? (
                                    <text
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fontSize={10}
                                        fill={hasVictoryResult(id, missionResults) ? '#22c55e' : '#a78bfa'}
                                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                                    >
                                        {hasVictoryResult(id, missionResults) ? '✓' : '★'}
                                    </text>
                                ) : (
                                    <>
                                        {/* Mission image if available */}
                                        {def?.image && (
                                            <image
                                                href={def.image}
                                                x={-r + 4}
                                                y={-r + 4}
                                                width={(r - 4) * 2}
                                                height={(r - 4) * 2}
                                                clipPath={`circle(${r - 4}px)`}
                                            />
                                        )}
                                        {/* Number inside circle */}
                                        <text
                                            textAnchor="middle"
                                            dominantBaseline="central"
                                            fontSize={13}
                                            fontWeight="bold"
                                            fill="white"
                                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                                        >
                                            {number}
                                        </text>
                                    </>
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
            </svg>

            {/* Tooltip portal */}
            {tooltip && (
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
        </div>
    );
}

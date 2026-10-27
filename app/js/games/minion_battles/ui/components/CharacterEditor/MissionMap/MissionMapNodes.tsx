import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Route, Scroll, Skull, Swords, Tent } from 'lucide-react';
import type { MissionResult } from '../../../../../../types';
import type { MissionType } from '../../../../storylines/types';
import type { IBaseMissionDef } from '../../../../storylines/BaseMissionDef';
import type { QuestSlotBank } from '../../../../storylines/questTypes';
import {
    canPlayerViewMission,
    hasVictoryResult,
    isDedicatedQuestBank,
    isMissionDisabled,
} from '../../../../storylines/unlock';
import { missionMapNodeTestId, missionMapQuestBankTestId } from '../../../../../../testing/testIds';
import { questBankMapNodeKey } from '../questBankUi';
import {
    BATTLE_NODE_STROKE,
    CIRCLE_R,
    COMPLETED_MISSION_ACCENT,
    DEFAULT_MISSION_TYPE,
    DISABLED_ADMIN_RING_COLOR,
    DISABLED_NODE_FILL,
    LOCKED_ADMIN_RING_COLOR,
    MISSION_ICON_SIZE,
    SIDE_QUEST_MARK_FONT_SIZE,
    getMissionGlowColor,
    getMissionNodeFill,
    isQuestBankDisabled,
    type QuestBankTooltipData,
    type TooltipData,
} from './missionMapHelpers';

const MISSION_TYPE_ICONS: Record<MissionType, LucideIcon> = {
    battle: Swords,
    story: Scroll,
    boss: Skull,
    campsite: Tent,
};

export interface MissionNodeProps {
    id: string;
    def: IBaseMissionDef | undefined;
    pos: { x: number; y: number };
    isSide: boolean;
    isUnlocked: boolean;
    isAdmin: boolean;
    missionResults: MissionResult[];
    hoveredId: string | null;
    pressedId: string | null;
    tooltip: TooltipData | null;
    setPressedId: React.Dispatch<React.SetStateAction<string | null>>;
    onNodeClick: (id: string, svgPosX: number, svgPosY: number) => void;
    onNodeEnter: (id: string, svgPosX: number, svgPosY: number) => void;
    onNodeLeave: (id: string) => void;
}

/** One mission circle on the map. */
export function MissionNode({
    id,
    def,
    pos,
    isSide,
    isUnlocked,
    isAdmin,
    missionResults,
    hoveredId,
    pressedId,
    tooltip,
    setPressedId,
    onNodeClick: handleNodeClick,
    onNodeEnter: handleNodeEnter,
    onNodeLeave: handleNodeLeave,
}: MissionNodeProps) {
                    const isDisabled = isMissionDisabled(def);
                    const viewable = canPlayerViewMission({ isAdmin, isUnlocked });
                    const missionType = def?.missionType ?? DEFAULT_MISSION_TYPE;
                    // Only a win finishes a mission; a defeat alone leaves it open.
                    const finished = hasVictoryResult(id, missionResults);
                    // Every completed main-path node (battle, boss, story, campsite) gets the green outline.
                    const completedNode = !isSide && finished;
                    const completedCombat = completedNode && missionType === 'battle';
                    const color = getMissionNodeFill(id, missionType, missionResults, isDisabled);
                    const glowColor = completedNode
                        ? COMPLETED_MISSION_ACCENT
                        : getMissionGlowColor(id, missionType, missionResults, isDisabled);
                    const dimmed = !isSide && !isUnlocked && !isAdmin;
                    const isHovered = hoveredId === id;
                    const isPressed = pressedId === id;
                    const isPinned = tooltip?.pinned && tooltip.id === id;
                    const r = CIRCLE_R;
                    const MissionIcon = MISSION_TYPE_ICONS[missionType];
                    const showBattleHalo = !isSide && missionType === 'battle' && !completedCombat && !isDisabled;

                    const nodeScale = isPressed ? 0.92 : (isHovered || isPinned) ? 1.1 : 1;

                    return (
                        // Outer g: positioning via SVG transform (no CSS transform here to avoid conflict)
                        <g
                            key={id}
                            transform={`translate(${pos.x}, ${pos.y})`}
                            onClick={viewable ? () => handleNodeClick(id, pos.x, pos.y) : undefined}
                            onMouseEnter={viewable ? () => handleNodeEnter(id, pos.x, pos.y) : undefined}
                            onMouseLeave={viewable ? () => handleNodeLeave(id) : undefined}
                            onMouseDown={viewable ? () => setPressedId(id) : undefined}
                            onMouseUp={viewable ? () => setPressedId(null) : undefined}
                            onKeyDown={viewable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNodeClick(id, pos.x, pos.y); } } : undefined}
                            tabIndex={viewable ? 0 : undefined}
                            role={viewable ? 'button' : undefined}
                            data-testid={viewable ? missionMapNodeTestId(id) : undefined}
                            aria-label={viewable ? `${def?.name ?? id} — click to view details` : undefined}
                            style={{
                                cursor: viewable ? 'pointer' : 'default',
                                opacity: isSide ? 1 : (dimmed ? 0.35 : 1),
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
                                {isAdmin && !isUnlocked && !isDisabled && (
                                    <circle
                                        r={r + 3}
                                        fill="none"
                                        stroke={LOCKED_ADMIN_RING_COLOR}
                                        strokeWidth={1.5}
                                        strokeDasharray="4 3"
                                    />
                                )}
                                {/* Outer ring for disabled-but-admin-accessible (non-battle; battle uses the type halo) */}
                                {isAdmin && isDisabled && !showBattleHalo && (
                                    <circle
                                        r={r + 3}
                                        fill="none"
                                        stroke={DISABLED_ADMIN_RING_COLOR}
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
                                        ? (finished ? COMPLETED_MISSION_ACCENT : '#7c3aed')
                                        : isDisabled
                                            ? (finished ? COMPLETED_MISSION_ACCENT : DISABLED_ADMIN_RING_COLOR)
                                            : (completedNode
                                                ? COMPLETED_MISSION_ACCENT
                                                : (showBattleHalo
                                                    ? BATTLE_NODE_STROKE
                                                    : ((isHovered || isPinned) ? 'white' : '#1f2937')))}
                                    strokeWidth={isSide || completedNode || showBattleHalo ? 2 : ((isHovered || isPinned) ? 2.5 : 2)}
                                    strokeOpacity={(isHovered || isPinned) && !showBattleHalo ? 0.7 : 1}
                                />
                                {/* Checkmark / star for side missions; checkmark for completed combat; type icon otherwise */}
                                {isSide || completedCombat ? (
                                    <text
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fontSize={SIDE_QUEST_MARK_FONT_SIZE}
                                        fill={finished ? COMPLETED_MISSION_ACCENT : '#a78bfa'}
                                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                                    >
                                        {isSide && !hasVictoryResult(id, missionResults) ? '★' : '✓'}
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
}

export interface QuestBankNodeProps {
    bank: QuestSlotBank;
    isAdmin: boolean;
    clears: number;
    finished: boolean;
    hoveredId: string | null;
    pressedId: string | null;
    bankTooltip: QuestBankTooltipData | null;
    setHoveredId: React.Dispatch<React.SetStateAction<string | null>>;
    setPressedId: React.Dispatch<React.SetStateAction<string | null>>;
    onQuestBankClick: (bank: QuestSlotBank, svgPosX: number, svgPosY: number) => void;
}

/** One quest-bank circle on the map. */
export function QuestBankNode({
    bank,
    isAdmin,
    clears,
    finished,
    hoveredId,
    pressedId,
    bankTooltip,
    setHoveredId,
    setPressedId,
    onQuestBankClick: handleQuestBankClick,
}: QuestBankNodeProps) {
                    const pos = bank.mapPosition!;
                    const nodeId = questBankMapNodeKey(bank.id);
                    const isHovered = hoveredId === nodeId;
                    const isPressed = pressedId === nodeId;
                    const r = CIRCLE_R;
                    const nodeScale = isPressed ? 0.92 : isHovered ? 1.1 : 1;
                    const bankDisabled = isQuestBankDisabled(bank);
                    const label = bank.title ?? bank.id.replace(/_/g, ' ');
                    const fill = finished || bankDisabled ? DISABLED_NODE_FILL : '#7c3aed';
                    const stroke = finished ? COMPLETED_MISSION_ACCENT : '#a78bfa';
                    const glow = '#7c3aed';

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
                                outline: 'none',
                            }}
                        >
                            <g
                                style={{
                                    transform: `scale(${nodeScale})`,
                                    transformOrigin: '0px 0px',
                                    transition: 'transform 0.12s ease, filter 0.12s ease',
                                    filter: isHovered && !isPressed
                                        ? `brightness(1.25) drop-shadow(0 0 8px ${glow}88)`
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
                                {isAdmin && bankDisabled && (
                                    <circle
                                        r={r + 3}
                                        fill="none"
                                        stroke={DISABLED_ADMIN_RING_COLOR}
                                        strokeWidth={1.5}
                                        strokeDasharray="4 3"
                                    />
                                )}
                                <circle
                                    r={r}
                                    fill={fill}
                                    stroke={stroke}
                                    strokeWidth={2}
                                />
                                {finished ? (
                                    <text
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fontSize={SIDE_QUEST_MARK_FONT_SIZE}
                                        fill={COMPLETED_MISSION_ACCENT}
                                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                                    >
                                        ✓
                                    </text>
                                ) : (
                                    <Route
                                        width={MISSION_ICON_SIZE}
                                        height={MISSION_ICON_SIZE}
                                        x={-MISSION_ICON_SIZE / 2}
                                        y={-MISSION_ICON_SIZE / 2}
                                        color="#ede9fe"
                                        strokeWidth={2.25}
                                        aria-hidden
                                        style={{ pointerEvents: 'none' }}
                                    />
                                )}
                                <text
                                    y={r + 14}
                                    textAnchor="middle"
                                    fontSize={10}
                                    fill={isHovered ? '#ffffff' : '#d1d5db'}
                                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                                >
                                    {label}
                                </text>
                                {!isDedicatedQuestBank(bank) && (
                                <text
                                    y={r + 26}
                                    textAnchor="middle"
                                    fontSize={8}
                                    fill="#a1a1aa"
                                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                                >
                                    {clears}/{bank.requiredClears}
                                </text>
                                )}
                            </g>
                        </g>
                    );
}

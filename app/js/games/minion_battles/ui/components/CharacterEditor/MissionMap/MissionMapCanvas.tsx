import React from 'react';
import type { MissionResult } from '../../../../../../types';
import type { CampaignChapterDef, StorylineDef } from '../../../../storylines/types';
import type { IBaseMissionDef } from '../../../../storylines/BaseMissionDef';
import type { QuestResult, QuestSlotBank } from '../../../../storylines/questTypes';
import { countQuestBankClears } from '../../../../storylines/unlock';
import { missionMapEdgeStroke, questBankMapNodeKey } from '../questBankUi';
import { MissionNode, QuestBankNode } from './MissionMapNodes';
import { BOSS_GRADIENT_ID, MAP_DIVIDER_INSET, type QuestBankTooltipData, type TooltipData } from './missionMapHelpers';

interface Props {
    svgRef: React.RefObject<SVGSVGElement | null>;
    storyline: StorylineDef;
    isAdmin: boolean;
    viewBox: { vbX: number; vbY: number; vbW: number; vbH: number };
    mapDividers: NonNullable<CampaignChapterDef['mapDividers']>;
    missions: { id: string; def: IBaseMissionDef | undefined; pos: { x: number; y: number }; isSide: boolean }[];
    questBanksOnMap: QuestSlotBank[];
    posMap: Map<string, { x: number; y: number }>;
    completedNodeKeys: Set<string>;
    unlockedIds: Set<string>;
    missionResults: MissionResult[];
    questResults: QuestResult[];
    hoveredId: string | null;
    pressedId: string | null;
    tooltip: TooltipData | null;
    bankTooltip: QuestBankTooltipData | null;
    setHoveredId: React.Dispatch<React.SetStateAction<string | null>>;
    setPressedId: React.Dispatch<React.SetStateAction<string | null>>;
    onNodeClick: (id: string, svgPosX: number, svgPosY: number) => void;
    onNodeEnter: (id: string, svgPosX: number, svgPosY: number) => void;
    onNodeLeave: (id: string) => void;
    onQuestBankClick: (bank: QuestSlotBank, svgPosX: number, svgPosY: number) => void;
}

/** The SVG map: chapter dividers, connection lines, mission nodes and quest-bank nodes. */
export default function MissionMapCanvas({
    svgRef,
    storyline,
    isAdmin,
    viewBox,
    mapDividers,
    missions,
    questBanksOnMap,
    posMap,
    completedNodeKeys,
    unlockedIds,
    missionResults,
    questResults,
    hoveredId,
    pressedId,
    tooltip,
    bankTooltip,
    setHoveredId,
    setPressedId,
    onNodeClick,
    onNodeEnter,
    onNodeLeave,
    onQuestBankClick,
}: Props) {
    const { vbX, vbY, vbW, vbH } = viewBox;
    const edgeDone = (a: string, b: string): boolean => completedNodeKeys.has(a) && completedNodeKeys.has(b);

    return (
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

                {/* Chapter section dividers (e.g. "Side Quests") */}
                {mapDividers.map((divider) => (
                    <g key={`map-divider-${divider.y}`} style={{ pointerEvents: 'none' }}>
                        <line
                            x1={vbX + MAP_DIVIDER_INSET}
                            y1={divider.y}
                            x2={vbX + vbW - MAP_DIVIDER_INSET}
                            y2={divider.y}
                            stroke="#7c3aed"
                            strokeWidth={1.5}
                            strokeOpacity={0.8}
                        />
                        {divider.label && (
                            <text
                                x={vbX + MAP_DIVIDER_INSET}
                                y={divider.y + 16}
                                fontSize={11}
                                fontWeight={600}
                                fill="#a78bfa"
                                style={{ userSelect: 'none' }}
                            >
                                {divider.label}
                            </text>
                        )}
                    </g>
                ))}

                {/* Connection lines */}
                {(storyline.edges ?? []).map((edge) => {
                    const from = posMap.get(edge.fromMissionId);
                    const to = posMap.get(edge.toMissionId);
                    if (!from || !to) return null;
                    const style = missionMapEdgeStroke(edgeDone(edge.fromMissionId, edge.toMissionId), {
                        stroke: edge.isSideMission ? '#4c1d95' : '#374151',
                        strokeWidth: edge.isSideMission ? 2 : 3,
                        strokeDasharray: edge.isSideMission ? '5 4' : undefined,
                    });
                    return (
                        <line
                            key={`${edge.fromMissionId}-${edge.toMissionId}`}
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            stroke={style.stroke}
                            strokeWidth={style.strokeWidth}
                            strokeDasharray={style.strokeDasharray}
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Side-quest edges from unlock mission or prior bank → quest bank node */}
                {questBanksOnMap.map((bank) => {
                    if (!bank.mapPosition) return null;
                    const to = bank.mapPosition;
                    const bankKey = questBankMapNodeKey(bank.id);
                    const fromKey = bank.unlockAfterQuestBankId
                        ? questBankMapNodeKey(bank.unlockAfterQuestBankId)
                        : bank.unlockAfterMissionId;
                    if (!fromKey) return null;
                    const from = posMap.get(fromKey);
                    if (!from) return null;
                    const style = missionMapEdgeStroke(edgeDone(fromKey, bankKey), {
                        stroke: '#4c1d95',
                        strokeWidth: 2,
                        strokeDasharray: '5 4',
                    });
                    return (
                        <line
                            key={`quest-bank-edge-${bank.id}`}
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            stroke={style.stroke}
                            strokeWidth={style.strokeWidth}
                            strokeDasharray={style.strokeDasharray}
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Quest-bank completion → gated mission (e.g. Surface Quests 2 → Thornbinder) */}
                {(storyline.edges ?? []).map((edge) => {
                    if (!edge.requiresQuestBankId) return null;
                    const fromKey = questBankMapNodeKey(edge.requiresQuestBankId);
                    const from = posMap.get(fromKey);
                    const to = posMap.get(edge.toMissionId);
                    if (!from || !to) return null;
                    const style = missionMapEdgeStroke(edgeDone(fromKey, edge.toMissionId), {
                        stroke: '#4c1d95',
                        strokeWidth: 2,
                        strokeDasharray: '5 4',
                    });
                    return (
                        <line
                            key={`quest-bank-gate-${edge.requiresQuestBankId}-${edge.toMissionId}`}
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            stroke={style.stroke}
                            strokeWidth={style.strokeWidth}
                            strokeDasharray={style.strokeDasharray}
                            strokeLinecap="round"
                        />
                    );
                })}


                {/* Mission nodes */}
                {missions.map(({ id, def, pos, isSide }) => (
                    <MissionNode
                        key={id}
                        id={id}
                        def={def}
                        pos={pos}
                        isSide={isSide}
                        isUnlocked={unlockedIds.has(id)}
                        isAdmin={isAdmin}
                        missionResults={missionResults}
                        hoveredId={hoveredId}
                        pressedId={pressedId}
                        tooltip={tooltip}
                        setPressedId={setPressedId}
                        onNodeClick={onNodeClick}
                        onNodeEnter={onNodeEnter}
                        onNodeLeave={onNodeLeave}
                    />
                ))}

                {/* Quest slot bank nodes (side-quest style) */}
                {questBanksOnMap.map((bank) => (
                    <QuestBankNode
                        key={questBankMapNodeKey(bank.id)}
                        bank={bank}
                        isAdmin={isAdmin}
                        clears={countQuestBankClears(bank, questResults)}
                        finished={completedNodeKeys.has(questBankMapNodeKey(bank.id))}
                        hoveredId={hoveredId}
                        pressedId={pressedId}
                        bankTooltip={bankTooltip}
                        setHoveredId={setHoveredId}
                        setPressedId={setPressedId}
                        onQuestBankClick={onQuestBankClick}
                    />
                ))}
            </svg>
    );
}

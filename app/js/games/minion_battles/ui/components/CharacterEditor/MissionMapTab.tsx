/**
 * MissionMapTab — SVG-based mission progress map for a campaign character.
 *
 * Shows all missions in the character's campaign as circles connected by lines.
 * Colors: green = victory, red = defeat, gray = no result.
 * Locked missions are dimmed; admins can click them anyway.
 */
import React, { useMemo } from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { STORYLINES, MISSION_MAP } from '../../../storylines/index';
import { getUnlockedMissionIds, hasVictoryResult, isMissionCompleted, getAllMissionIdsInOrder } from '../../../storylines/unlock';

const CIRCLE_R = 28;
const PADDING = 70;

interface Props {
    character: CampaignCharacter;
    isAdmin: boolean;
    onStartMission: (missionId: string) => void;
}

function getMissionColor(
    missionId: string,
    missionResults: import('../../../../../types').MissionResult[],
): string {
    if (hasVictoryResult(missionId, missionResults)) return '#22c55e'; // green-500
    if (isMissionCompleted(missionId, missionResults)) return '#ef4444'; // red-500
    return '#6b7280'; // gray-500
}

export default function MissionMapTab({ character, isAdmin, onStartMission }: Props) {
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
            const col = idx % COLS;
            const row = Math.floor(idx / COLS);
            const xDir = row % 2 === 0 ? 1 : -1;
            const baseX = row % 2 === 0 ? 100 : 100 + COL_STEP * (COLS - 1);
            const pos = def?.mapPosition ?? {
                x: baseX + xDir * col * COL_STEP,
                y: 120 + row * ROW_STEP,
            };
            return { id, def, pos, number: idx + 1 };
        });
    }, [missionIds]);

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
                            stroke="#374151"
                            strokeWidth={3}
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Mission nodes */}
                {missions.map(({ id, def, pos, number }) => {
                    const isUnlocked = unlockedIds.has(id);
                    const clickable = isUnlocked || isAdmin;
                    const color = getMissionColor(id, missionResults);
                    const dimmed = !isUnlocked && !isAdmin;

                    return (
                        <g
                            key={id}
                            transform={`translate(${pos.x}, ${pos.y})`}
                            onClick={clickable ? () => onStartMission(id) : undefined}
                            style={{
                                cursor: clickable ? 'pointer' : 'default',
                                opacity: dimmed ? 0.35 : 1,
                            }}
                        >
                            {/* Outer ring for locked-but-admin-accessible */}
                            {isAdmin && !isUnlocked && (
                                <circle
                                    r={CIRCLE_R + 3}
                                    fill="none"
                                    stroke="#f59e0b"
                                    strokeWidth={1.5}
                                    strokeDasharray="4 3"
                                />
                            )}
                            <circle
                                r={CIRCLE_R}
                                fill={color}
                                stroke="#1f2937"
                                strokeWidth={2}
                            />
                            {/* Mission image if available */}
                            {def?.image && (
                                <image
                                    href={def.image}
                                    x={-CIRCLE_R + 4}
                                    y={-CIRCLE_R + 4}
                                    width={(CIRCLE_R - 4) * 2}
                                    height={(CIRCLE_R - 4) * 2}
                                    clipPath={`circle(${CIRCLE_R - 4}px)`}
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
                            {/* Mission name below */}
                            <text
                                y={CIRCLE_R + 14}
                                textAnchor="middle"
                                fontSize={10}
                                fill="#d1d5db"
                                style={{ pointerEvents: 'none', userSelect: 'none' }}
                            >
                                {def?.name ?? id}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

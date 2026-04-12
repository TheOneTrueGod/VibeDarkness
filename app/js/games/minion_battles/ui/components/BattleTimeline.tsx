import React, { useMemo } from 'react';
import type { PlayerState } from '../../../../types';
import type { GameEngine } from '../../game/GameEngine';
import { getAbility } from '../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../abilities/Ability';
import type { Unit } from '../../game/units/Unit';
import { TimelinePhaseSegment } from './TimelinePhaseSegment';
import slimeIcon from '../../assets/characters/slime.svg';
import swordwomanIcon from '../../assets/characters/swordwoman.svg';
import wolfHeadIcon from '../../assets/characters/dark_animals/wolf-head.svg';
import wolfHowlIcon from '../../assets/characters/dark_animals/wolf-howl.svg';
import boarIcon from '../../assets/characters/dark_animals/boar.svg';
import {
    buildPrimaryTimelineSegments,
    computeVisiblePrimarySegments,
    getEnemyActionWindowFromIntervals,
    normalizeAbilityTimingsToIntervals,
    type AbilityTimingInterval,
    type BattleTimelinePhaseId,
} from '../../abilities/abilityTimings';

/** Character icon URLs for enemy timeline markers. Fallback to letter if unknown. */
const ENEMY_CHARACTER_ICONS: Record<string, string> = {
    enemy_melee: swordwomanIcon,
    enemy_ranged: slimeIcon,
    dark_wolf: wolfHeadIcon,
    alpha_wolf: wolfHowlIcon,
    boar: boarIcon,
};

/** Light gray background line with half-second ticks and time labels for a timeline row. */
function TimelineTimeRuler({ windowSeconds }: { windowSeconds: number }) {
    const ticks: number[] = [];
    for (let t = 0; t <= windowSeconds; t += 0.5) {
        ticks.push(t);
    }
    return (
        <div className="absolute inset-0 flex items-center pointer-events-none" aria-hidden>
            {/* Full-width light gray line */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-gray-600" />
            {/* Half-second ticks and labels */}
            {ticks.map((t) => {
                const leftPercent = (t / windowSeconds) * 100;
                return (
                    <div
                        key={t}
                        className="absolute top-1/2 -translate-x-1/2 flex flex-col items-center"
                        style={{ left: `${leftPercent}%` }}
                    >
                        <div className="w-px h-1.5 bg-gray-500 -translate-y-1/2" />
                        <span className="text-[10px] text-gray-500 mt-0.5">
                            {t}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function intervalsForAbility(ability: AbilityStatic): AbilityTimingInterval[] {
    return normalizeAbilityTimingsToIntervals(ability.abilityTimings);
}

function enemyActionWindowForAbility(ability: AbilityStatic): {
    actionStart: number;
    actionEnd: number;
} {
    const intervals = intervalsForAbility(ability);
    return getEnemyActionWindowFromIntervals(intervals) ?? { actionStart: 0, actionEnd: 0 };
}

interface BattleTimelineProps {
    engine: GameEngine;
    players: Record<string, PlayerState>;
    localPlayerId: string;
    /** How many seconds into the future the timeline should show. Default 4s. */
    windowSeconds?: number;
    /** When the local player has a card selected (previewing), show how it would look on the timeline if they used it now. */
    previewAbility?: AbilityStatic | null;
}

function renderEnemyRow(
    engine: GameEngine,
    windowSeconds: number,
): React.ReactNode {
    const now = engine.gameTime;

    const markers: {
        unit: Unit;
        ability: AbilityStatic;
        startFromNow: number;
        endFromNow: number;
    }[] = [];

    for (const unit of engine.units) {
        if (!unit.isAlive() || unit.teamId !== 'enemy') continue;
        for (const active of unit.activeAbilities) {
            const ability = getAbility(active.abilityId);
            if (!ability) continue;
            const { actionStart, actionEnd } = enemyActionWindowForAbility(ability);
            if (actionEnd <= actionStart) continue;
            const elapsed = now - active.startTime;
            const startFromNow = actionStart - elapsed;
            const endFromNow = actionEnd - elapsed;

            if (endFromNow <= 0 || startFromNow >= windowSeconds) {
                continue;
            }

            markers.push({
                unit,
                ability,
                startFromNow: Math.max(0, startFromNow),
                endFromNow: Math.min(windowSeconds, endFromNow),
            });
        }
    }

    return (
        <div className="contents">
            <div className="flex items-center gap-2 text-xs">
                <div className="w-7 h-7 rounded-sm bg-red-700 flex items-center justify-center text-black font-bold text-xs">
                    E
                </div>
                <span className="text-gray-200">Enemies</span>
            </div>
            <div className="relative h-10 bg-dark-800/80 rounded-md overflow-hidden">
                <TimelineTimeRuler windowSeconds={windowSeconds} />
                <div className="absolute inset-0">
                    {markers.map((marker, idx) => {
                        const startPercent = (marker.startFromNow / windowSeconds) * 100;
                        const duration = marker.endFromNow - marker.startFromNow;
                        const widthPercent = (duration / windowSeconds) * 100;
                        const endPercent = (marker.endFromNow / windowSeconds) * 100;

                        const iconUrl = ENEMY_CHARACTER_ICONS[marker.unit.characterId];
                        const nameInitial = marker.unit.name?.[0]?.toUpperCase() ?? '?';

                        return (
                            <React.Fragment key={`${marker.unit.id}-${idx}`}>
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 h-[4px] bg-red-600 rounded-full"
                                    style={{
                                        left: `${startPercent}%`,
                                        width: `${widthPercent}%`,
                                    }}
                                />
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-sm bg-red-600 border border-black flex items-center justify-center overflow-hidden"
                                    style={{
                                        left: `${endPercent}%`,
                                    }}
                                    title={marker.unit.name || 'Enemy'}
                                >
                                    {iconUrl ? (
                                        <img
                                            src={iconUrl}
                                            alt=""
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <span className="text-[10px] font-bold text-white">
                                            {nameInitial}
                                        </span>
                                    )}
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function renderPlayerRow(
    engine: GameEngine,
    playerId: string,
    player: PlayerState,
    windowSeconds: number,
    localPlayerId: string,
    previewAbility: AbilityStatic | null | undefined,
): React.ReactNode {
    const now = engine.gameTime;
    const unit = engine.units.find(
        (u) => u.ownerId === playerId && u.isAlive(),
    );

    if (!unit) {
        return (
            <div className="contents" key={playerId}>
                <div className="flex items-center gap-2 text-xs">
                    <div
                        className="w-7 h-7 rounded-sm shrink-0 flex items-center justify-center text-black font-bold text-xs"
                        style={{ backgroundColor: player.color }}
                        title={player.name}
                    >
                        {player.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className="text-gray-200">{player.name}</span>
                </div>
                <div className="relative h-10 bg-dark-800/80 rounded-md overflow-hidden">
                    <TimelineTimeRuler windowSeconds={windowSeconds} />
                </div>
            </div>
        );
    }

    const active = unit.activeAbilities[0];
    const ability = active ? getAbility(active.abilityId) : null;
    const isLocalPlayer = playerId === localPlayerId;
    const showPreview = !!(isLocalPlayer && previewAbility);

    let segments: {
        phaseId: BattleTimelinePhaseId;
        start: number;
        duration: number;
        label: string;
        description: string;
    }[] = [];
    let elapsed = 0;
    let isPreview = false;

    if (showPreview && previewAbility) {
        const intervals = intervalsForAbility(previewAbility);
        const merged = buildPrimaryTimelineSegments(intervals);
        segments = computeVisiblePrimarySegments(merged, 0, windowSeconds);
        elapsed = 0;
        isPreview = true;
    } else if (active && ability) {
        const intervals = intervalsForAbility(ability);
        const merged = buildPrimaryTimelineSegments(intervals);
        elapsed = now - active.startTime;
        segments = computeVisiblePrimarySegments(merged, elapsed, windowSeconds);
    }

    const displayAbility = ability ?? (showPreview ? previewAbility : null);
    const hasTimeline = displayAbility && segments.length > 0;

    let minStart = Number.POSITIVE_INFINITY;
    let maxEnd = 0;
    for (const seg of segments) {
        minStart = Math.min(minStart, seg.start);
        maxEnd = Math.max(maxEnd, seg.start + seg.duration);
    }
    if (!isFinite(minStart)) {
        minStart = 0;
    }
    const centerTime =
        segments.length > 0 ? (minStart + maxEnd) / 2 : windowSeconds / 2;
    const iconLeftPercent = (centerTime / windowSeconds) * 100;

    return (
        <div className="contents" key={playerId}>
            <div className="flex items-center gap-2 text-xs">
                <div
                    className="w-7 h-7 rounded-sm shrink-0 flex items-center justify-center text-black font-bold text-xs"
                    style={{ backgroundColor: player.color }}
                    title={player.name}
                >
                    {player.name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex flex-col">
                    <span className="text-gray-200">
                        {player.name}
                        {player.isHost && (
                            <span className="ml-1 text-[10px] text-primary">
                                (HOST)
                            </span>
                        )}
                    </span>
                    <span className="text-[10px] text-gray-400">
                        {unit.name}
                    </span>
                </div>
            </div>
            <div className="relative h-10 bg-dark-800/80 rounded-md overflow-hidden">
                <TimelineTimeRuler windowSeconds={windowSeconds} />
                {hasTimeline && displayAbility && (
                    <div className={`absolute inset-0 ${isPreview ? 'opacity-70' : ''}`}>
                        {segments.map((seg, idx) => (
                            <TimelinePhaseSegment
                                key={idx}
                                phase={seg.phaseId}
                                leftPercent={(seg.start / windowSeconds) * 100}
                                widthPercent={(seg.duration / windowSeconds) * 100}
                                label={seg.label}
                                description={seg.description}
                            />
                        ))}

                        <div
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-md bg-dark-900 flex items-center justify-center text-[10px] text-gray-100"
                            style={{
                                left: `${Math.max(0, Math.min(100, iconLeftPercent))}%`,
                            }}
                            title={displayAbility.name}
                        >
                            <div
                                className="w-6 h-6 overflow-hidden [&_svg]:w-full [&_svg]:h-full [&_img]:w-full [&_img]:h-full"
                                dangerouslySetInnerHTML={{
                                    __html: displayAbility.image,
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function BattleTimeline({
    engine,
    players,
    localPlayerId,
    windowSeconds = 4,
    previewAbility = null,
}: BattleTimelineProps) {
    const orderedPlayers = useMemo(() => {
        const entries = Object.entries(players);
        entries.sort((a, b) => {
            if (a[0] === localPlayerId) return -1;
            if (b[0] === localPlayerId) return 1;
            return a[1].name.localeCompare(b[1].name);
        });
        return entries;
    }, [players, localPlayerId]);

    return (
        <div className="w-full bg-dark-900/95 px-3 py-2 flex-shrink-0">
            <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-2">
                {renderEnemyRow(engine, windowSeconds)}
                {orderedPlayers.map(([playerId, player]) =>
                    renderPlayerRow(engine, playerId, player, windowSeconds, localPlayerId, previewAbility),
                )}
            </div>
        </div>
    );
}

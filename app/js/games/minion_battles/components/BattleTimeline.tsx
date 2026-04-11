import React, { useMemo } from 'react';
import type { PlayerState } from '../../../types';
import type { GameEngine } from '../game/GameEngine';
import { getAbility } from '../abilities/AbilityRegistry';
import type { AbilityStatic } from '../abilities/Ability';
import type { Unit } from '../game/units/Unit';
import { TimelinePhaseSegment } from './TimelinePhaseSegment';
import slimeIcon from '../assets/characters/slime.svg';
import swordwomanIcon from '../assets/characters/swordwoman.svg';
import wolfHeadIcon from '../assets/characters/dark_animals/wolf-head.svg';
import wolfHowlIcon from '../assets/characters/dark_animals/wolf-howl.svg';
import boarIcon from '../assets/characters/dark_animals/boar.svg';

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

type PhaseId = 'startup' | 'active' | 'iFrame' | 'cooldown';

interface AbilityPhaseDef {
    phase: PhaseId;
    duration: number;
    description: string;
}

interface AbilityTimelineDef {
    phases: AbilityPhaseDef[];
    /** When the "important" action starts relative to ability start. */
    actionStart: number;
    /** Duration of the important action window. */
    actionDuration: number;
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

function buildDefaultTimeline(ability: AbilityStatic): AbilityTimelineDef {
    // Heuristic: use prefire as startup, a short active window, rest as cooldown.
    const startup = Math.max(0, ability.prefireTime);
    const active = 0.5;
    const remaining = Math.max(0, ability.cooldownTime - startup - active);
    const cooldown = remaining;

    const phases: AbilityPhaseDef[] = [];
    if (startup > 0) {
        phases.push({
            phase: 'startup',
            duration: startup,
            description: 'Preparing the ability.',
        });
    }
    phases.push({
        phase: 'active',
        duration: active,
        description: 'The ability is hitting or taking effect.',
    });
    if (cooldown > 0) {
        phases.push({
            phase: 'cooldown',
            duration: cooldown,
            description: 'Recovering before the next action.',
        });
    }

    return {
        phases,
        actionStart: startup,
        actionDuration: active,
    };
}

function getAbilityTimelineDef(ability: AbilityStatic): AbilityTimelineDef {
    // Example of hand-tuned timing for specific abilities.
    if (ability.id === 'throw_rock') {
        const startup = 0.3;
        const active = 0.7;
        const cooldown = Math.max(0, ability.cooldownTime - startup - active);
        const phases: AbilityPhaseDef[] = [
            {
                phase: 'startup',
                duration: startup,
                description: 'Winding up to throw the rock.',
            },
            {
                phase: 'active',
                duration: active,
                description: 'Rock is in flight and can hit enemies.',
            },
        ];
        if (cooldown > 0) {
            phases.push({
                phase: 'cooldown',
                duration: cooldown,
                description: 'Recovering after the throw.',
            });
        }
        return {
            phases,
            actionStart: startup,
            actionDuration: active,
        };
    }

    return buildDefaultTimeline(ability);
}

function computeRemainingPhases(
    timeline: AbilityTimelineDef,
    elapsed: number,
    windowSeconds: number,
): AbilityPhaseDef[] & { _meta?: { segments: { phase: PhaseId; start: number; duration: number }[] } } {
    const segments: { phase: PhaseId; start: number; duration: number }[] = [];
    let cursor = 0;
    for (const phase of timeline.phases) {
        const phaseStart = cursor;
        const phaseEnd = cursor + phase.duration;
        cursor = phaseEnd;

        if (phaseEnd <= elapsed) continue;

        const visibleStart = Math.max(phaseStart, elapsed);
        const visibleDuration = phaseEnd - visibleStart;
        const offsetFromNow = visibleStart - elapsed;

        if (offsetFromNow >= windowSeconds) continue;

        const clampedDuration = Math.min(visibleDuration, windowSeconds - offsetFromNow);
        if (clampedDuration <= 0) continue;

        segments.push({
            phase: phase.phase,
            start: offsetFromNow,
            duration: clampedDuration,
        });
    }

    const phasesCopy = timeline.phases.slice() as AbilityPhaseDef[] & {
        _meta?: { segments: { phase: PhaseId; start: number; duration: number }[] };
    };
    phasesCopy._meta = { segments };
    return phasesCopy;
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
            const timeline = getAbilityTimelineDef(ability);
            const elapsed = now - active.startTime;
            const actionStart = timeline.actionStart;
            const actionEnd = actionStart + timeline.actionDuration;
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

    let segments:
        | {
              phase: PhaseId;
              start: number;
              duration: number;
          }[] = [];
    let abilityTimeline: AbilityTimelineDef | null = null;
    let elapsed = 0;
    let isPreview = false;

    if (showPreview && previewAbility) {
        abilityTimeline = getAbilityTimelineDef(previewAbility);
        elapsed = 0;
        const timelineWithMeta = computeRemainingPhases(
            abilityTimeline,
            0,
            windowSeconds,
        );
        segments = timelineWithMeta._meta?.segments ?? [];
        isPreview = true;
    } else if (active && ability) {
        abilityTimeline = getAbilityTimelineDef(ability);
        elapsed = now - active.startTime;
        const timelineWithMeta = computeRemainingPhases(
            abilityTimeline,
            elapsed,
            windowSeconds,
        );
        segments = timelineWithMeta._meta?.segments ?? [];
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
                {hasTimeline && displayAbility && abilityTimeline && (
                    <div className={`absolute inset-0 ${isPreview ? 'opacity-70' : ''}`}>
                        {segments.map((seg, idx) => {
                            const leftPercent =
                                (seg.start / windowSeconds) * 100;
                            const widthPercent =
                                (seg.duration / windowSeconds) * 100;
                            const phaseDef = abilityTimeline!.phases.find(
                                (p) => p.phase === seg.phase,
                            );
                            const label =
                                seg.phase === 'startup'
                                    ? 'Startup'
                                    : seg.phase === 'active'
                                      ? 'Active'
                                      : seg.phase === 'iFrame'
                                          ? 'iFrame'
                                          : 'Cooldown';
                            const description =
                                phaseDef?.description ??
                                (seg.phase === 'startup'
                                    ? 'Preparing the ability.'
                                    : seg.phase === 'active'
                                      ? 'The ability is active.'
                                      : seg.phase === 'iFrame'
                                          ? 'Invincibility frames.'
                                          : 'Recovering after the action.');

                            return (
                                <TimelinePhaseSegment
                                    key={idx}
                                    phase={seg.phase}
                                    leftPercent={leftPercent}
                                    widthPercent={widthPercent}
                                    label={label}
                                    description={description}
                                />
                            );
                        })}

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


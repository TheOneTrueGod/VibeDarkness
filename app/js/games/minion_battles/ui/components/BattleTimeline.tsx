import React, { useCallback, useMemo, useState } from 'react';
import type { PlayerState } from '../../../../types';
import type { GameEngine } from '../../game/GameEngine';
import { getAbility } from '../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../abilities/Ability';
import type { Unit } from '../../game/units/Unit';
import { TimelinePhaseSegment } from './TimelinePhaseSegment';
import { TimelineHoverFlyout } from './TimelineHoverFlyout';
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
    resolveAbilityTimingEntries,
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

export type TimelinePanelHover =
    | {
          rowKey: string;
          segmentIndex: number;
          unit: Unit;
          ability: AbilityStatic;
      }
    | null;

/** Light gray background line with half-second ticks and time labels for a timeline row. */
function TimelineTimeRuler({ windowSeconds }: { windowSeconds: number }) {
    if (windowSeconds <= 0) {
        return null;
    }
    const ticks: number[] = [];
    const step = 0.5;
    for (let t = 0; t <= windowSeconds + step / 4; t += step) {
        ticks.push(t);
    }
    const lastTick = ticks[ticks.length - 1] ?? 0;

    return (
        <div className="pointer-events-none absolute inset-0 flex items-center overflow-visible" aria-hidden>
            {/* Full-width light gray line */}
            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gray-600" />
            {/* Half-second ticks and labels — edge ticks align inward so labels are not half outside the bar */}
            {ticks.map((t) => {
                const leftPercent = (t / windowSeconds) * 100;
                const atStart = Math.abs(t) < 1e-6;
                const atEnd = Math.abs(t - lastTick) < 1e-6 && !atStart;
                return (
                    <div
                        key={t}
                        className={
                            atStart
                                ? 'absolute top-1/2 left-0 flex translate-x-0 flex-col items-start'
                                : atEnd
                                  ? 'absolute top-1/2 left-full flex -translate-x-full flex-col items-end'
                                  : 'absolute top-1/2 flex -translate-x-1/2 flex-col items-center'
                        }
                        style={atStart || atEnd ? undefined : { left: `${leftPercent}%` }}
                    >
                        <div className="h-1.5 w-px -translate-y-1/2 bg-gray-500" />
                        <span className="mt-0.5 whitespace-nowrap text-[10px] text-gray-500">{t}</span>
                    </div>
                );
            })}
        </div>
    );
}

function intervalsForAbility(ability: AbilityStatic, unit?: Unit, engine?: GameEngine): AbilityTimingInterval[] {
    return normalizeAbilityTimingsToIntervals(resolveAbilityTimingEntries(ability, unit, engine));
}

function enemyActionWindowForAbility(
    ability: AbilityStatic,
    unit?: Unit,
    engine?: GameEngine,
): {
    actionStart: number;
    actionEnd: number;
} {
    const intervals = intervalsForAbility(ability, unit, engine);
    return getEnemyActionWindowFromIntervals(intervals) ?? { actionStart: 0, actionEnd: 0 };
}

type BattleTimelineLayout = 'strip' | 'rail';

interface BattleTimelineProps {
    engine: GameEngine;
    players: Record<string, PlayerState>;
    localPlayerId: string;
    /** How many seconds into the future the timeline should show. Default 2s. */
    windowSeconds?: number;
    /** When the local player has a card selected (previewing), show how it would look on the timeline if they used it now. */
    previewAbility?: AbilityStatic | null;
    /**
     * `strip` — full-width bar (e.g. below canvas). `rail` — left sidebar: fill parent height, scroll rows internally.
     */
    layout?: BattleTimelineLayout;
}

function renderEnemyTimelineTrack(
    windowSeconds: number,
    markers: {
        unit: Unit;
        ability: AbilityStatic;
        startFromNow: number;
        endFromNow: number;
    }[],
    setHover: (next: TimelinePanelHover) => void,
): React.ReactNode {
    return (
        <div className="relative h-10 overflow-visible rounded-md bg-dark-800/80">
            <TimelineTimeRuler windowSeconds={windowSeconds} />
            <div className="absolute inset-0 overflow-visible rounded-md">
                {markers.map((marker, idx) => {
                    const startPercent = (marker.startFromNow / windowSeconds) * 100;
                    const duration = marker.endFromNow - marker.startFromNow;
                    const widthPercent = (duration / windowSeconds) * 100;
                    const endPercent = (marker.endFromNow / windowSeconds) * 100;

                    const iconUrl = ENEMY_CHARACTER_ICONS[marker.unit.characterId];
                    const nameInitial = marker.unit.name?.[0]?.toUpperCase() ?? '?';
                    const rowKey = `enemy:${marker.unit.id}:${idx}`;

                    const onMarkerEnter = () => {
                        setHover({
                            rowKey,
                            segmentIndex: 0,
                            unit: marker.unit,
                            ability: marker.ability,
                        });
                    };

                    return (
                        <React.Fragment key={`${marker.unit.id}-${idx}`}>
                            <div
                                className="absolute top-1/2 z-20 flex -translate-y-1/2 cursor-default items-center"
                                style={{
                                    left: `${startPercent}%`,
                                    width: `${widthPercent}%`,
                                    minWidth: 4,
                                    height: 28,
                                }}
                                onPointerEnter={onMarkerEnter}
                            >
                                <div className="h-[4px] w-full rounded-full bg-red-600" />
                            </div>
                            <div
                                className="absolute top-1/2 z-30 flex h-5 w-5 -translate-y-1/2 cursor-default items-center justify-center overflow-hidden rounded-sm border border-black bg-red-600"
                                style={{
                                    left: `${endPercent}%`,
                                }}
                                title={marker.unit.name || 'Enemy'}
                                onPointerEnter={onMarkerEnter}
                            >
                                {iconUrl ? (
                                    <img src={iconUrl} alt="" className="h-full w-full object-contain" />
                                ) : (
                                    <span className="text-[10px] font-bold text-white">{nameInitial}</span>
                                )}
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}

function collectEnemyMarkers(
    engine: GameEngine,
    windowSeconds: number,
): {
    unit: Unit;
    ability: AbilityStatic;
    startFromNow: number;
    endFromNow: number;
}[] {
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
            const { actionStart, actionEnd } = enemyActionWindowForAbility(ability, unit, engine);
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
    return markers;
}

function renderEnemyRow(
    engine: GameEngine,
    windowSeconds: number,
    layout: BattleTimelineLayout,
    setHover: (next: TimelinePanelHover) => void,
): React.ReactNode {
    const markers = collectEnemyMarkers(engine, windowSeconds);

    const labelRow = (
        <div className="flex min-w-0 items-center gap-2 text-xs">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-red-700 text-xs font-bold text-black">
                E
            </div>
            <span
                className={
                    layout === 'rail' ? 'min-w-0 truncate text-gray-200' : 'text-gray-200'
                }
            >
                Enemies
            </span>
        </div>
    );

    const track = renderEnemyTimelineTrack(windowSeconds, markers, setHover);

    if (layout === 'rail') {
        return (
            <div className="flex min-w-0 flex-col gap-1.5">
                {labelRow}
                {track}
            </div>
        );
    }

    return (
        <div className="contents">
            {labelRow}
            {track}
        </div>
    );
}

/** Inline ability art (SVG string) scaled to a fixed box; flex min-size + explicit SVG attrs can otherwise block scaling. */
function AbilityIconInBox({ html, className = '' }: { html: string; className?: string }) {
    return (
        <div
            className={`flex min-h-0 min-w-0 items-center justify-center [&>img]:max-h-full [&>img]:max-w-full [&>img]:min-h-0 [&>img]:min-w-0 [&>img]:h-full [&>img]:w-full [&>img]:object-contain [&>svg]:block [&>svg]:h-full [&>svg]:w-full [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:min-h-0 [&>svg]:min-w-0 ${className}`}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

function renderPlayerTimelineTrack(
    rowKey: string,
    unit: Unit,
    windowSeconds: number,
    segments: {
        phaseId: BattleTimelinePhaseId;
        start: number;
        duration: number;
        label: string;
        description: string;
    }[],
    hasTimeline: boolean,
    displayAbility: AbilityStatic,
    isPreview: boolean,
    hover: TimelinePanelHover,
    setHover: (next: TimelinePanelHover) => void,
): React.ReactNode {
    return (
        <div className="relative h-10 overflow-visible rounded-md bg-dark-800/80">
            <TimelineTimeRuler windowSeconds={windowSeconds} />
            {hasTimeline && (
                <>
                    <div
                        className={`absolute inset-0 overflow-visible rounded-md ${isPreview ? 'opacity-70' : ''}`}
                    >
                        {segments.map((seg, idx) => (
                            <TimelinePhaseSegment
                                key={idx}
                                phase={seg.phaseId}
                                leftPercent={(seg.start / windowSeconds) * 100}
                                widthPercent={(seg.duration / windowSeconds) * 100}
                                label={seg.label}
                                description={seg.description}
                                isHighlighted={
                                    hover?.rowKey === rowKey && hover.segmentIndex === idx
                                }
                                onPointerEnter={() =>
                                    setHover({
                                        rowKey,
                                        segmentIndex: idx,
                                        unit,
                                        ability: displayAbility,
                                    })
                                }
                            />
                        ))}
                    </div>
                    {/* Left edge of icon = right end of the time window (overflow-visible track shows the rest) */}
                    <div
                        className={`pointer-events-none absolute top-1/2 left-full z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border border-dark-600 bg-dark-900 text-[10px] text-gray-100 shadow-sm ${isPreview ? 'opacity-70' : ''}`}
                        title={displayAbility.name}
                    >
                        <AbilityIconInBox html={displayAbility.image} className="h-5 w-5" />
                    </div>
                </>
            )}
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
    layout: BattleTimelineLayout,
    hover: TimelinePanelHover,
    setHover: (next: TimelinePanelHover) => void,
): React.ReactNode {
    const now = engine.gameTime;
    const unit = engine.units.find((u) => u.ownerId === playerId && u.isAlive());
    const rowKey = `player:${playerId}`;

    const avatar = (
        <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-xs font-bold text-black"
            style={{ backgroundColor: player.color }}
            title={player.name}
        >
            {player.name?.[0]?.toUpperCase() ?? '?'}
        </div>
    );

    if (!unit) {
        const stripLabel = (
            <div className="flex min-w-0 items-center gap-2 text-xs">
                {avatar}
                <span
                    className={layout === 'rail' ? 'min-w-0 truncate text-gray-200' : 'text-gray-200'}
                    title={player.name}
                >
                    {player.name}
                </span>
            </div>
        );

        const emptyTrack = (
            <div className="relative h-10 overflow-visible rounded-md bg-dark-800/80">
                <TimelineTimeRuler windowSeconds={windowSeconds} />
            </div>
        );

        if (layout === 'rail') {
            return (
                <div key={playerId} className="flex min-w-0 flex-col gap-1.5">
                    {stripLabel}
                    {emptyTrack}
                </div>
            );
        }

        return (
            <div className="contents" key={playerId}>
                {stripLabel}
                {emptyTrack}
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
    let isPreview = false;

    if (showPreview && previewAbility) {
        const intervals = intervalsForAbility(previewAbility, unit, engine);
        const merged = buildPrimaryTimelineSegments(intervals);
        segments = computeVisiblePrimarySegments(merged, 0, windowSeconds);
        isPreview = true;
    } else if (active && ability) {
        const intervals = intervalsForAbility(ability, unit, engine);
        const merged = buildPrimaryTimelineSegments(intervals);
        const elapsed = now - active.startTime;
        segments = computeVisiblePrimarySegments(merged, elapsed, windowSeconds);
    }

    const displayAbility = ability ?? (showPreview ? previewAbility : null);
    const hasTimeline = !!(displayAbility && segments.length > 0);

    const track =
        hasTimeline && displayAbility
            ? renderPlayerTimelineTrack(
                  rowKey,
                  unit,
                  windowSeconds,
                  segments,
                  true,
                  displayAbility,
                  isPreview,
                  hover,
                  setHover,
              )
            : (
                  <div className="relative h-10 overflow-visible rounded-md bg-dark-800/80">
                      <TimelineTimeRuler windowSeconds={windowSeconds} />
                  </div>
              );

    if (layout === 'rail') {
        return (
            <div key={playerId} className="flex min-w-0 flex-col gap-1.5">
                <div className="flex min-w-0 items-center gap-2 text-xs">
                    {avatar}
                    <span className="min-w-0 truncate text-gray-200" title={player.name}>
                        {player.name}
                        {player.isHost && (
                            <span className="ml-1 text-[10px] text-primary">(HOST)</span>
                        )}
                    </span>
                </div>
                {track}
            </div>
        );
    }

    return (
        <div className="contents" key={playerId}>
            <div className="flex min-w-0 items-center gap-2 text-xs">
                {avatar}
                <span className="min-w-0 truncate text-gray-200" title={player.name}>
                    {player.name}
                    {player.isHost && (
                        <span className="ml-1 text-[10px] text-primary">(HOST)</span>
                    )}
                </span>
            </div>
            {track}
        </div>
    );
}

export default function BattleTimeline({
    engine,
    players,
    localPlayerId,
    windowSeconds = 2,
    previewAbility = null,
    layout = 'strip',
}: BattleTimelineProps) {
    const [panelHover, setPanelHover] = useState<TimelinePanelHover>(null);

    const handlePanelPointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) {
            return;
        }
        setPanelHover(null);
    }, []);

    const orderedPlayers = useMemo(() => {
        const entries = Object.entries(players);
        entries.sort((a, b) => {
            if (a[0] === localPlayerId) return -1;
            if (b[0] === localPlayerId) return 1;
            return a[1].name.localeCompare(b[1].name);
        });
        return entries;
    }, [players, localPlayerId]);

    const flyout =
        panelHover && (
            <div
                className="pointer-events-none absolute top-1/2 left-full z-[200] ml-5 -translate-y-1/2"
                aria-hidden
            >
                <TimelineHoverFlyout unit={panelHover.unit} ability={panelHover.ability} />
            </div>
        );

    const stripBody = (
        <>
            {renderEnemyRow(engine, windowSeconds, 'strip', setPanelHover)}
            {orderedPlayers.map(([playerId, player]) =>
                renderPlayerRow(
                    engine,
                    playerId,
                    player,
                    windowSeconds,
                    localPlayerId,
                    previewAbility,
                    'strip',
                    panelHover,
                    setPanelHover,
                ),
            )}
        </>
    );

    if (layout === 'rail') {
        return (
            <div
                className="relative flex h-full min-h-0 min-w-0 flex-col bg-dark-900/95"
                onPointerLeave={handlePanelPointerLeave}
            >
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-2 py-2">
                    <div className="flex min-w-0 flex-col gap-3">
                        {renderEnemyRow(engine, windowSeconds, 'rail', setPanelHover)}
                        <hr
                            className="border-0 border-t border-gray-500/80"
                            aria-hidden
                        />
                        {orderedPlayers.map(([playerId, player]) =>
                            renderPlayerRow(
                                engine,
                                playerId,
                                player,
                                windowSeconds,
                                localPlayerId,
                                previewAbility,
                                'rail',
                                panelHover,
                                setPanelHover,
                            ),
                        )}
                    </div>
                </div>
                {flyout}
            </div>
        );
    }

    return (
        <div className="w-full flex-shrink-0 bg-dark-900/95 px-3 py-2">
            <div
                className="relative w-full min-w-0"
                onPointerLeave={handlePanelPointerLeave}
            >
                <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-2">{stripBody}</div>
                {flyout}
            </div>
        </div>
    );
}

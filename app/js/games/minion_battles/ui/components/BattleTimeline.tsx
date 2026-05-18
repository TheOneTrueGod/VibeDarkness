import React, { useCallback, useMemo, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { PlayerState } from '../../../../types';
import type { GameEngine } from '../../game/GameEngine';
import { getAbility } from '../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../abilities/Ability';
import type { Unit } from '../../game/units/Unit';
import { isDarkCreatureCharacterId, PLAYER_CHARACTER_ID } from '../../game/units/unit_defs/unitDef';
import { getPortrait } from '../../character_defs/portraits';
import { TimelinePhaseSegment } from './TimelinePhaseSegment';
import { TimelineHoverFlyout, type TimelineHoverFlyoutProps } from './TimelineHoverFlyout';
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
          /** Present when hovering a player timeline phase segment (see TimelineHoverFlyout). */
          phaseLabel?: string;
          phaseDescription?: string;
      }
    | null;

/** Track height tall enough that timeline tick labels fit inside overflow-hidden rails. */
const TIMELINE_TRACK_HEIGHT_CLASS = 'h-[3.5rem]';

/**
 * Half-second ticks and time labels below the axis so numbers are not clipped by the row.
 * Horizontal line sits in the upper third; labels sit in padded space along the bottom.
 */
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
    const axisTopPercent = 36;

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div
                className="absolute left-0 right-0 h-px bg-gray-600"
                style={{ top: `${axisTopPercent}%` }}
            />
            {ticks.map((t) => {
                const leftPercent = (t / windowSeconds) * 100;
                const atStart = Math.abs(t) < 1e-6;
                const atEnd = Math.abs(t - lastTick) < 1e-6 && !atStart;

                const leftCss = atStart ? '0%' : atEnd ? '100%' : `${leftPercent}%`;
                let tickTf = 'translate(-50%, -1px)';
                if (atStart) tickTf = 'translateY(-1px)';
                if (atEnd) tickTf = 'translate(-100%, -1px)';

                let labelTf = 'translateX(-50%)';
                if (atStart) labelTf = 'none';
                if (atEnd) labelTf = 'translateX(-100%)';

                const tickStyle: React.CSSProperties = {
                    left: leftCss,
                    top: `${axisTopPercent}%`,
                    transform: tickTf,
                };
                const labelStyle: React.CSSProperties = {
                    left: leftCss,
                    bottom: 4,
                    transform: labelTf,
                };

                return (
                    <div key={t}>
                        <div className="absolute flex w-0 flex-col items-center" style={tickStyle}>
                            <div className="h-2 w-px bg-gray-500" />
                        </div>
                        <span
                            className="absolute text-[10px] leading-snug whitespace-nowrap text-gray-500"
                            style={labelStyle}
                        >
                            {t}
                        </span>
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

const RAIL_COMPACT_STORAGE_KEY = 'minionBattles.battleTimelineRailCompact';

interface BattleTimelineProps {
    engine: GameEngine;
    players: Record<string, PlayerState>;
    localPlayerId: string;
    /** How many seconds into the future the timeline should show. Default 2s. */
    windowSeconds?: number;
    /** When the local player has a card selected (previewing), show how it would look on the timeline if they used it now. */
    previewAbility?: AbilityStatic | null;
    /** Unit currently receiving an order in parallel batch; timeline preview applies to this unit only. */
    previewOrderUnitId?: string | null;
    /**
     * `strip` — full-width bar (e.g. below canvas). `rail` — left sidebar: fill parent height, scroll rows internally.
     */
    layout?: BattleTimelineLayout;
}

function playerControlledUnitsForOwner(engine: GameEngine, playerId: string): Unit[] {
    return engine.units
        .filter((u) => u.ownerId === playerId && u.isPlayerControlled())
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));
}

function hpBarColorClass(hp: number, maxHp: number, alive: boolean): string {
    if (!alive || maxHp <= 0) return 'bg-gray-600';
    const pct = (hp / maxHp) * 100;
    if (pct > 60) return 'bg-green-500';
    if (pct > 30) return 'bg-yellow-500';
    return 'bg-red-500';
}

function UnitRailIcon({
    unit,
    playerColor,
    playerNameFallback,
}: {
    unit: Unit;
    playerColor: string;
    playerNameFallback: string;
}) {
    if (unit.characterId === PLAYER_CHARACTER_ID && unit.portraitId) {
        const p = getPortrait(unit.portraitId);
        if (p?.picture) {
            return (
                <img
                    src={p.picture}
                    alt={unit.name}
                    title={unit.name}
                    className="h-7 w-7 shrink-0 rounded-sm border border-dark-600 bg-dark-800 object-cover"
                />
            );
        }
    }
    const iconUrl = ENEMY_CHARACTER_ICONS[unit.characterId];
    if (iconUrl) {
        const dark = isDarkCreatureCharacterId(unit.characterId);
        return (
            <div className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-dark-600 bg-dark-800">
                <img src={iconUrl} alt="" className="h-full w-full object-contain" title={unit.name} />
                {dark ? (
                    <div
                        className="pointer-events-none absolute inset-0 mix-blend-multiply bg-[#9966cc]/20"
                        aria-hidden
                    />
                ) : null}
            </div>
        );
    }
    return (
        <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-xs font-bold text-black"
            style={{ backgroundColor: playerColor }}
            title={unit.name}
        >
            {(unit.name || playerNameFallback)?.[0]?.toUpperCase() ?? '?'}
        </div>
    );
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
        <div className={`relative overflow-hidden rounded-md bg-dark-800/80 ${TIMELINE_TRACK_HEIGHT_CLASS}`}>
            <TimelineTimeRuler windowSeconds={windowSeconds} />
            <div className="absolute inset-0 overflow-hidden rounded-md">
                {markers.map((marker, idx) => {
                    const startPercent = (marker.startFromNow / windowSeconds) * 100;
                    const duration = marker.endFromNow - marker.startFromNow;
                    const widthPercent = (duration / windowSeconds) * 100;
                    const endPercent = (marker.endFromNow / windowSeconds) * 100;

                    const iconUrl = ENEMY_CHARACTER_ICONS[marker.unit.characterId];
                    const markerDark = isDarkCreatureCharacterId(marker.unit.characterId);
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
                                className="absolute top-1/2 z-30 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-default items-center justify-center overflow-hidden rounded-sm border border-black bg-red-600"
                                style={{
                                    left: `clamp(8px, ${endPercent}%, calc(100% - 8px))`,
                                }}
                                title={marker.unit.name || 'Enemy'}
                                onPointerEnter={onMarkerEnter}
                            >
                                {iconUrl ? (
                                    <span className="relative block h-full w-full">
                                        <img src={iconUrl} alt="" className="h-full w-full object-contain" />
                                        {markerDark ? (
                                            <span className="pointer-events-none absolute inset-0 mix-blend-multiply bg-[#9966cc]/20" />
                                        ) : null}
                                    </span>
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
        <div className={`relative overflow-hidden rounded-md bg-dark-800/80 ${TIMELINE_TRACK_HEIGHT_CLASS}`}>
            <TimelineTimeRuler windowSeconds={windowSeconds} />
            {hasTimeline && (
                <>
                    <div
                        className={`absolute inset-0 overflow-hidden rounded-md ${isPreview ? 'opacity-70' : ''}`}
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
                                        phaseLabel: seg.label,
                                        phaseDescription: seg.description,
                                    })
                                }
                            />
                        ))}
                    </div>
                    {/* Keep icon inside the track so the sidebar does not gain horizontal scroll */}
                    <div
                        className={`pointer-events-none absolute top-1/2 right-1 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border border-dark-600 bg-dark-900 text-[10px] text-gray-100 shadow-sm ${isPreview ? 'opacity-70' : ''}`}
                        title={displayAbility.name}
                    >
                        <AbilityIconInBox html={displayAbility.image} className="h-5 w-5" />
                    </div>
                </>
            )}
        </div>
    );
}

function renderPlayerUnitTimelineUnified(
    engine: GameEngine,
    unit: Unit,
    playerId: string,
    player: PlayerState,
    windowSeconds: number,
    localPlayerId: string,
    previewAbility: AbilityStatic | null | undefined,
    previewOrderUnitId: string | null | undefined,
    compact: boolean,
    /** When global rail is expanded, toggles this row between expanded (timeline + hp bar) and compact strip. */
    toggleRowContractOrExpand: (() => void) | null,
    hover: TimelinePanelHover,
    setHover: (next: TimelinePanelHover) => void,
): React.ReactNode {
    const now = engine.gameTime;
    const rowKey = `player:${playerId}:${unit.id}`;
    const alive = unit.isAlive();
    const hpPct = unit.maxHp > 0 ? Math.round((unit.hp / unit.maxHp) * 100) : 0;
    const barClass = hpBarColorClass(unit.hp, unit.maxHp, alive);

    const showPreview = !!(
        playerId === localPlayerId &&
        previewOrderUnitId &&
        unit.id === previewOrderUnitId &&
        previewAbility
    );

    const active = unit.activeAbilities[0];
    const ability = active ? getAbility(active.abilityId) : null;

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
    const hasTimeline = !!(displayAbility && segments.length > 0 && alive);

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
                  <div className={`relative overflow-hidden rounded-md bg-dark-800/80 ${TIMELINE_TRACK_HEIGHT_CLASS}`}>
                      <TimelineTimeRuler windowSeconds={windowSeconds} />
                  </div>
              );

    const iconEl = (
        <UnitRailIcon unit={unit} playerColor={player.color} playerNameFallback={player.name} />
    );

    if (compact) {
        return (
            <div
                key={unit.id}
                className="relative min-w-0 overflow-hidden rounded-md border border-white py-1 pr-1"
            >
                <div className="pointer-events-none absolute inset-0 bg-black" aria-hidden />
                <div
                    className={`pointer-events-none absolute left-0 top-0 bottom-0 rounded-l-md ${barClass} opacity-35`}
                    style={{ width: `${hpPct}%` }}
                    aria-hidden
                />
                <div className="relative z-10 flex min-w-0 items-center gap-2 pl-1">
                    {iconEl}
                    <span className="min-w-0 flex-1 truncate text-[11px] text-gray-100" title={unit.name}>
                        {unit.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-400">
                        ({unit.hp}/{unit.maxHp})
                    </span>
                    {toggleRowContractOrExpand != null && (
                        <button
                            type="button"
                            className="flex shrink-0 items-center justify-center rounded p-0.5 text-primary hover:bg-dark-700/90"
                            onClick={toggleRowContractOrExpand}
                            aria-label="Expand unit row"
                            title="Expand"
                        >
                            <Maximize2 className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div key={unit.id} className="flex min-w-0 flex-col gap-1 border-b border-dark-700/40 pb-2 last:border-b-0">
            <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    {iconEl}
                    <span className="min-w-0 truncate text-xs font-medium text-gray-100" title={unit.name}>
                        {unit.name}
                    </span>
                </div>
                {toggleRowContractOrExpand != null && (
                    <button
                        type="button"
                        className="flex shrink-0 items-center justify-center rounded p-0.5 text-primary hover:bg-dark-700/90"
                        onClick={toggleRowContractOrExpand}
                        aria-label="Contract unit row"
                        title="Contract"
                    >
                        <Minimize2 className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                    </button>
                )}
            </div>
            <div className="flex min-w-0 items-center gap-2 pl-0">
                <span className="w-11 shrink-0 text-right text-[10px] text-gray-400">
                    {unit.hp}/{unit.maxHp}
                </span>
                <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-dark-700">
                    <div className={`absolute left-0 top-0 h-full rounded-full ${barClass}`} style={{ width: `${hpPct}%` }} />
                </div>
            </div>
            {track}
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
            <div className={`relative overflow-hidden rounded-md bg-dark-800/80 ${TIMELINE_TRACK_HEIGHT_CLASS}`}>
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
                  <div className={`relative overflow-hidden rounded-md bg-dark-800/80 ${TIMELINE_TRACK_HEIGHT_CLASS}`}>
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
    previewOrderUnitId = null,
    layout = 'strip',
}: BattleTimelineProps) {
    const [panelHover, setPanelHover] = useState<TimelinePanelHover>(null);
    const [railCompact, setRailCompact] = useState(() => {
        try {
            return typeof localStorage !== 'undefined' && localStorage.getItem(RAIL_COMPACT_STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    });
    /** When the rail is in expanded mode (`railCompact === false`), each unit row can collapse to the compact strip. */
    const [railCollapsedUnitIds, setRailCollapsedUnitIds] = useState<Record<string, true>>({});
    const toggleRailCollapsedUnitId = useCallback((unitId: string) => {
        setRailCollapsedUnitIds((prev) => {
            const next = { ...prev };
            if (unitId in next) {
                delete next[unitId];
            } else {
                next[unitId] = true;
            }
            return next;
        });
    }, []);

    const handlePanelPointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        // relatedTarget is EventTarget | null — can be Window or other non-Node targets; contains() requires a Node.
        const next = e.relatedTarget;
        if (next instanceof Node && e.currentTarget.contains(next)) {
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

    const flyout = (() => {
        if (!panelHover) return null;
        const flyoutProps: TimelineHoverFlyoutProps = {
            unit: panelHover.unit,
            ability: panelHover.ability,
            phaseLabel: panelHover.phaseLabel,
            phaseDescription: panelHover.phaseDescription,
        };
        return (
            <div
                className="pointer-events-none absolute top-1/2 left-full z-[200] ml-5 -translate-y-1/2"
                aria-hidden
            >
                <TimelineHoverFlyout {...flyoutProps} />
            </div>
        );
    })();

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
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-dark-700/80 px-2 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Party and actions
                    </span>
                    <button
                        type="button"
                        className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-dark-700"
                        onClick={() => {
                            setRailCompact((c) => {
                                const next = !c;
                                if (next) {
                                    setRailCollapsedUnitIds({});
                                }
                                try {
                                    localStorage.setItem(RAIL_COMPACT_STORAGE_KEY, next ? '1' : '0');
                                } catch {
                                    /* ignore */
                                }
                                return next;
                            });
                        }}
                    >
                        {railCompact ? 'Expanded' : 'Compact'}
                    </button>
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-2 py-2 [scrollbar-gutter:stable]">
                    <div className="flex min-w-0 flex-col gap-3">
                        {renderEnemyRow(engine, windowSeconds, 'rail', setPanelHover)}
                        <hr
                            className="border-0 border-t border-gray-500/80"
                            aria-hidden
                        />
                        {orderedPlayers.map(([playerId, player]) => {
                            const units = playerControlledUnitsForOwner(engine, playerId);
                            return (
                                <div key={playerId} className="flex min-w-0 flex-col gap-1.5">
                                    <div
                                        className="min-w-0 truncate text-xs font-semibold text-gray-200"
                                        title={player.name}
                                    >
                                        <span style={{ color: player.color }}>{player.name}</span>
                                        {player.isHost && (
                                            <span className="ml-1 text-[10px] text-primary">(HOST)</span>
                                        )}
                                    </div>
                                    {units.length === 0 ? (
                                        <div className="rounded-md bg-dark-800/50 px-2 py-1 text-[10px] text-gray-500">
                                            No unit in battle
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            {units.map((unit) => {
                                                const compactThisUnit =
                                                    railCompact || !!railCollapsedUnitIds[unit.id];
                                                const rowToggle = railCompact
                                                    ? null
                                                    : () => toggleRailCollapsedUnitId(unit.id);
                                                return renderPlayerUnitTimelineUnified(
                                                    engine,
                                                    unit,
                                                    playerId,
                                                    player,
                                                    windowSeconds,
                                                    localPlayerId,
                                                    previewAbility,
                                                    previewOrderUnitId,
                                                    compactThisUnit,
                                                    rowToggle,
                                                    panelHover,
                                                    setPanelHover,
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
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

/**
 * Admin-only panel: pick up to four abilities / general tests, run synced headless-style
 * simulations with live mini terrain previews (no game controls).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Brain, Bug, Droplets, Dumbbell, Eye, Footprints, Gem, Lightbulb, Mountain, Pause, PawPrint, Play, Shield, SkipBack, SkipForward, Skull, Sword } from 'lucide-react';
import {
    type AbilityTreeSidebarGroup,
    type GeneralTestSidebarGroup,
    getAbilityTreeSidebarGroups,
    getGeneralTestSidebarGroups,
    getScenarioById,
    getScenariosForSelectorKey,
    inferScenarioAbilityId,
    isRegisteredGeneralGroupSelectorKey,
} from '../../games/minion_battles/testing/scenarios/registry';
import { getAbility } from '../../games/minion_battles/abilities/AbilityRegistry';
import ScenarioPreviewModal from '../ability-tests/ScenarioPreviewModal';
import { PlaybackButton } from '../ability-tests/PlaybackButton';
import type { ScenarioDefinition } from '../../games/minion_battles/testing/types';
import { createLiveScenarioRun, type LiveScenarioRun } from '../../games/minion_battles/testing/runner/SimulationRunner';
import MiniTerrainView from '../ability-tests/MiniTerrainView';
import PanelLayout from './PanelLayout';

const SELECTED_PARAM = 'selected';
const FILTER_PARAM = 'q';
const PREVIEW_PARAM = 'preview';
type PlaybackMode = 'playing' | 'paused';

const TREE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    training:      Dumbbell,
    crystal_rocks: Gem,
    stick_sword:   Sword,
    tech_shield:   Shield,
    earth_core:    Mountain,
};

const GENERAL_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    movement:    Footprints,
    debuffs:     Droplets,
    enemies:     Skull,
    lanternites: Bug,
    lighting:    Lightbulb,
    pets:        PawPrint,
    ai:          Brain,
};

function parseSelected(raw: string | null): string[] {
    if (!raw?.trim()) return [];
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 4);
}

function formatSelected(keys: string[]): string {
    return keys.slice(0, 4).join(',');
}

function ScenarioPane({
    scenario,
    run,
    renderVersion,
    onPreview,
}: {
    scenario: ScenarioDefinition;
    run: LiveScenarioRun | null;
    renderVersion: number;
    onPreview?: () => void;
}) {
    const engine = run?.engine;
    const settled = run?.isSettled() ?? false;
    const passed = settled && run ? run.getResult().passed : false;
    const msg = settled && run ? run.getResult().message : '';

    const player = engine?.getLocalPlayerUnit();
    const dummy = engine?.getUnit('target_dummy');
    const tick = run?.getTicks() ?? 0;
    const playerHp = player?.hp ?? null;
    const playerMaxHp = player?.maxHp ?? player?.hp ?? null;
    const dummyHp = dummy?.hp ?? null;
    const dummyMaxHp = dummy?.maxHp ?? dummy?.hp ?? null;

    const abilityId = inferScenarioAbilityId(scenario);
    const abilityImage = abilityId ? (getAbility(abilityId)?.image ?? null) : null;

    return (
        <div
            className={`rounded-lg border-2 p-3 bg-surface-light/80 flex flex-col gap-2 min-w-[300px] max-w-[360px] ${
                settled ? (passed ? 'border-success' : 'border-danger') : 'border-border-custom'
            }`}
        >
            {onPreview ? (
                <button
                    type="button"
                    className="flex items-center justify-between gap-1 w-full text-left group rounded hover:bg-surface/50 -mx-1 px-1 transition-colors"
                    onClick={onPreview}
                    aria-label="Preview in full view"
                >
                    <div className="flex items-center gap-1.5 min-w-0">
                        {abilityImage && (
                            <img src={`data:image/svg+xml,${encodeURIComponent(abilityImage)}`} alt="" className="w-5 h-5 shrink-0" />
                        )}
                        <span className="text-sm font-semibold text-white leading-tight">{scenario.title}</span>
                    </div>
                    <Eye size={13} className="shrink-0 text-muted group-hover:text-white transition-colors" />
                </button>
            ) : (
                <div className="flex items-center gap-1.5">
                    {abilityImage && (
                        <img src={`data:image/svg+xml,${encodeURIComponent(abilityImage)}`} alt="" className="w-5 h-5 shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-white leading-tight">{scenario.title}</span>
                </div>
            )}
            <div className="flex justify-center">
                {engine ? <MiniTerrainView engine={engine} cellPx={30} renderVersion={renderVersion} renderLighting={scenario.renderLighting} /> : (
                    <span className="text-xs text-muted">—</span>
                )}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
                <div className="col-span-2 rounded border border-border-custom/60 bg-black/20 px-2 py-1">
                    Tick {tick}
                </div>
                <div className="rounded border border-border-custom/60 bg-black/10 px-2 py-1">
                    Player HP: {playerHp ?? '—'}
                </div>
                <div className="rounded border border-border-custom/60 bg-black/10 px-2 py-1">
                    Dummy HP: {dummyHp ?? '—'}
                </div>
                <HpBar hp={playerHp} maxHp={playerMaxHp} tone="player" />
                <HpBar hp={dummyHp} maxHp={dummyMaxHp} tone="dummy" />
            </div>
            <div className={`text-[11px] ${settled ? (passed ? 'text-success' : 'text-danger') : 'invisible'}`}>
                {settled ? (
                    <>
                        {passed ? 'Passed' : 'Failed'}
                        {!passed && msg ? ` · ${msg}` : ''}
                    </>
                ) : ' '}
            </div>
        </div>
    );
}

function HpBar({ hp, maxHp, tone }: { hp: number | null; maxHp: number | null; tone: 'player' | 'dummy' }) {
    if (hp == null || maxHp == null || maxHp <= 0) {
        return <div className="h-2 rounded bg-black/30 border border-border-custom/60" />;
    }
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    const fill = tone === 'player' ? 'bg-primary' : 'bg-danger';
    return (
        <div className="h-2 rounded bg-black/30 border border-border-custom/60 overflow-hidden">
            <div className={`h-full ${fill}`} style={{ width: `${pct}%` }} />
        </div>
    );
}

function rowForTreeGroup(g: AbilityTreeSidebarGroup, selected: string[], toggle: (k: string) => void) {
    const sel = selected.includes(g.selectorKey);
    const pinned = sel ? 'ring-2 ring-inset ring-primary bg-primary/10' : 'hover:bg-surface-light';
    const Icon = TREE_ICONS[g.treeId];
    return (
        <li key={g.selectorKey}>
            <button
                type="button"
                className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded text-sm ${pinned}`}
                onClick={() => toggle(g.selectorKey)}
            >
                <span className="w-8 h-8 shrink-0 rounded border border-border-custom flex items-center justify-center bg-black/30 text-muted">
                    {Icon && <Icon size={16} />}
                </span>
                <span className="truncate text-white">{g.label}</span>
            </button>
        </li>
    );
}

function rowForGeneralGroup(g: GeneralTestSidebarGroup, selected: string[], toggle: (k: string) => void) {
    const sel = selected.includes(g.selectorKey);
    const pinned = sel ? 'ring-2 ring-inset ring-primary bg-primary/10' : 'hover:bg-surface-light';
    const Icon = GENERAL_ICONS[g.slug];
    return (
        <li key={g.selectorKey}>
            <button
                type="button"
                className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded text-sm ${pinned}`}
                onClick={() => toggle(g.selectorKey)}
            >
                <span className="w-8 h-8 shrink-0 rounded border border-border-custom flex items-center justify-center bg-black/30 text-muted">
                    {Icon && <Icon size={16} />}
                </span>
                <span className="truncate text-white">{g.label}</span>
            </button>
        </li>
    );
}

export default function AbilityTestPanel() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [filter, setFilter] = useState(() => searchParams.get(FILTER_PARAM) ?? '');
    const [renderVersion, setRenderVersion] = useState(0);

    const selectedKeys = useMemo(
        () => parseSelected(searchParams.get(SELECTED_PARAM)),
        [searchParams],
    );

    const previewScenario = useMemo(() => {
        const id = searchParams.get(PREVIEW_PARAM);
        return id ? (getScenarioById(id) ?? null) : null;
    }, [searchParams]);

    const openPreview = useCallback(
        (scenarioId: string) => {
            const params = new URLSearchParams(searchParams);
            params.set(PREVIEW_PARAM, scenarioId);
            setSearchParams(params, { replace: true });
        },
        [searchParams, setSearchParams],
    );

    const closePreview = useCallback(() => {
        const params = new URLSearchParams(searchParams);
        params.delete(PREVIEW_PARAM);
        setSearchParams(params, { replace: true });
    }, [searchParams, setSearchParams]);

    const setSelectedKeys = useCallback(
        (next: string[]) => {
            const params = new URLSearchParams(searchParams);
            const sel = formatSelected(next);
            if (sel) params.set(SELECTED_PARAM, sel);
            else params.delete(SELECTED_PARAM);
            if (filter.trim()) params.set(FILTER_PARAM, filter.trim());
            else params.delete(FILTER_PARAM);
            setSearchParams(params, { replace: true });
        },
        [searchParams, setSearchParams, filter],
    );

    const toggleKey = useCallback(
        (key: string) => {
            setSelectedKeys(selectedKeys.includes(key) ? [] : [key]);
        },
        [selectedKeys, setSelectedKeys],
    );

    const abilityTreeGroups = useMemo(() => {
        const q = filter.trim().toLowerCase();
        const all = getAbilityTreeSidebarGroups();
        if (!q) return all;
        return all.filter((g) => {
            if (g.label.toLowerCase().includes(q) || g.treeId.includes(q)) return true;
            const scenarios = getScenariosForSelectorKey(g.selectorKey);
            return scenarios.some(
                (s) => s.title.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
            );
        });
    }, [filter]);

    const generalSidebarGroups = useMemo(() => {
        const q = filter.trim().toLowerCase();
        const all = getGeneralTestSidebarGroups();
        if (!q) return all;
        return all.filter((g) => {
            if (g.label.toLowerCase().includes(q) || g.slug.includes(q)) return true;
            const scenarios = getScenariosForSelectorKey(g.selectorKey);
            return scenarios.some(
                (s) => s.title.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
            );
        });
    }, [filter]);

    const [runsById, setRunsById] = useState<Map<string, LiveScenarioRun>>(() => new Map());
    const [runsByKey, setRunsByKey] = useState<Map<string, LiveScenarioRun[]>>(() => new Map());
    const [playbackByKey, setPlaybackByKey] = useState<Record<string, PlaybackMode>>({});

    useEffect(() => {
        const nextRunsById = new Map<string, LiveScenarioRun>();
        const nextRunsByKey = new Map<string, LiveScenarioRun[]>();
        const nextPlaybackByKey: Record<string, PlaybackMode> = {};
        const allRuns: LiveScenarioRun[] = [];
        for (const key of selectedKeys) {
            const groupRuns: LiveScenarioRun[] = [];
            for (const s of getScenariosForSelectorKey(key)) {
                try {
                    const run = createLiveScenarioRun(s);
                    nextRunsById.set(s.id, run);
                    groupRuns.push(run);
                    allRuns.push(run);
                } catch (e) {
                    console.error('Ability test scenario failed to start', s.id, e);
                }
            }
            nextRunsByKey.set(key, groupRuns);
            nextPlaybackByKey[key] = 'playing';
        }
        setRunsById(nextRunsById);
        setRunsByKey(nextRunsByKey);
        setPlaybackByKey(nextPlaybackByKey);

        return () => {
            for (const r of allRuns) {
                r.dispose();
            }
        };
    }, [selectedKeys]);

    useEffect(() => {
        const id = window.setInterval(() => {
            let advanced = false;
            for (const [key, groupRuns] of runsByKey) {
                if ((playbackByKey[key] ?? 'playing') !== 'playing') continue;
                for (const run of groupRuns) {
                    if (run.isSettled()) continue;
                    run.stepTicks(2);
                    advanced = true;
                }
            }
            if (advanced) {
                setRenderVersion((v) => v + 1);
            }
        }, 40);

        return () => {
            window.clearInterval(id);
        };
    }, [runsByKey, playbackByKey]);

    const stepGroupOneTick = useCallback((key: string) => {
        const groupRuns = runsByKey.get(key) ?? [];
        let advanced = false;
        for (const run of groupRuns) {
            if (run.isSettled()) continue;
            run.stepTicks(1);
            advanced = true;
        }
        if (advanced) {
            setRenderVersion((v) => v + 1);
        }
    }, [runsByKey]);

    const replayGroup = useCallback((key: string) => {
        const currentGroupRuns = runsByKey.get(key) ?? [];
        for (const run of currentGroupRuns) {
            run.dispose();
        }
        const scenarios = getScenariosForSelectorKey(key);
        const nextGroupRuns: LiveScenarioRun[] = [];
        const nextRunsById = new Map(runsById);
        for (const s of scenarios) {
            nextRunsById.delete(s.id);
        }
        for (const s of scenarios) {
            try {
                const run = createLiveScenarioRun(s);
                nextGroupRuns.push(run);
                nextRunsById.set(s.id, run);
            } catch (e) {
                console.error('Ability test scenario failed to restart', s.id, e);
            }
        }
        const nextRunsByKey = new Map(runsByKey);
        nextRunsByKey.set(key, nextGroupRuns);
        setRunsByKey(nextRunsByKey);
        setRunsById(nextRunsById);
        setPlaybackByKey((prev) => ({ ...prev, [key]: 'playing' }));
        setRenderVersion((v) => v + 1);
    }, [runsById, runsByKey]);

    return (
        <>
            <PanelLayout
                title="Ability Test"
                leftSize="small"
                leftClassName="flex flex-col overflow-hidden"
                left={
                    <>
                        <div className="p-3 pb-2 shrink-0">
                            <input
                                type="search"
                                className="w-full px-2 py-1.5 rounded bg-surface-light border border-border-custom text-sm text-white placeholder:text-muted"
                                placeholder="Filter…"
                                value={filter}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setFilter(v);
                                    const params = new URLSearchParams(searchParams);
                                    if (v.trim()) params.set(FILTER_PARAM, v.trim());
                                    else params.delete(FILTER_PARAM);
                                    if (selectedKeys.length) params.set(SELECTED_PARAM, formatSelected(selectedKeys));
                                    setSearchParams(params, { replace: true });
                                }}
                            />
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
                            <div className="text-xs text-muted uppercase tracking-wide mb-1">Abilities</div>
                            <ul className="space-y-1">
                                {abilityTreeGroups.map((g) => rowForTreeGroup(g, selectedKeys, toggleKey))}
                            </ul>
                            <div className="text-xs text-muted uppercase tracking-wide mt-4 mb-1">General</div>
                            <ul className="space-y-1">
                                {generalSidebarGroups.map((g) => rowForGeneralGroup(g, selectedKeys, toggleKey))}
                            </ul>
                        </div>
                    </>
                }
                center={
                    <div className="p-4 space-y-4">
                        {selectedKeys.length === 0 && (
                            <div className="flex items-center justify-center h-32 text-muted text-sm">
                                Select abilities or tests from the left panel
                            </div>
                        )}
                        {selectedKeys.map((key) => {
                            const scenarios = getScenariosForSelectorKey(key);
                            const title = key.startsWith('general:')
                                ? (() => {
                                      const g = getGeneralTestSidebarGroups().find((x) => x.selectorKey === key);
                                      return g ? `General · ${g.label}` : scenarios[0]?.title ?? key;
                                  })()
                                : key.startsWith('tree:')
                                ? (() => {
                                      const g = getAbilityTreeSidebarGroups().find((x) => x.selectorKey === key);
                                      return g ? g.label : key;
                                  })()
                                : `Ability · ${key}`;
                            const groupedGeneralCard =
                                key.startsWith('general:') &&
                                isRegisteredGeneralGroupSelectorKey(key) &&
                                scenarios.length > 1;
                            const groupRuns = runsByKey.get(key) ?? [];
                            const allFinished = groupRuns.length > 0 && groupRuns.every((run) => run.isSettled());
                            const mode = playbackByKey[key] ?? 'playing';
                            return (
                                <div key={key} className="rounded-xl border border-border-custom bg-surface p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="flex items-center gap-1 shrink-0">
                                                <PlaybackButton
                                                    icon={SkipBack}
                                                    title="Replay"
                                                    onClick={() => replayGroup(key)}
                                                />
                                                <PlaybackButton
                                                    icon={!allFinished && mode === 'playing' ? Pause : Play}
                                                    title={allFinished ? 'Restart' : mode === 'playing' ? 'Pause' : 'Play'}
                                                    onClick={() => {
                                                        if (allFinished) {
                                                            replayGroup(key);
                                                        } else {
                                                            setPlaybackByKey((prev) => ({
                                                                ...prev,
                                                                [key]: mode === 'playing' ? 'paused' : 'playing',
                                                            }));
                                                        }
                                                    }}
                                                />
                                                <PlaybackButton
                                                    icon={SkipForward}
                                                    title="Next frame"
                                                    onClick={() => stepGroupOneTick(key)}
                                                    disabled={allFinished || mode !== 'paused'}
                                                    invisible={allFinished || mode === 'playing'}
                                                />
                                            </div>
                                            <h3 className="text-sm font-semibold text-primary truncate">{title}</h3>
                                        </div>
                                    </div>
                                    {groupedGeneralCard ? (
                                        <div className="rounded-lg border border-border-custom bg-surface-light/50 p-3">
                                            <div className="flex flex-wrap gap-3">
                                                {scenarios.map((s) => (
                                                    <ScenarioPane
                                                        key={s.id}
                                                        scenario={s}
                                                        run={runsById.get(s.id) ?? null}
                                                        renderVersion={renderVersion}
                                                        onPreview={() => openPreview(s.id)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-3">
                                            {scenarios.map((s) => (
                                                <ScenarioPane
                                                    key={s.id}
                                                    scenario={s}
                                                    run={runsById.get(s.id) ?? null}
                                                    renderVersion={renderVersion}
                                                    onPreview={() => openPreview(s.id)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                }
            />
            {previewScenario && (
                <ScenarioPreviewModal scenario={previewScenario} onClose={closePreview} />
            )}
        </>
    );
}

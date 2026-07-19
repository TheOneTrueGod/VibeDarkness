/**
 * Lobby Archive → Performance: load user-state performanceLog samples,
 * bucket into 25-tick windows, and chart totals / engine vs UI over time.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { LobbyClient, AdminUserStateIndex } from '../../../../LobbyClient';
import {
    PERFORMANCE_WINDOW_SIZE,
    aggregatePerformanceWindow,
    buildPerformanceWindows,
    extractPerformanceSample,
    maxTickFromUserStateIndex,
    samplesToChartRows,
    type PerformanceSample,
    type PerformanceWindowStats,
} from '../performanceArchive';

interface ArchivePerformanceTabProps {
    isActive: boolean;
    lobbyId: string;
    lobbyClient: LobbyClient;
}

const CHART_MARGIN = { top: 8, right: 16, left: 0, bottom: 0 };
const TOOLTIP_STYLE = {
    backgroundColor: '#0a0a0a',
    border: '1px solid #3f3f46',
    borderRadius: 6,
    fontSize: 12,
};

function formatMs(n: number): string {
    return `${n.toFixed(2)} ms`;
}

export default function ArchivePerformanceTab({ isActive, lobbyId, lobbyClient }: ArchivePerformanceTabProps) {
    const [index, setIndex] = useState<AdminUserStateIndex | null>(null);
    const [playerId, setPlayerId] = useState<string | null>(null);
    const [samples, setSamples] = useState<PerformanceSample[]>([]);
    const [loadingIndex, setLoadingIndex] = useState(false);
    const [loadingSamples, setLoadingSamples] = useState(false);
    const [loadProgress, setLoadProgress] = useState({ done: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);
    const [selectedWindowFrom, setSelectedWindowFrom] = useState<number | null>(null);

    useEffect(() => {
        if (!isActive) return;
        let cancelled = false;
        setLoadingIndex(true);
        setError(null);
        setSamples([]);
        setIndex(null);
        setPlayerId(null);
        setSelectedWindowFrom(null);
        lobbyClient
            .getAdminLobbyUserStateIndex(lobbyId)
            .then((idx) => {
                if (cancelled) return;
                setIndex(idx);
                const ids = Object.keys(idx.users);
                setPlayerId(ids[0] ?? null);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load user state index');
            })
            .finally(() => {
                if (!cancelled) setLoadingIndex(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isActive, lobbyId, lobbyClient]);

    useEffect(() => {
        if (!isActive || !index || !playerId) return;
        let cancelled = false;
        const maxTick = maxTickFromUserStateIndex(index.users);
        const windows = buildPerformanceWindows(maxTick, PERFORMANCE_WINDOW_SIZE);
        setLoadingSamples(true);
        setLoadProgress({ done: 0, total: windows.length });
        setSamples([]);
        setError(null);

        void (async () => {
            const collected: PerformanceSample[] = [];
            for (let i = 0; i < windows.length; i++) {
                if (cancelled) return;
                const w = windows[i]!;
                try {
                    const entries = await lobbyClient.getUserStateRange(lobbyId, playerId, w.fromTick, w.toTick);
                    for (const entry of entries) {
                        const sample = extractPerformanceSample(entry);
                        if (sample) collected.push(sample);
                    }
                } catch {
                    /* skip missing ranges */
                }
                if (!cancelled) {
                    setLoadProgress({ done: i + 1, total: windows.length });
                    setSamples([...collected]);
                }
            }
            if (!cancelled) {
                setLoadingSamples(false);
                if (collected.length > 0) {
                    const firstWindow = buildPerformanceWindows(
                        Math.max(...collected.map((s) => s.tick)),
                        PERFORMANCE_WINDOW_SIZE,
                    )[0];
                    setSelectedWindowFrom(firstWindow?.fromTick ?? null);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isActive, index, playerId, lobbyId, lobbyClient]);

    const chartRows = useMemo(() => samplesToChartRows(samples), [samples]);

    const windowStats: PerformanceWindowStats[] = useMemo(() => {
        if (samples.length === 0) return [];
        const maxTick = Math.max(...samples.map((s) => s.tick));
        return buildPerformanceWindows(maxTick, PERFORMANCE_WINDOW_SIZE).map((w) =>
            aggregatePerformanceWindow(samples, w.fromTick, w.toTick),
        );
    }, [samples]);

    const windowBarRows = useMemo(
        () =>
            windowStats
                .filter((w) => w.sampleCount > 0)
                .map((w) => ({
                    label: `${w.fromTick}–${w.toTick}`,
                    fromTick: w.fromTick,
                    avg: Number(w.avgTotalMs.toFixed(2)),
                    max: Number(w.maxTotalMs.toFixed(2)),
                    p95: Number(w.p95TotalMs.toFixed(2)),
                })),
        [windowStats],
    );

    const selectedWindow = useMemo(
        () => windowStats.find((w) => w.fromTick === selectedWindowFrom) ?? null,
        [windowStats, selectedWindowFrom],
    );

    const selectedWindowSamples = useMemo(() => {
        if (!selectedWindow) return [];
        return samples.filter((s) => s.tick >= selectedWindow.fromTick && s.tick <= selectedWindow.toTick);
    }, [samples, selectedWindow]);

    const categoryBreakdown = useMemo(() => {
        if (selectedWindowSamples.length === 0) return [];
        const sums = new Map<string, number>();
        for (const s of selectedWindowSamples) {
            for (const [path, ms] of Object.entries(s.categories)) {
                // Top-level only for the breakdown bars (engine, ui) plus one depth for canvas/react/units.
                const depth = path.split('.').length;
                if (depth > 2) continue;
                sums.set(path, (sums.get(path) ?? 0) + ms);
            }
        }
        const n = selectedWindowSamples.length;
        return [...sums.entries()]
            .map(([path, sum]) => ({ path, avg: Number((sum / n).toFixed(3)) }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 12);
    }, [selectedWindowSamples]);

    if (!isActive) return null;

    if (loadingIndex) {
        return <div className="flex-1 flex items-start p-4 text-muted text-sm">Loading…</div>;
    }
    if (error) {
        return <div className="flex-1 flex items-start p-4 text-danger text-sm">{error}</div>;
    }
    if (!index || Object.keys(index.users).length === 0) {
        return (
            <div className="flex-1 flex items-start p-4 text-muted text-sm">
                No user state data for this lobby. Enable Debug Console → “Log user state to server” (and “JS
                performance tracking”) during the battle to capture timings.
            </div>
        );
    }

    const userIds = Object.keys(index.users);

    return (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-muted">
                    <span>Player</span>
                    <select
                        className="rounded border border-border-custom bg-surface px-2 py-1.5 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        value={playerId ?? ''}
                        onChange={(e) => setPlayerId(e.target.value || null)}
                    >
                        {userIds.map((id) => (
                            <option key={id} value={id}>
                                {id}
                                {id === userIds[0] ? ' (host)' : ''}
                            </option>
                        ))}
                    </select>
                </label>
                <span className="text-xs text-muted">
                    Window size: {PERFORMANCE_WINDOW_SIZE} ticks
                    {loadingSamples
                        ? ` · Loading ${loadProgress.done}/${loadProgress.total} windows…`
                        : ` · ${samples.length} samples with performanceLog`}
                </span>
            </div>

            {!loadingSamples && samples.length === 0 && (
                <p className="text-sm text-muted max-w-2xl">
                    User states exist, but none include a <code className="text-muted">performanceLog</code>. Turn on
                    Debug Console → Toggles →{' '}
                    <span className="text-white">JS performance tracking</span> (and keep user-state logging on) when
                    reproducing the lag.
                </p>
            )}

            {chartRows.length > 0 && (
                <>
                    <section>
                        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                            Total tick time (ms)
                        </h3>
                        <div className="h-56 w-full rounded border border-border-custom bg-surface-light/30 p-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartRows} margin={CHART_MARGIN}>
                                    <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" />
                                    <XAxis dataKey="tick" stroke="#a1a1aa" tick={{ fontSize: 11 }} />
                                    <YAxis stroke="#a1a1aa" tick={{ fontSize: 11 }} width={48} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Line
                                        type="monotone"
                                        dataKey="total"
                                        name="total"
                                        stroke="#f59e0b"
                                        dot={false}
                                        strokeWidth={2}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                            Engine vs UI (ms)
                        </h3>
                        <div className="h-56 w-full rounded border border-border-custom bg-surface-light/30 p-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartRows} margin={CHART_MARGIN}>
                                    <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" />
                                    <XAxis dataKey="tick" stroke="#a1a1aa" tick={{ fontSize: 11 }} />
                                    <YAxis stroke="#a1a1aa" tick={{ fontSize: 11 }} width={48} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Area
                                        type="monotone"
                                        dataKey="engine"
                                        name="engine"
                                        stackId="1"
                                        stroke="#38bdf8"
                                        fill="#0ea5e980"
                                        isAnimationActive={false}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="ui"
                                        name="ui"
                                        stackId="1"
                                        stroke="#a78bfa"
                                        fill="#8b5cf680"
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                            Per-window summary (avg / p95 / max)
                        </h3>
                        <div className="h-56 w-full rounded border border-border-custom bg-surface-light/30 p-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={windowBarRows} margin={CHART_MARGIN}>
                                    <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" />
                                    <XAxis dataKey="label" stroke="#a1a1aa" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
                                    <YAxis stroke="#a1a1aa" tick={{ fontSize: 11 }} width={48} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="avg" name="avg" fill="#22c55e" isAnimationActive={false} />
                                    <Bar dataKey="p95" name="p95" fill="#eab308" isAnimationActive={false} />
                                    <Bar dataKey="max" name="max" fill="#ef4444" isAnimationActive={false} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {windowStats
                                .filter((w) => w.sampleCount > 0)
                                .map((w) => {
                                    const selected = w.fromTick === selectedWindowFrom;
                                    return (
                                        <button
                                            key={w.fromTick}
                                            type="button"
                                            className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                                                selected
                                                    ? 'border-primary bg-surface text-white'
                                                    : 'border-border-custom bg-surface-light text-muted hover:border-primary hover:text-white'
                                            }`}
                                            onClick={() => setSelectedWindowFrom(w.fromTick)}
                                        >
                                            {w.fromTick}–{w.toTick}
                                            <span className="ml-1.5 text-[10px] opacity-80">
                                                max {formatMs(w.maxTotalMs)}
                                            </span>
                                        </button>
                                    );
                                })}
                        </div>
                    </section>

                    {selectedWindow && selectedWindow.sampleCount > 0 && (
                        <section className="grid gap-4 lg:grid-cols-2">
                            <div>
                                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                                    Selected window {selectedWindow.fromTick}–{selectedWindow.toTick}
                                </h3>
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <dt className="text-muted">Samples</dt>
                                    <dd className="text-white tabular-nums">{selectedWindow.sampleCount}</dd>
                                    <dt className="text-muted">Avg total</dt>
                                    <dd className="text-white tabular-nums">{formatMs(selectedWindow.avgTotalMs)}</dd>
                                    <dt className="text-muted">p95 total</dt>
                                    <dd className="text-white tabular-nums">{formatMs(selectedWindow.p95TotalMs)}</dd>
                                    <dt className="text-muted">Max total</dt>
                                    <dd className="text-white tabular-nums">{formatMs(selectedWindow.maxTotalMs)}</dd>
                                    <dt className="text-muted">Spike tick</dt>
                                    <dd className="text-white tabular-nums">{selectedWindow.spikeTick ?? '—'}</dd>
                                    <dt className="text-muted">Avg engine</dt>
                                    <dd className="text-white tabular-nums">{formatMs(selectedWindow.avgEngineMs)}</dd>
                                    <dt className="text-muted">Avg UI</dt>
                                    <dd className="text-white tabular-nums">{formatMs(selectedWindow.avgUiMs)}</dd>
                                    <dt className="text-muted">Avg canvas</dt>
                                    <dd className="text-white tabular-nums">{formatMs(selectedWindow.avgCanvasMs)}</dd>
                                </dl>
                            </div>
                            <div>
                                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                                    Category averages (depth ≤ 2)
                                </h3>
                                <div className="h-48 w-full rounded border border-border-custom bg-surface-light/30 p-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={categoryBreakdown}
                                            layout="vertical"
                                            margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
                                        >
                                            <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" />
                                            <XAxis type="number" stroke="#a1a1aa" tick={{ fontSize: 11 }} />
                                            <YAxis
                                                type="category"
                                                dataKey="path"
                                                width={110}
                                                stroke="#a1a1aa"
                                                tick={{ fontSize: 10 }}
                                            />
                                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                                            <Bar dataKey="avg" name="avg ms" fill="#38bdf8" isAnimationActive={false} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}

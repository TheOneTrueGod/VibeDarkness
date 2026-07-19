/**
 * Live battle performance history (last N ticks) with stacked-area chart and
 * drill-down table / breadcrumb navigation through performanceLog categories.
 * Click a chart point or X-axis tick label to pin the table to that game tick.
 */
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    PERFORMANCE_HISTORY_CAPACITY,
    tickPerformanceTracker,
} from '../../../games/minion_battles/game/performance/tickPerformanceTracker';
import { useDebugSettings } from '../../../contexts/DebugSettingsContext';
import {
    PERFORMANCE_CHART_COLORS,
    buildPerformanceStackChartRows,
    getPerformanceNodeAtPath,
    listPerformanceChildCategories,
} from '../performanceDebugView';

interface DebugPerformanceTabProps {
    isActive: boolean;
    inBattle: boolean;
}

const CHART_MARGIN = { top: 8, right: 12, left: 0, bottom: 0 };
const TOOLTIP_STYLE = {
    backgroundColor: '#0a0a0a',
    border: '1px solid #3f3f46',
    borderRadius: 6,
    fontSize: 12,
};

function subscribePerformanceHistory(onStoreChange: () => void): () => void {
    return tickPerformanceTracker.subscribe(onStoreChange);
}

function getPerformanceHistorySnapshot(): string {
    const history = tickPerformanceTracker.getHistory();
    if (history.length === 0) return '0';
    const last = history[history.length - 1]!;
    return `${history.length}:${last.gameTick}:${last.log.totalTimeTaken}`;
}

function parseTickLabel(label: unknown): number | null {
    if (typeof label === 'number' && Number.isFinite(label)) return label;
    if (typeof label === 'string' && label !== '') {
        const n = Number(label);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

interface ChartAxisTickProps {
    x?: number;
    y?: number;
    payload?: { value?: string | number };
    selectedTick: number | null;
    onSelectTick: (tick: number) => void;
}

function ChartAxisTick({ x = 0, y = 0, payload, selectedTick, onSelectTick }: ChartAxisTickProps) {
    const value = payload?.value;
    const tick = parseTickLabel(value);
    const isSelected = tick != null && tick === selectedTick;
    return (
        <text
            x={x}
            y={y + 10}
            textAnchor="middle"
            fill={isSelected ? '#f59e0b' : '#a1a1aa'}
            fontSize={11}
            fontWeight={isSelected ? 600 : 400}
            className="cursor-pointer"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
                e.stopPropagation();
                if (tick != null) onSelectTick(tick);
            }}
        >
            {value}
        </text>
    );
}

export default function DebugPerformanceTab({ isActive, inBattle }: DebugPerformanceTabProps) {
    const { jsPerformanceTracking } = useDebugSettings();
    const [path, setPath] = useState<string[]>([]);
    /** When set, table shows this tick; when null (or scrolled out of history), follows latest. */
    const [selectedTick, setSelectedTick] = useState<number | null>(null);

    const historyEpoch = useSyncExternalStore(
        subscribePerformanceHistory,
        getPerformanceHistorySnapshot,
        getPerformanceHistorySnapshot,
    );

    const history = useMemo(() => {
        void historyEpoch;
        return tickPerformanceTracker.getHistory();
    }, [historyEpoch]);

    const displayRecord = useMemo(() => {
        if (history.length === 0) return null;
        if (selectedTick != null) {
            const pinned = history.find((r) => r.gameTick === selectedTick);
            if (pinned) return pinned;
        }
        return history[history.length - 1]!;
    }, [history, selectedTick]);

    const displayLog = displayRecord?.log ?? null;
    const displayTick = displayRecord?.gameTick ?? null;
    const isFollowingLatest =
        selectedTick == null ||
        (displayTick != null && history.length > 0 && displayTick === history[history.length - 1]!.gameTick);

    const currentNode = getPerformanceNodeAtPath(displayLog, path);
    const tableRows = useMemo(() => listPerformanceChildCategories(currentNode), [currentNode]);

    const { rows: chartRows, seriesKeys } = useMemo(
        () => buildPerformanceStackChartRows(history, path),
        [history, path],
    );

    if (!isActive || !inBattle) return null;

    if (!jsPerformanceTracking) {
        return (
            <div className="text-sm text-muted max-w-xl">
                Enable <span className="text-white">JS performance tracking</span> in Debug Toggles to record timings.
                The last {PERFORMANCE_HISTORY_CAPACITY} game ticks are kept in memory only (not serialized).
            </div>
        );
    }

    if (history.length === 0) {
        return (
            <div className="text-sm text-muted">
                Waiting for ticks… Advance the simulation to populate the last-{PERFORMANCE_HISTORY_CAPACITY}-tick
                ring buffer.
            </div>
        );
    }

    const selectTick = (tick: number) => {
        setSelectedTick(tick);
    };

    const drillInto = (key: string) => {
        const nextPath = [...path, key];
        const nextNode = getPerformanceNodeAtPath(displayLog, nextPath);
        const children = listPerformanceChildCategories(nextNode);
        if (children.length === 0) return;
        setPath(nextPath);
    };

    return (
        <div className="text-sm text-white space-y-4">
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                <button
                    type="button"
                    className={`px-1.5 py-0.5 rounded hover:bg-surface-light hover:text-white transition-colors ${
                        path.length === 0 ? 'text-white' : ''
                    }`}
                    onClick={() => setPath([])}
                >
                    root
                </button>
                {path.map((segment, index) => (
                    <React.Fragment key={`${segment}-${index}`}>
                        <span className="text-zinc-600">/</span>
                        <button
                            type="button"
                            className={`px-1.5 py-0.5 rounded hover:bg-surface-light hover:text-white transition-colors ${
                                index === path.length - 1 ? 'text-white' : ''
                            }`}
                            onClick={() => setPath(path.slice(0, index + 1))}
                        >
                            {segment}
                        </button>
                    </React.Fragment>
                ))}
                <span className="ml-auto tabular-nums text-[11px] flex items-center gap-2">
                    <span>
                        {history.length}/{PERFORMANCE_HISTORY_CAPACITY} ticks · table t{displayTick}
                        {currentNode != null ? ` · ${currentNode.totalTimeTaken.toFixed(2)} ms` : ''}
                    </span>
                    {!isFollowingLatest && (
                        <button
                            type="button"
                            className="px-1.5 py-0.5 rounded border border-border-custom text-amber-300 hover:bg-surface-light hover:text-white transition-colors"
                            onClick={() => setSelectedTick(null)}
                        >
                            Follow latest
                        </button>
                    )}
                </span>
            </div>

            <div className="h-52 w-full rounded border border-border-custom bg-surface-light/30 p-2 cursor-pointer">
                {seriesKeys.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-muted text-xs">
                        No sub-categories at this path (leaf). Use the breadcrumb to go up.
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartRows}
                            margin={CHART_MARGIN}
                            onClick={(state) => {
                                const tick = parseTickLabel(state?.activeLabel);
                                if (tick != null) selectTick(tick);
                            }}
                        >
                            <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" />
                            <XAxis
                                dataKey="tick"
                                stroke="#a1a1aa"
                                tick={(props) => (
                                    <ChartAxisTick
                                        {...props}
                                        selectedTick={displayTick}
                                        onSelectTick={selectTick}
                                    />
                                )}
                                height={28}
                            />
                            <YAxis stroke="#a1a1aa" tick={{ fontSize: 11 }} width={48} unit=" ms" />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            {displayTick != null && (
                                <ReferenceLine
                                    x={displayTick}
                                    stroke="#f59e0b"
                                    strokeDasharray="4 3"
                                    strokeWidth={1.5}
                                />
                            )}
                            {seriesKeys.map((key, i) => (
                                <Area
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    name={key}
                                    stackId="categories"
                                    stroke={PERFORMANCE_CHART_COLORS[i % PERFORMANCE_CHART_COLORS.length]}
                                    fill={PERFORMANCE_CHART_COLORS[i % PERFORMANCE_CHART_COLORS.length]}
                                    fillOpacity={0.55}
                                    isAnimationActive={false}
                                    activeDot={{
                                        r: 4,
                                        onClick: (_e, payload) => {
                                            const raw = (payload as { payload?: { tick?: number } } | undefined)
                                                ?.payload?.tick;
                                            const tick = parseTickLabel(raw);
                                            if (tick != null) selectTick(tick);
                                        },
                                    }}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
            <p className="text-[11px] text-muted -mt-2">
                Click a chart point or X-axis tick label to show that game tick in the table.
            </p>

            <div>
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                    Categories (tick {displayTick}
                    {isFollowingLatest ? ', latest' : ''})
                </h3>
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="text-left text-muted border-b border-border-custom">
                            <th className="py-1.5 pr-2 font-medium">Category</th>
                            <th className="py-1.5 pr-2 font-medium text-right">ms</th>
                            <th className="py-1.5 font-medium text-right">Share</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableRows.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="py-2 text-muted">
                                    No child categories.
                                </td>
                            </tr>
                        ) : (
                            tableRows.map((row) => {
                                const parentTotal = currentNode?.totalTimeTaken ?? 0;
                                const share =
                                    parentTotal > 0 ? ((row.totalTimeTaken / parentTotal) * 100).toFixed(1) : '—';
                                return (
                                    <tr
                                        key={row.key}
                                        className={`border-b border-border-custom/50 ${
                                            row.hasChildren
                                                ? 'cursor-pointer hover:bg-surface-light/60'
                                                : 'opacity-90'
                                        }`}
                                        onClick={() => {
                                            if (row.hasChildren) drillInto(row.key);
                                        }}
                                    >
                                        <td className="py-1.5 pr-2">
                                            {row.key}
                                            {row.hasChildren ? (
                                                <span className="ml-1 text-muted">›</span>
                                            ) : null}
                                        </td>
                                        <td className="py-1.5 pr-2 text-right tabular-nums">
                                            {row.totalTimeTaken.toFixed(2)}
                                        </td>
                                        <td className="py-1.5 text-right tabular-nums text-muted">{share}%</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

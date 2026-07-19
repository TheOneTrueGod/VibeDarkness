/**
 * Helpers for Lobby Archive → Performance tab: extract and window
 * `performanceLog` samples from user-state game_state blobs.
 */

import type { PerformanceLog, PerformanceLogNode } from '../../../games/minion_battles/game/performance/tickPerformanceTracker';

/** Tick window size used by the archive Performance tab (matches User States batches). */
export const PERFORMANCE_WINDOW_SIZE = 25;

export interface PerformanceSample {
    tick: number;
    totalMs: number;
    engineMs: number;
    uiMs: number;
    canvasMs: number;
    reactMs: number;
    /** Nested category totals keyed by dotted path (e.g. `engine.units`). */
    categories: Record<string, number>;
}

export interface PerformanceWindowStats {
    fromTick: number;
    toTick: number;
    sampleCount: number;
    avgTotalMs: number;
    maxTotalMs: number;
    p95TotalMs: number;
    avgEngineMs: number;
    avgUiMs: number;
    avgCanvasMs: number;
    spikeTick: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object' && !Array.isArray(value);
}

function readNodeMs(node: unknown): number {
    if (!isRecord(node)) return 0;
    const raw = node.totalTimeTaken;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

function walkCategories(node: PerformanceLogNode, prefix: string, out: Record<string, number>): void {
    for (const [key, value] of Object.entries(node)) {
        if (key === 'totalTimeTaken' || key === 'description') continue;
        if (!isRecord(value) || typeof (value as PerformanceLogNode).totalTimeTaken !== 'number') continue;
        const path = prefix ? `${prefix}.${key}` : key;
        out[path] = (value as PerformanceLogNode).totalTimeTaken;
        walkCategories(value as PerformanceLogNode, path, out);
    }
}

/** Pull a sample from one user-state JSONL entry (or null if no performanceLog). */
export function extractPerformanceSample(entry: unknown): PerformanceSample | null {
    if (!isRecord(entry)) return null;
    const tick = typeof entry.tick === 'number' ? entry.tick : null;
    if (tick == null || !Number.isFinite(tick)) return null;

    const gameState = entry.game_state;
    if (!isRecord(gameState)) return null;
    const log = gameState.performanceLog;
    if (!isRecord(log) || typeof log.totalTimeTaken !== 'number') return null;

    const perf = log as PerformanceLog;
    const categories: Record<string, number> = {};
    walkCategories(perf, '', categories);

    const engine = isRecord(perf.engine) ? (perf.engine as PerformanceLogNode) : null;
    const ui = isRecord(perf.ui) ? (perf.ui as PerformanceLogNode) : null;
    const canvas = ui && isRecord(ui.canvas) ? (ui.canvas as PerformanceLogNode) : null;
    const react = ui && isRecord(ui.react) ? (ui.react as PerformanceLogNode) : null;

    return {
        tick,
        totalMs: perf.totalTimeTaken,
        engineMs: readNodeMs(engine),
        uiMs: readNodeMs(ui),
        canvasMs: readNodeMs(canvas),
        reactMs: readNodeMs(react),
        categories,
    };
}

export function buildPerformanceWindows(
    maxTick: number,
    windowSize: number = PERFORMANCE_WINDOW_SIZE,
): { fromTick: number; toTick: number }[] {
    if (!Number.isFinite(maxTick) || maxTick < 0 || windowSize < 1) return [];
    const windows: { fromTick: number; toTick: number }[] = [];
    for (let start = 0; start <= maxTick; start += windowSize) {
        windows.push({ fromTick: start, toTick: Math.min(start + windowSize - 1, maxTick) });
    }
    return windows;
}

function percentile(sortedAscending: number[], p: number): number {
    if (sortedAscending.length === 0) return 0;
    const idx = Math.min(sortedAscending.length - 1, Math.max(0, Math.ceil(p * sortedAscending.length) - 1));
    return sortedAscending[idx]!;
}

export function aggregatePerformanceWindow(
    samples: readonly PerformanceSample[],
    fromTick: number,
    toTick: number,
): PerformanceWindowStats {
    const inWindow = samples.filter((s) => s.tick >= fromTick && s.tick <= toTick);
    if (inWindow.length === 0) {
        return {
            fromTick,
            toTick,
            sampleCount: 0,
            avgTotalMs: 0,
            maxTotalMs: 0,
            p95TotalMs: 0,
            avgEngineMs: 0,
            avgUiMs: 0,
            avgCanvasMs: 0,
            spikeTick: null,
        };
    }

    let sumTotal = 0;
    let sumEngine = 0;
    let sumUi = 0;
    let sumCanvas = 0;
    let maxTotal = -Infinity;
    let spikeTick: number | null = null;
    const totals: number[] = [];

    for (const s of inWindow) {
        sumTotal += s.totalMs;
        sumEngine += s.engineMs;
        sumUi += s.uiMs;
        sumCanvas += s.canvasMs;
        totals.push(s.totalMs);
        if (s.totalMs > maxTotal) {
            maxTotal = s.totalMs;
            spikeTick = s.tick;
        }
    }

    totals.sort((a, b) => a - b);
    const n = inWindow.length;
    return {
        fromTick,
        toTick,
        sampleCount: n,
        avgTotalMs: sumTotal / n,
        maxTotalMs: maxTotal,
        p95TotalMs: percentile(totals, 0.95),
        avgEngineMs: sumEngine / n,
        avgUiMs: sumUi / n,
        avgCanvasMs: sumCanvas / n,
        spikeTick,
    };
}

/** Chart rows for per-tick line/area series. */
export function samplesToChartRows(samples: readonly PerformanceSample[]): Array<{
    tick: number;
    total: number;
    engine: number;
    ui: number;
    canvas: number;
    react: number;
}> {
    return [...samples]
        .sort((a, b) => a.tick - b.tick)
        .map((s) => ({
            tick: s.tick,
            total: round3(s.totalMs),
            engine: round3(s.engineMs),
            ui: round3(s.uiMs),
            canvas: round3(s.canvasMs),
            react: round3(s.reactMs),
        }));
}

function round3(n: number): number {
    return Math.round(n * 1000) / 1000;
}

export function maxTickFromUserStateIndex(users: Record<string, { fromTick: number; toTick: number }[]>): number {
    let maxTick = 0;
    for (const files of Object.values(users)) {
        for (const f of files) {
            if (f.toTick > maxTick) maxTick = f.toTick;
        }
    }
    return maxTick;
}

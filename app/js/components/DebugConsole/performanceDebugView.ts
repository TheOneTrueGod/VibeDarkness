/**
 * Path navigation helpers for nested performanceLog trees (Debug Console / archive).
 */

import type {
    PerformanceLog,
    PerformanceLogNode,
    PerformanceTickRecord,
} from '../../games/minion_battles/game/performance/tickPerformanceTracker';

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function isPerformanceCategoryNode(value: unknown): value is PerformanceLogNode {
    return isRecord(value) && typeof value.totalTimeTaken === 'number';
}

/** Resolve a nested node by category path segments (empty path → root log). */
export function getPerformanceNodeAtPath(
    log: PerformanceLog | PerformanceLogNode | null | undefined,
    path: readonly string[],
): PerformanceLogNode | null {
    if (!log) return null;
    let node: PerformanceLogNode = log;
    for (const segment of path) {
        const next = node[segment];
        if (!isPerformanceCategoryNode(next)) return null;
        node = next;
    }
    return node;
}

export interface PerformanceCategoryRow {
    key: string;
    totalTimeTaken: number;
    hasChildren: boolean;
}

/** Immediate child categories of a node (excludes `totalTimeTaken` / `description`). */
export function listPerformanceChildCategories(node: PerformanceLogNode | null): PerformanceCategoryRow[] {
    if (!node) return [];
    const rows: PerformanceCategoryRow[] = [];
    for (const [key, value] of Object.entries(node)) {
        if (key === 'totalTimeTaken' || key === 'description') continue;
        if (!isPerformanceCategoryNode(value)) continue;
        let hasChildren = false;
        for (const [childKey, childVal] of Object.entries(value)) {
            if (childKey === 'totalTimeTaken' || childKey === 'description') continue;
            if (isPerformanceCategoryNode(childVal)) {
                hasChildren = true;
                break;
            }
        }
        rows.push({ key, totalTimeTaken: value.totalTimeTaken, hasChildren });
    }
    rows.sort((a, b) => b.totalTimeTaken - a.totalTimeTaken || a.key.localeCompare(b.key));
    return rows;
}

/**
 * Build Recharts rows for a stacked area: one point per tick, series = child category
 * keys at `path` (or root categories when path is empty).
 */
export function buildPerformanceStackChartRows(
    history: readonly PerformanceTickRecord[],
    path: readonly string[],
): { rows: Array<Record<string, number>>; seriesKeys: string[] } {
    const keySet = new Set<string>();
    for (const record of history) {
        const node = getPerformanceNodeAtPath(record.log, path);
        for (const row of listPerformanceChildCategories(node)) {
            keySet.add(row.key);
        }
    }
    const seriesKeys = [...keySet].sort((a, b) => a.localeCompare(b));
    const rows = history.map((record) => {
        const point: Record<string, number> = { tick: record.gameTick };
        const node = getPerformanceNodeAtPath(record.log, path);
        if (node) {
            point.total = Math.round(node.totalTimeTaken * 1000) / 1000;
        }
        for (const key of seriesKeys) {
            const child = node ? node[key] : null;
            point[key] = isPerformanceCategoryNode(child)
                ? Math.round(child.totalTimeTaken * 1000) / 1000
                : 0;
        }
        return point;
    });
    return { rows, seriesKeys };
}

/** Stable palette for stacked series (cycles). */
export const PERFORMANCE_CHART_COLORS = [
    '#38bdf8',
    '#a78bfa',
    '#34d399',
    '#fbbf24',
    '#f87171',
    '#fb7185',
    '#2dd4bf',
    '#c084fc',
    '#4ade80',
    '#f472b6',
] as const;

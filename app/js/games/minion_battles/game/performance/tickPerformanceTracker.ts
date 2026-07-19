/**
 * Nested JS performance timings for the last completed game tick.
 * Enabled via Debug Console → JS performance tracking.
 *
 * Leaf/branch nodes always expose `totalTimeTaken` (ms). Branches may nest
 * further category objects beside that summary field. Parent `totalTimeTaken`
 * is inclusive (own exclusive work + children).
 */

import { debugSettingsSnapshot } from '../../../../debug/debugSettingsStore';

/** Description attached to every finalized performanceLog root. */
export const PERFORMANCE_LOG_DESCRIPTION = 'time taken for the last gameTick';

export type PerformanceLogNode = {
    totalTimeTaken: number;
} & {
    [category: string]: PerformanceLogNode | number;
};

export type PerformanceLog = PerformanceLogNode & {
    description: typeof PERFORMANCE_LOG_DESCRIPTION;
};

/** One finalized tick retained in the client-only debug history ring. */
export interface PerformanceTickRecord {
    gameTick: number;
    log: PerformanceLog;
}

/** Client-only ring buffer size for the Debug Console Performance tab. */
export const PERFORMANCE_HISTORY_CAPACITY = 50;

type MutableNode = {
    /** Inclusive ms for this node (own work + children), summed across samples. */
    inclusiveMs: number;
    /** True once any sample was recorded directly on this node. */
    hasInclusive: boolean;
    children: Map<string, MutableNode>;
};

type StackFrame = {
    path: readonly string[];
    startMs: number;
};

function createNode(): MutableNode {
    return { inclusiveMs: 0, hasInclusive: false, children: new Map() };
}

function ensureChild(parent: MutableNode, key: string): MutableNode {
    let child = parent.children.get(key);
    if (!child) {
        child = createNode();
        parent.children.set(key, child);
    }
    return child;
}

function getNode(root: MutableNode, path: readonly string[]): MutableNode {
    let node = root;
    for (const key of path) {
        node = ensureChild(node, key);
    }
    return node;
}

function buildNode(node: MutableNode): PerformanceLogNode {
    const children: Record<string, PerformanceLogNode> = {};
    let childSum = 0;
    for (const [key, child] of node.children) {
        const built = buildNode(child);
        children[key] = built;
        childSum += built.totalTimeTaken;
    }
    // Timed nodes keep their inclusive wall time (includes children). Untimed structural
    // parents (and the root) roll up as the sum of child totals.
    const total = node.hasInclusive ? node.inclusiveMs : childSum;
    return { totalTimeTaken: roundMs(total), ...children };
}

function roundMs(ms: number): number {
    return Math.round(ms * 1000) / 1000;
}

/**
 * Collects nested timings between game ticks. Call {@link finalizeLastGameTick} at the
 * end of each completed `fixedUpdate`; read the result via {@link getLastPerformanceLog}.
 *
 * Nested `begin`/`end` (or `measure`) records inclusive times: a parent's `totalTimeTaken`
 * includes its children. Repeated samples under the same path (e.g. several canvas frames
 * between ticks) accumulate.
 */
export class TickPerformanceTracker {
    private root = createNode();
    private lastLog: PerformanceLog | null = null;
    /** Test override; when null, follows {@link debugSettingsSnapshot.jsPerformanceTracking}. */
    private enabledOverride: boolean | null = null;
    private stack: StackFrame[] = [];
    private history: PerformanceTickRecord[] = [];
    private listeners = new Set<() => void>();

    /** @param enabled When set, overrides the debug snapshot (tests). Pass `null` to follow snapshot. */
    setEnabled(enabled: boolean | null): void {
        this.enabledOverride = enabled;
        if (enabled === false) {
            this.root = createNode();
            this.lastLog = null;
            this.stack = [];
            this.history = [];
            this.notify();
        }
    }

    isEnabled(): boolean {
        return this.enabledOverride ?? debugSettingsSnapshot.jsPerformanceTracking;
    }

    /** Subscribe to history / last-log updates (Debug Console Performance tab). */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }

    /**
     * Open a nested timing scope. Path is relative to the current stack frame when nested,
     * or absolute from the root when the stack is empty.
     *
     * Examples:
     * - `begin('engine'); begin('units'); end(); end();` → engine.units
     * - `begin('ui', 'canvas', 'units'); end();` → ui.canvas.units
     */
    begin(...segments: string[]): void {
        if (!this.isEnabled() || segments.length === 0) return;
        const parentPath = this.stack.length > 0 ? this.stack[this.stack.length - 1]!.path : [];
        this.stack.push({
            path: [...parentPath, ...segments],
            startMs: performance.now(),
        });
    }

    end(): void {
        if (!this.isEnabled() || this.stack.length === 0) return;
        const frame = this.stack.pop()!;
        const inclusive = performance.now() - frame.startMs;
        const node = getNode(this.root, frame.path);
        node.inclusiveMs += inclusive;
        node.hasInclusive = true;
    }

    /**
     * Measure wall time of `fn` under `segments` (same path rules as {@link begin}).
     * Always runs `fn`; timing cost is skipped when disabled.
     */
    measure<T>(segments: readonly string[], fn: () => T): T {
        if (!this.isEnabled()) return fn();
        this.begin(...segments);
        try {
            return fn();
        } finally {
            this.end();
        }
    }

    /**
     * Add inclusive wall time under an absolute path (no stack interaction).
     * Useful for accumulating frame costs outside a nested begin/end block.
     */
    addAbsolute(path: readonly string[], ms: number): void {
        if (!this.isEnabled() || path.length === 0 || !Number.isFinite(ms) || ms <= 0) return;
        const node = getNode(this.root, path);
        node.inclusiveMs += ms;
        node.hasInclusive = true;
    }

    /**
     * Snapshot accumulated timings into the last-tick performance log and clear
     * the accumulator for the next tick / frame window.
     * When `gameTick` is provided, also pushes into the client-only history ring.
     */
    finalizeLastGameTick(gameTick?: number): PerformanceLog | null {
        if (!this.isEnabled()) {
            this.lastLog = null;
            return null;
        }
        // Drop any unbalanced scopes so a finalize cannot strand the stack.
        this.stack = [];
        const built = buildNode(this.root);
        const { totalTimeTaken, ...categories } = built;
        this.lastLog = {
            description: PERFORMANCE_LOG_DESCRIPTION,
            totalTimeTaken,
            ...categories,
        } as PerformanceLog;
        this.root = createNode();
        if (typeof gameTick === 'number' && Number.isFinite(gameTick)) {
            this.history.push({ gameTick, log: this.lastLog });
            while (this.history.length > PERFORMANCE_HISTORY_CAPACITY) {
                this.history.shift();
            }
        }
        this.notify();
        return this.lastLog;
    }

    getLastPerformanceLog(): PerformanceLog | null {
        return this.isEnabled() ? this.lastLog : null;
    }

    /** Newest-last copy of the client-only history ring (max {@link PERFORMANCE_HISTORY_CAPACITY}). */
    getHistory(): readonly PerformanceTickRecord[] {
        return this.history.slice();
    }

    /** Test helper — wipe accumulator, last log, and history. */
    reset(): void {
        this.root = createNode();
        this.lastLog = null;
        this.stack = [];
        this.history = [];
        this.notify();
    }
}

/** Process-wide tracker used by the engine, canvas, and battle session. */
export const tickPerformanceTracker = new TickPerformanceTracker();

/** Path segment constants — keep call sites free of magic strings. */
export const PERF_ENGINE = 'engine' as const;
export const PERF_ENGINE_ORDERS = 'orders' as const;
export const PERF_ENGINE_LEVEL_EVENTS = 'levelEvents' as const;
export const PERF_ENGINE_UNITS = 'units' as const;
/** Relative to {@link PERF_ENGINE_UNITS} when measured inside that scope. */
export const PERF_UNITS_PASSIVES = 'passives' as const;
export const PERF_UNITS_ABILITIES = 'abilities' as const;
export const PERF_UNITS_RESOURCES = 'resources' as const;
export const PERF_UNITS_OCCUPANCY = 'occupancy' as const;
export const PERF_UNITS_MOVEMENT = 'movement' as const;
export const PERF_UNITS_AI = 'ai' as const;
export const PERF_UNITS_NINJUTSU = 'ninjutsu' as const;
export const PERF_UNITS_TARGETS = 'targets' as const;
export const PERF_ENGINE_PROJECTILES = 'projectiles' as const;
export const PERF_ENGINE_EFFECTS = 'effects' as const;
export const PERF_ENGINE_LIGHTING = 'lighting' as const;
export const PERF_ENGINE_NESTS = 'nests' as const;
export const PERF_ENGINE_CLEANUP = 'cleanup' as const;
export const PERF_ENGINE_RENDER_TICK = 'renderTick' as const;

export const PERF_UI = 'ui' as const;
export const PERF_UI_REACT = 'react' as const;
export const PERF_UI_CANVAS = 'canvas' as const;
export const PERF_UI_CANVAS_TERRAIN = 'terrain' as const;
export const PERF_UI_CANVAS_OVERLAY = 'overlay' as const;
export const PERF_UI_CANVAS_FLOOR_TILES = 'floorTiles' as const;
export const PERF_UI_CANVAS_TERRAIN_EFFECTS = 'terrainEffects' as const;
export const PERF_UI_CANVAS_UNITS = 'units' as const;
export const PERF_UI_CANVAS_SPECIAL_TILES = 'specialTiles' as const;
export const PERF_UI_CANVAS_LIGHT_SOURCES = 'lightSources' as const;
export const PERF_UI_CANVAS_PROJECTILES = 'projectiles' as const;
export const PERF_UI_CANVAS_EFFECTS = 'effects' as const;
export const PERF_UI_CANVAS_PREVIEWS = 'previews' as const;
export const PERF_UI_CANVAS_MAP_NETWORK = 'mapNetwork' as const;
export const PERF_UI_CANVAS_PIXI_PRESENT = 'pixiPresent' as const;
/** Relative to {@link PERF_UI_CANVAS_PIXI_PRESENT} — Pixi runner stages inside `app.render()`. */
export const PERF_PIXI_PRERENDER = 'prerender' as const;
export const PERF_PIXI_RENDER_START = 'renderStart' as const;
export const PERF_PIXI_WEBGL = 'webgl' as const;
export const PERF_PIXI_RENDER_END = 'renderEnd' as const;
export const PERF_PIXI_POSTRENDER = 'postrender' as const;

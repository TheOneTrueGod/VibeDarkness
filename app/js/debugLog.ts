/**
 * Severity-filtered debug logging (console only; not persisted).
 * Threshold is a floor: messages at that severity or higher are printed.
 */

export const DEBUG_TYPES = ['sync tracking'] as const;
export type DebugType = (typeof DEBUG_TYPES)[number];

export const DEBUG_TYPE_LABELS: Record<DebugType, string> = {
    'sync tracking': 'Sync tracking',
};

/** Ordered low → high. A threshold of `warn` prints warn, error, and critical only. */
export const DEBUG_SEVERITIES = ['log', 'info', 'warn', 'error', 'critical'] as const;
export type DebugSeverity = (typeof DEBUG_SEVERITIES)[number];

/** `off` silences that debug type entirely. */
export type DebugLogThreshold = 'off' | DebugSeverity;

const SEVERITY_RANK: Record<DebugSeverity, number> = {
    log: 0,
    info: 1,
    warn: 2,
    error: 3,
    critical: 4,
};

export const DEBUG_LOG_THRESHOLD_LABELS: Record<DebugLogThreshold, string> = {
    off: 'Off (silent)',
    log: 'Log and above (most verbose)',
    info: 'Info and above',
    warn: 'Warn and above',
    error: 'Error and above',
    critical: 'Critical only',
};

const STORAGE_KEY = 'vibedarkness.debugLog.thresholds';

const DEFAULT_THRESHOLDS: Record<DebugType, DebugLogThreshold> = {
    'sync tracking': 'info',
};

function parseStored(raw: string | null): Partial<Record<DebugType, DebugLogThreshold>> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const out: Partial<Record<DebugType, DebugLogThreshold>> = {};
        for (const t of DEBUG_TYPES) {
            const v = parsed[t];
            if (v === 'off') out[t] = 'off';
            else if (
                typeof v === 'string'
                && (DEBUG_SEVERITIES as readonly string[]).includes(v)
            ) {
                out[t] = v as DebugSeverity;
            }
        }
        return out;
    } catch {
        return {};
    }
}

function readThresholdsFromStorage(): Record<DebugType, DebugLogThreshold> {
    let stored: Partial<Record<DebugType, DebugLogThreshold>> = {};
    try {
        stored = parseStored(localStorage.getItem(STORAGE_KEY));
    } catch {
        /* ignore */
    }
    return { ...DEFAULT_THRESHOLDS, ...stored };
}

let thresholds: Record<DebugType, DebugLogThreshold> = readThresholdsFromStorage();

function dispatchChanged(): void {
    window.dispatchEvent(new Event('vd-debug-log-state-changed'));
}

function writeStorage(): void {
    try {
        const obj: Record<string, DebugLogThreshold> = {};
        for (const t of DEBUG_TYPES) {
            obj[t] = thresholds[t]!;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
        /* ignore */
    }
    dispatchChanged();
}

export const debugLogState = {
    getThreshold(type: DebugType): DebugLogThreshold {
        return thresholds[type] ?? DEFAULT_THRESHOLDS[type];
    },

    setThreshold(type: DebugType, value: DebugLogThreshold): void {
        thresholds = { ...thresholds, [type]: value };
        writeStorage();
    },

    subscribe(onChange: () => void): () => void {
        const handler = () => onChange();
        window.addEventListener('vd-debug-log-state-changed', handler);
        window.addEventListener('storage', handler);
        return () => {
            window.removeEventListener('vd-debug-log-state-changed', handler);
            window.removeEventListener('storage', handler);
        };
    },
};

function shouldPrint(type: DebugType, severity: DebugSeverity): boolean {
    const t = debugLogState.getThreshold(type);
    if (t === 'off') return false;
    return SEVERITY_RANK[severity] >= SEVERITY_RANK[t];
}

/**
 * Emits a debug line if `severity` is at or above the configured floor for `type`.
 * Arguments are passed through like `console.log` (no string joining).
 */
export function debugLog(type: DebugType, severity: DebugSeverity, ...args: unknown[]): void {
    if (!shouldPrint(type, severity)) return;
    const prefix = `[${DEBUG_TYPE_LABELS[type]}]`;
    switch (severity) {
        case 'log':
            console.log(prefix, ...args);
            break;
        case 'info':
            console.info(prefix, ...args);
            break;
        case 'warn':
            console.warn(prefix, ...args);
            break;
        case 'error':
        case 'critical':
            console.error(prefix, ...args);
            break;
    }
}

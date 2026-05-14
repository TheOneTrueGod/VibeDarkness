/**
 * Per–log-type floors for POSTing lines to `lobby_log.jsonl` (see Debug Console → Debug Toggles).
 * Persists in localStorage; does not sync to the server.
 */
import type { DebugLogThreshold, DebugSeverity } from './debugLog';
import { DEBUG_SEVERITIES } from './debugLog';

export const LOBBY_LOG_TYPES = ['desync', 'battleSync', 'debug'] as const;
export type LobbyLogType = (typeof LOBBY_LOG_TYPES)[number];

export const LOBBY_LOG_TYPE_LABELS: Record<LobbyLogType, string> = {
    desync: 'Lobby log — desync / resync',
    battleSync: 'Lobby log — battle sync',
    debug: 'Lobby log — general debug',
};

const SEVERITY_RANK: Record<DebugSeverity, number> = {
    log: 0,
    info: 1,
    warn: 2,
    error: 3,
    critical: 4,
};

const STORAGE_KEY = 'vibedarkness.lobbyLogPost.thresholds';

const DEFAULT_THRESHOLDS: Record<LobbyLogType, DebugLogThreshold> = {
    desync: 'info',
    battleSync: 'info',
    debug: 'off',
};

function parseStored(raw: string | null): Partial<Record<LobbyLogType, DebugLogThreshold>> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const out: Partial<Record<LobbyLogType, DebugLogThreshold>> = {};
        for (const t of LOBBY_LOG_TYPES) {
            const v = parsed[t];
            if (v === 'off') out[t] = 'off';
            else if (typeof v === 'string' && (DEBUG_SEVERITIES as readonly string[]).includes(v)) {
                out[t] = v as DebugSeverity;
            }
        }
        return out;
    } catch {
        return {};
    }
}

function readThresholdsFromStorage(): Record<LobbyLogType, DebugLogThreshold> {
    let stored: Partial<Record<LobbyLogType, DebugLogThreshold>> = {};
    try {
        stored = parseStored(localStorage.getItem(STORAGE_KEY));
    } catch {
        /* ignore */
    }
    return { ...DEFAULT_THRESHOLDS, ...stored };
}

let thresholds: Record<LobbyLogType, DebugLogThreshold> = readThresholdsFromStorage();

function dispatchChanged(): void {
    window.dispatchEvent(new Event('vd-lobby-log-post-thresholds-changed'));
}

function writeStorage(): void {
    try {
        const obj: Record<string, DebugLogThreshold> = {};
        for (const t of LOBBY_LOG_TYPES) {
            obj[t] = thresholds[t]!;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
        /* ignore */
    }
    dispatchChanged();
}

export const lobbyLogPostThresholdState = {
    getThreshold(type: LobbyLogType): DebugLogThreshold {
        return thresholds[type] ?? DEFAULT_THRESHOLDS[type];
    },

    setThreshold(type: LobbyLogType, value: DebugLogThreshold): void {
        thresholds = { ...thresholds, [type]: value };
        writeStorage();
    },

    subscribe(onChange: () => void): () => void {
        const handler = () => onChange();
        window.addEventListener('vd-lobby-log-post-thresholds-changed', handler);
        window.addEventListener('storage', handler);
        return () => {
            window.removeEventListener('vd-lobby-log-post-thresholds-changed', handler);
            window.removeEventListener('storage', handler);
        };
    },
};

export function shouldPostLobbyLogLine(logType: LobbyLogType, severity: DebugSeverity): boolean {
    const floor = lobbyLogPostThresholdState.getThreshold(logType);
    if (floor === 'off') return false;
    return SEVERITY_RANK[severity] >= SEVERITY_RANK[floor];
}

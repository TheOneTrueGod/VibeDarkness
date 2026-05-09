/**
 * Persisted lobby debug log (storage/lobbies/<lobbyId>/lobby_log.jsonl).
 *
 * **General lobby log** — `VITE_LOBBY_LOG_THRESHOLD`:
 * `off` | `log` | `info` | `warn` | `error` | `critical` — unset defaults to `off`.
 * A line is sent only if its severity rank is **≥** the threshold (lower name = more verbose).
 *
 * **Battle sync** (defer/flush on client; order POST diagnostics on server) —
 * `LOBBY_LOG_BATTLE_SYNC` in `global_constants.js` (client) / `global_constants.php` (PHP):
 * same token set; empty constant defaults to **`info`** (second most noisy: one step quieter than `log`).
 * Legacy `true` / `1` means **`log`** (most noisy). `off` disables battle-sync lines only.
 */
import type { LobbyClient } from './LobbyClient';
import { LOBBY_LOG_BATTLE_SYNC } from '../../global_constants.js';
import { DEBUG_SEVERITIES, type DebugSeverity } from './debugLog';
import { debugLog } from './debugLog';

export type LobbyLogThreshold = 'off' | DebugSeverity;

const SEVERITY_RANK: Record<DebugSeverity, number> = {
    log: 0,
    info: 1,
    warn: 2,
    error: 3,
    critical: 4,
};

function thresholdFromEnv(): LobbyLogThreshold {
    const raw = import.meta.env.VITE_LOBBY_LOG_THRESHOLD as string | undefined;
    if (raw === 'off') return 'off';
    if (typeof raw === 'string' && (DEBUG_SEVERITIES as readonly string[]).includes(raw)) {
        return raw as DebugSeverity;
    }
    return 'off';
}

function shouldSend(threshold: LobbyLogThreshold, severity: DebugSeverity): boolean {
    if (threshold === 'off') return false;
    return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}

/** Floor for `logToLobbyLogBattleSync` only. Default `info` when constant is empty. */
function battleSyncThresholdFromConstants(): LobbyLogThreshold {
    const raw = LOBBY_LOG_BATTLE_SYNC;
    if (typeof raw !== 'string' || raw === '') {
        return 'info';
    }
    if (raw === 'off') {
        return 'off';
    }
    if (raw === 'true' || raw === '1') {
        return 'log';
    }
    if ((DEBUG_SEVERITIES as readonly string[]).includes(raw)) {
        return raw as DebugSeverity;
    }
    return 'info';
}

export interface LogToLobbyLogArgs {
    lobbyClient: LobbyClient;
    lobbyId: string;
    playerId: string;
    /** Engine / session tick when relevant; use null if unknown. */
    tick: number | null;
    severity?: DebugSeverity;
    message: string;
    /** Optional extras (battle role, heartbeat summary, etc.). */
    context?: Record<string, unknown>;
    gameId?: string | null;
    gamePhase?: string | null;
}

function postLobbyLine(args: LogToLobbyLogArgs, severity: DebugSeverity): void {
    const tick = args.tick;
    const context: Record<string, unknown> = {
        tick,
        gameId: args.gameId ?? null,
        gamePhase: args.gamePhase ?? null,
        ...(args.context ?? {}),
    };

    debugLog('lobby log', severity, '[lobby log]', { playerId: args.playerId, message: args.message, ...context });

    void args.lobbyClient
        .appendLobbyLog(args.lobbyId, {
            playerId: args.playerId,
            severity,
            tick,
            message: args.message,
            context,
            gameId: args.gameId ?? undefined,
            gamePhase: args.gamePhase ?? undefined,
        })
        .catch(() => {
            debugLog('lobby log', 'warn', 'appendLobbyLog failed', args.message);
        });
}

/**
 * POST a single JSON line to the lobby log when env threshold allows.
 * Fire-and-forget; errors are swallowed (optional console line at warn).
 */
export function logToLobbyLog(args: LogToLobbyLogArgs): void {
    const severity = args.severity ?? 'log';
    const floor = thresholdFromEnv();
    if (!shouldSend(floor, severity)) {
        return;
    }
    postLobbyLine(args, severity);
}

export function isBattleSyncLobbyLogEnabled(): boolean {
    return battleSyncThresholdFromConstants() !== 'off';
}

/**
 * Battle-sync lines: uses `LOBBY_LOG_BATTLE_SYNC` from `global_constants.js` as a severity floor (not `VITE_LOBBY_LOG_THRESHOLD`).
 * Empty constant → floor `info`. `off` → none. `true`/`1` → floor `log`.
 */
export function logToLobbyLogBattleSync(args: LogToLobbyLogArgs): void {
    const severity = args.severity ?? 'info';
    const floor = battleSyncThresholdFromConstants();
    if (!shouldSend(floor, severity)) {
        return;
    }
    postLobbyLine(args, severity);
}


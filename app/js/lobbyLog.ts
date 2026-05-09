/**
 * Persisted lobby debug log (storage/lobbies/<lobbyId>/lobby_log.jsonl).
 *
 * Severity floor from `import.meta.env.VITE_LOBBY_LOG_THRESHOLD`:
 * `off` | `log` | `info` | `warn` | `error` | `critical` — unset defaults to `off`.
 */
import type { LobbyClient } from './LobbyClient';
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

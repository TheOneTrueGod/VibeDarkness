/**
 * Persisted lobby debug log (storage/lobbies/<lobbyId>/lobby_log.jsonl).
 *
 * Each line has a **logType** (`desync` | `battleSync` | `debug`) with its own severity floor in
 * **Debug Console → Debug Toggles** (persisted in localStorage). See `lobbyLogPostThresholds.ts`.
 *
 * Lines are queued and POSTed in batches (see `lobbyLogBatchQueue.ts`) except when
 * {@link LogToLobbyLogArgs.manualLobbyLogPost} is set for Debug Console «Log local state».
 */
import type { LobbyClient } from './LobbyClient';
import type { DebugSeverity } from './debugLog';
import { debugLog } from './debugLog';
import { enqueueBatchedLobbyLogLine } from './lobbyLogBatchQueue';
import {
    type LobbyLogType,
    lobbyLogPostThresholdState,
    shouldPostLobbyLogLine,
} from './lobbyLogPostThresholds';

export type { LobbyLogType };
export { LOBBY_LOG_TYPES, LOBBY_LOG_TYPE_LABELS } from './lobbyLogPostThresholds';

export interface LogToLobbyLogArgs {
    lobbyClient: LobbyClient;
    lobbyId: string;
    playerId: string;
    /** Engine / session tick when relevant; use null if unknown. */
    tick: number | null;
    severity?: DebugSeverity;
    message: string;
    logType: LobbyLogType;
    /** Optional extras (battle role, heartbeat summary, etc.). */
    context?: Record<string, unknown>;
    gameId?: string | null;
    gamePhase?: string | null;
    /**
     * When true (Debug Console «Log local state» only), POST immediately instead of the batch queue.
     */
    manualLobbyLogPost?: boolean;
}

/** Battle-sync helpers default `logType` to `battleSync`; pass `desync` for recovery-only lines. */
export type LogToLobbyLogBattleSyncArgs = Omit<LogToLobbyLogArgs, 'logType'> & { logType?: LobbyLogType };

function postLobbyLine(args: LogToLobbyLogArgs, severity: DebugSeverity): void {
    const tick = args.tick;
    const context: Record<string, unknown> = {
        tick,
        gameId: args.gameId ?? null,
        gamePhase: args.gamePhase ?? null,
        ...(args.context ?? {}),
    };

    debugLog('lobby log', severity, '[lobby log]', {
        logType: args.logType,
        playerId: args.playerId,
        message: args.message,
        ...context,
    });

    const body = {
        playerId: args.playerId,
        severity,
        tick,
        message: args.message,
        logType: args.logType,
        context,
        gameId: args.gameId ?? undefined,
        gamePhase: args.gamePhase ?? undefined,
    };

    const onFail = (): void => {
        debugLog('lobby log', 'warn', 'appendLobbyLog failed', args.message);
    };

    if (args.manualLobbyLogPost) {
        void args.lobbyClient.appendLobbyLog(args.lobbyId, body).catch(onFail);
        return;
    }

    enqueueBatchedLobbyLogLine({
        lobbyClient: args.lobbyClient,
        lobbyId: args.lobbyId,
        body,
    });
}

/**
 * POST a single JSON line to the lobby log when the logType's debug-toggle floor allows.
 * Fire-and-forget; errors are swallowed (optional console line at warn).
 */
export function logToLobbyLog(args: LogToLobbyLogArgs): void {
    const severity = args.severity ?? 'log';
    if (!shouldPostLobbyLogLine(args.logType, severity)) {
        return;
    }
    postLobbyLine(args, severity);
}

/**
 * POST to `lobby_log.jsonl` regardless of Debug Console log-type thresholds.
 * Use for automated diagnostics (e.g. desync recovery) where the user did not opt in via toggles.
 */
export function logToLobbyLogForced(args: LogToLobbyLogArgs): void {
    const severity = args.severity ?? 'log';
    postLobbyLine(args, severity);
}

export function isBattleSyncLobbyLogEnabled(): boolean {
    return lobbyLogPostThresholdState.getThreshold('battleSync') !== 'off';
}

/**
 * Battle-sync lines: delegates to {@link logToLobbyLog} with default severity `info` and default
 * `logType` `battleSync`. Use `logType: 'desync'` for recovery-only diagnostics.
 */
export function logToLobbyLogBattleSync(args: LogToLobbyLogBattleSyncArgs): void {
    logToLobbyLog({
        ...args,
        logType: args.logType ?? 'battleSync',
        severity: args.severity ?? 'info',
    });
}

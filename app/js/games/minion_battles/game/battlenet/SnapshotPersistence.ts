import type { LobbyClient } from '../../../../LobbyClient';
import { logToLobbyLog, logToLobbyLogForced } from '../../../../lobbyLog';
import { sleep } from './helpers/heartbeatTiming';
import type { BattleApi, BattleSessionHandle } from './types';
import type { SerializedGameState } from '../types';
import { TICK_STATE_HISTORY_CAPACITY, tickStateHistory } from '../tickStateHistory';

export interface SnapshotPersistenceConfig {
    api: BattleApi;
    session: BattleSessionHandle;
    isHost: boolean;
    lobbyId: string;
    gameId: string;
    playerId: string;
    /** Callback fired when `mergeAppliedOrdersForBatch` exhausts its retries and must escalate to resync. */
    requestResync: (reason: string) => void;
}

/**
 * Host-side snapshot/checkpoint POSTs and merge-applied-order calls.
 * Tracks `lastSnapshotTick` (last successful `saveBattleSnapshot` tick) and
 * `lastBootstrapSnapshotTick` (last tick used by `tryBootstrapFromLatestCheckpoint`).
 */
export class SnapshotPersistence {
    private lastSnapshotTick: number | null = null;
    private lastBootstrapSnapshotTick: number | null = null;

    constructor(private readonly config: SnapshotPersistenceConfig) {}

    getLastSnapshotTick(): number | null {
        return this.lastSnapshotTick;
    }

    getLastBootstrapSnapshotTick(): number | null {
        return this.lastBootstrapSnapshotTick;
    }

    setLastBootstrapSnapshotTick(value: number | null): void {
        this.lastBootstrapSnapshotTick = value;
    }

    async saveInitialState(): Promise<void> {
        if (!this.config.isHost) {
            return;
        }
        const existing = await this.getBattleInitialState();
        if (existing != null) {
            return;
        }
        const payload = this.config.session.getPayloadForPersistedInitialStateOrNull();
        if (payload == null) {
            return;
        }
        await this.config.api.saveBattleInitialState(this.config.lobbyId, this.config.gameId, {
            playerId: this.config.playerId,
            state: payload.state,
            initialFingerprint: payload.initialFingerprint,
        });
    }

    async getBattleInitialState(): Promise<{ state: SerializedGameState; initialFingerprint: string } | null> {
        return this.config.api.getBattleInitialState(this.config.lobbyId, this.config.gameId, this.config.playerId);
    }

    async saveSnapshotOnPause(tick: number, state: SerializedGameState): Promise<void> {
        if (!this.config.isHost || this.lastSnapshotTick === tick) {
            return;
        }
        // Must match `GameEngine.getRuntimeFingerprintHex` / tick-complete host flush — not the
        // layout digest from `GameEngine.computeInitialFingerprint`, or snapshot POST can win
        // `BattleStorage::appendFingerprints` first-writer and strand the wrong tail hash on disk.
        const checkpointFp = this.config.session.getRuntimeFingerprintHex();
        const checkpointPayload =
            typeof checkpointFp === 'string' && checkpointFp !== ''
                ? {
                      checkpointFingerprint: checkpointFp,
                      checkpointFingerprintPaused: this.config.session.getFingerprintTailPaused(),
                  }
                : {};
        await this.config.api.saveBattleSnapshot(this.config.lobbyId, this.config.gameId, {
            playerId: this.config.playerId,
            tick,
            state,
            ...checkpointPayload,
        });
        const engineNow = this.config.session.getEngineTick();
        if (engineNow > tick) {
            // `saveBattleSnapshot` can be slow; if the host already unpaused and simulated past
            // this checkpoint, do not append a stale `{tick}` line after higher ticks on disk.
            this.lastSnapshotTick = tick;
            return;
        }
        // When `checkpointFingerprint` is sent, the server appends `fingerprints.jsonl` in the same request.
        this.lastSnapshotTick = tick;
    }

    /**
     * Host-only: after local parallel batch orders are satisfied, persist pending → applied on the server.
     * Retries up to three times; returns false on total failure (`requestResync` already armed).
     */
    async mergeAppliedOrdersForBatch(batchAtTick: number): Promise<boolean> {
        if (!this.config.isHost || !Number.isFinite(batchAtTick) || batchAtTick < 1) {
            return true;
        }
        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const res = await this.config.api.mergeBattleAppliedOrders(this.config.lobbyId, this.config.gameId, {
                    playerId: this.config.playerId,
                    batchAtTick,
                });
                if (res.success) {
                    return true;
                }
            } catch (_) {
                /* retry */
            }
            await sleep(200 * (attempt + 1));
        }
        logToLobbyLog({
            lobbyClient: this.config.api as unknown as LobbyClient,
            lobbyId: this.config.lobbyId,
            playerId: this.config.playerId,
            tick: batchAtTick,
            severity: 'error',
            logType: 'desync',
            gameId: this.config.gameId,
            message: 'mergeBattleAppliedOrders failed after retries; requesting resync',
            context: { batchAtTick, attempts: maxAttempts },
        });
        this.config.requestResync('merge-applied-failed');
        return false;
    }

    /**
     * Debug: serializes the live engine via `BattleSessionHandle.getSerializedSnapshot`, logs it to
     * `lobby_log.jsonl` at **critical** severity (always POSTs — ignores Debug Console lobby-log
     * thresholds), also POSTs the in-memory recent-tick history ring, then (host only) POSTs the
     * same payload through `saveBattleSnapshot` — not React/debug-buffered lobby state.
     */
    async debugLogLocalStateAndSubmitSnapshot(): Promise<void> {
        await this.writeSerializedLocalStateToLobbyAndMaybeSnapshot({
            forceLobbyPost: true,
            immediateLobbyLog: true,
            includeTickHistory: true,
        });
    }

    /**
     * Same as {@link debugLogLocalStateAndSubmitSnapshot}, but lobby log lines always POST (ignore
     * debug-toggle floors). Prefaced by a compact marker line with the recovery `reason`.
     * Invoked only from {@link RecoveryCoordinator.runDesyncRecovery} — not from visibility / tab focus.
     */
    async desyncRecoveryLobbyTrace(reason: string): Promise<void> {
        const session = this.config.session;
        const tick = session.getEngineTick();
        const latestFp = session.getLatestFingerprint();
        logToLobbyLogForced({
            lobbyClient: this.config.api as unknown as LobbyClient,
            lobbyId: this.config.lobbyId,
            playerId: this.config.playerId,
            tick,
            severity: 'warn',
            logType: 'desync',
            gameId: this.config.gameId,
            gamePhase: 'battle',
            message: 'desync recovery: pre-repair trace marker',
            context: {
                reason,
                isHost: this.config.isHost,
                engineTick: tick,
                latestFingerprintTick: latestFp?.tick ?? null,
                latestFingerprintHex: latestFp?.fp ?? null,
                fingerprintTailPaused: latestFp?.paused ?? null,
            },
        });
        await this.writeSerializedLocalStateToLobbyAndMaybeSnapshot({
            forceLobbyPost: true,
            immediateLobbyLog: false,
            includeTickHistory: false,
        });
    }

    /**
     * @param forceLobbyPost When true, POST the serialized-state line even if the user's lobby-log
     *        "debug" threshold is `off` (used for automated desync traces).
     * @param immediateLobbyLog When true (Debug Console «Log local state» only), bypass the lobby log
     *        batch queue for this line.
     * @param includeTickHistory When true («Log local state» only), also POST the in-memory
     *        recent-tick ring (same shape as console «log every tick»).
     */
    private async writeSerializedLocalStateToLobbyAndMaybeSnapshot(options: {
        forceLobbyPost: boolean;
        immediateLobbyLog: boolean;
        includeTickHistory: boolean;
    }): Promise<void> {
        const state = this.config.session.getSerializedSnapshot();
        const tick = state.gameTick;
        const checkpointFp = this.config.session.getRuntimeFingerprintHex();
        const checkpointPayload =
            typeof checkpointFp === 'string' && checkpointFp !== ''
                ? {
                      checkpointFingerprint: checkpointFp,
                      checkpointFingerprintPaused: this.config.session.getFingerprintTailPaused(),
                  }
                : {};

        const logArgs = {
            lobbyClient: this.config.api as unknown as LobbyClient,
            lobbyId: this.config.lobbyId,
            playerId: this.config.playerId,
            tick,
            severity: 'critical' as const,
            logType: 'debug' as const,
            gameId: this.config.gameId,
            gamePhase: 'battle' as const,
            message: 'debug: local serialized game state',
            context: {
                isHost: this.config.isHost,
                serializedGameState: state,
            },
        };
        if (options.forceLobbyPost) {
            logToLobbyLogForced({
                ...logArgs,
                manualLobbyLogPost: options.immediateLobbyLog,
            });
        } else {
            logToLobbyLog({
                ...logArgs,
                manualLobbyLogPost: options.immediateLobbyLog,
            });
        }

        if (options.includeTickHistory) {
            const ticks = tickStateHistory.getHistory();
            const historyArgs = {
                lobbyClient: this.config.api as unknown as LobbyClient,
                lobbyId: this.config.lobbyId,
                playerId: this.config.playerId,
                tick,
                severity: 'critical' as const,
                logType: 'debug' as const,
                gameId: this.config.gameId,
                gamePhase: 'battle' as const,
                message: 'debug: recent tick history',
                context: {
                    isHost: this.config.isHost,
                    capacity: TICK_STATE_HISTORY_CAPACITY,
                    count: ticks.length,
                    ticks,
                },
                manualLobbyLogPost: options.immediateLobbyLog,
            };
            if (options.forceLobbyPost) {
                logToLobbyLogForced(historyArgs);
            } else {
                logToLobbyLog(historyArgs);
            }
        }

        if (!this.config.isHost) {
            return;
        }

        await this.config.api.saveBattleSnapshot(this.config.lobbyId, this.config.gameId, {
            playerId: this.config.playerId,
            tick,
            state,
            ...checkpointPayload,
        });
        // Note: `lastSnapshotTick` is updated regardless of post-call engine advance because the
        // legacy implementation matched `saveSnapshotOnPause` semantics — see the comment there.
        this.lastSnapshotTick = tick;
    }
}

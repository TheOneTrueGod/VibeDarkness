import type { LobbyClient } from '../../../../LobbyClient';
import { logToLobbyLog } from '../../../../lobbyLog';
import { sleep } from './helpers/heartbeatTiming';
import type { BattleApi, BattleSessionHandle } from './types';
import type { SerializedGameState } from '../types';

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
     * `lobby_log.jsonl` at **critical** severity, then (host only) POSTs the same payload through
     * `saveBattleSnapshot` — not React/debug-buffered lobby state.
     */
    async debugLogLocalStateAndSubmitSnapshot(): Promise<void> {
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

        logToLobbyLog({
            lobbyClient: this.config.api as unknown as LobbyClient,
            lobbyId: this.config.lobbyId,
            playerId: this.config.playerId,
            tick,
            severity: 'critical',
            logType: 'debug',
            gameId: this.config.gameId,
            gamePhase: 'battle',
            message: 'debug: local serialized game state',
            context: {
                isHost: this.config.isHost,
                serializedGameState: state,
            },
        });

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

import type { LobbyClient } from '../../../../LobbyClient';
import type { BattleOrder, SerializedGameState, WaitingForOrders } from '../types';

export interface BattleSessionHandle {
    getEngineTick(): number;
    /** Incremental sim hash at the current engine state (matches tick-complete flush / {@link GameEngine.getRuntimeFingerprintHex}). */
    getRuntimeFingerprintHex(): string;
    /** Same `paused` predicate as tick-complete fingerprint rows ({@link GameEngine.getFingerprintTailPaused}). */
    getFingerprintTailPaused(): boolean;
    getLatestFingerprint(): { tick: number; fp: string; paused: boolean } | null;
    getFingerprintRange(from: number, to: number): Array<{ tick: number; fp: string; paused: boolean }>;
    getInitialFingerprint(): string;
    getSerializedSnapshot(): SerializedGameState;
    getSerializedInitialState(): SerializedGameState;
    /** Tick-0 baseline for one-time `initial_state.json`; null when restored from checkpoint-only (no in-memory tick 0 blob). */
    getPayloadForPersistedInitialStateOrNull(): {
        state: SerializedGameState;
        initialFingerprint: string;
    } | null;
    startEngine(): void;
    loadFromSnapshot(
        state: SerializedGameState,
        opts?: { checkpointRuntimeFingerprintHex?: string | null },
    ): void;
    applyRemoteOrders(
        orders: Array<{ gameTick?: number; atTick?: number; order: BattleOrder | Record<string, unknown> }>,
    ): void;
    /**
     * True while the engine holds a parallel player order batch (`GameEngine.waitingForOrders`).
     * Distinct from BattleNet HTTP deferral (`deferredLocalOrders`).
     */
    isPausedForOrderSync(): boolean;
    /** Snapshot of {@link GameEngine.waitingForOrders}; null while the sim is not in that pause. */
    getWaitingForOrdersBatch(): WaitingForOrders | null;
    /** True while debug pause freezes the deterministic sim (`debugPauseMode`). */
    isDebugSimulationFrozen(): boolean;
    /** True while the battle engine loop is running (`GameEngine.start` … `stop`). */
    isEngineSimulationRunning(): boolean;
    /**
     * Non-host: optional gate on fixed-step simulation relative to heartbeat tail.
     * {@link BattleNet} normally keeps this cleared so optimistic playahead runs until a natural pause.
     */
    setMultiplayerAwaitHostCatchup(blocked: boolean): void;
}

export type BattleNetSyncTerminalStatus =
    | 'synced'
    /** Non-host: local sim is past heartbeat `hostTick` but not yet at a parallel-order pause (benign optimistic playahead). */
    | 'optimistic_client_playahead'
    | 'waiting_for_host'
    | 'resyncing'
    | 'failed'
    | 'synced_pending_ack';

export type BattleNetEventMap = {
    'sync-status': BattleNetSyncTerminalStatus;
    /** Optional human-readable sync detail shown in Battle UI while recovering. */
    'sync-details': string | null;
    /** Non-host: stuck waiting for host to advance past anchor tick (wall-clock gated UX + resync). */
    'host-anchor-wait': { phase: 'idle' | 'waiting_ui' | 'forcing_resync'; elapsedMs: number };
    /** Non-host: cannot submit parallel orders until host pause plane aligns (pause-ahead desync prevention). */
    'blocking-host-pause-plane': { blocking: boolean };
    /** Non-host: local simulation is behind the server's completed tick. */
    'falling-behind': { active: boolean; ticksBehind: number };
    heartbeat: {
        hostTick: number;
        hostFingerprint: string | null;
        hostPaused: boolean;
        ordersTipTick: number;
        ordersRecordCount: number | null;
        orderBatchAtTick: number | null;
        pausedAtTick: number | null;
        expectingFromPlayerIds: string[] | null;
        initialFingerprint: string | null;
        heartbeatSeq: number;
        pendingOrders?: Array<Record<string, unknown>>;
        appliedOrdersAtTick?: { atTick: number | null; orders: Array<Record<string, unknown>> };
        latestServerGameTick?: number | null;
        latestServerGameHash?: string | null;
        gameTick?: number | null;
        gameHash?: string | null;
        /** Max tick in `fingerprints.jsonl` (unclamped); optional until server ships tail fields. */
        fingerprintTailTick: number | null;
        fingerprintTailFingerprint: string | null;
    };
    'orders-applied': { count: number; source: 'poll' | 'submit' };
    'host-catchup-wait': {
        /** Deferred queue non-empty — block further local submits until flushed. */
        blocking: boolean;
        /** Heartbeat polls spent waiting while paused with a deferred POST. */
        stuckHeartbeats: number;
        hostTick: number;
        targetTick: number | null;
        queuedCount: number;
    };
    /** Non-host: polls while paused for orders and `waiting_for_host` (battle UI gating + stall resync). */
    'waiting-for-host-poll-streak': { streak: number };
};

export type BattleNetListener<K extends keyof BattleNetEventMap> = (payload: BattleNetEventMap[K]) => void;
export type BattleNetUnsub = () => void;

export interface BattleApi {
    appendBattleOrder(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; atTick: number; order: BattleOrder; idHash?: string },
    ): Promise<{
        accepted: boolean;
        idHash: string;
        rejectedReason?: string;
        maxAllowedTick?: number;
        minAllowedTick?: number;
        hostTick?: number;
        hostFingerprint?: string | null;
    }>;
    getBattleOrdersRange(
        lobbyId: string,
        gameId: string,
        params: { playerId: string; sinceTick?: number; untilTick?: number },
    ): Promise<{ orders: Array<{ atTick: number; playerId: string; order: BattleOrder; idHash: string }> }>;
    getBattleSnapshot(
        lobbyId: string,
        gameId: string,
        params: { playerId: string; atTick?: number },
    ): Promise<{ tick: number; state: SerializedGameState; synchash: string | null } | null>;
    getBattleHeartbeat(
        lobbyId: string,
        gameId: string,
        playerId: string,
        opts?: { gameTick?: number },
    ): Promise<{
        hostTick: number | null;
        hostFingerprint: string | null;
        latestServerGameTick?: number | null;
        latestServerGameHash?: string | null;
        gameTick?: number | null;
        gameHash?: string | null;
        pendingOrders?: Array<Record<string, unknown>>;
        appliedOrdersAtTick?: { atTick: number | null; orders: Array<Record<string, unknown>> };
        ordersTipTick: number | null;
        ordersRecordCount?: number | null;
        /** Parallel order batch tick when paused; legacy alias for some payloads: {@link pausedAtTick}. */
        orderBatchAtTick?: number | null;
        pausedAtTick: number | null;
        expectingFromPlayerIds: string[] | null;
        initialFingerprint: string | null;
        heartbeatSeq?: number | null;
        hostPaused?: boolean | null;
        fingerprintTailTick?: number | null;
        fingerprintTailFingerprint?: string | null;
    }>;
    mergeBattleAppliedOrders(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; batchAtTick: number },
    ): Promise<{ success: boolean; merged: number }>;
    saveBattleInitialState(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; state: SerializedGameState; initialFingerprint: string },
    ): Promise<void>;
    getBattleInitialState(
        lobbyId: string,
        gameId: string,
        playerId: string,
    ): Promise<{ state: SerializedGameState; initialFingerprint: string } | null>;
    saveBattleSnapshot(
        lobbyId: string,
        gameId: string,
        body: {
            playerId: string;
            tick: number;
            state: SerializedGameState;
            checkpointFingerprint?: string;
            /** Paired with `checkpointFingerprint` for the co-appended `fingerprints.jsonl` row. */
            checkpointFingerprintPaused?: boolean;
        },
    ): Promise<void>;
    appendBattleFingerprints(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; records: Array<{ tick: number; fp: string; paused: boolean }> },
    ): Promise<{ appended: number }>;
    getBattleFingerprintsRange(
        lobbyId: string,
        gameId: string,
        params: { playerId: string; fromTick: number; toTick: number },
    ): Promise<{ records: Array<{ tick: number; fp: string; paused: boolean }> }>;
}

export interface BattleNetArgs {
    api: LobbyClient;
    session: BattleSessionHandle;
    isHost: boolean;
    lobbyId: string;
    gameId: string;
    playerId: string;
}

export type BattleNetPollOnceOptions = {
    /**
     * When true (default false), bypass debug-freeze suppression for heartbeat HTTP and the
     * minimum spacing between heartbeat GETs (diagnostics only).
     */
    forceHttp?: boolean;
    /** Who invoked `BattleNet.pollOnce` (poll loop timer vs `visibilitychange`). */
    pollSource?: 'timer' | 'visibility';
};

export type BattleHeartbeatApiResult = Awaited<ReturnType<BattleApi['getBattleHeartbeat']>>;

/** Non-host: fields derived from heartbeat that define the server "pause plane" for transition detection. */
export type NonHostHbPausePlaneSnap = {
    hostPaused: boolean;
    hostTick: number;
    hostFingerprint: string | null;
    orderBatchAtTick: number | null;
    expectingFromPlayerIds: string[] | null;
};

export type BattleNetFactoryArgs = Omit<BattleNetArgs, 'isHost'>;

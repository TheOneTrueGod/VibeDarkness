import { traceBattleHeartbeatLine } from '../../../../battleHeartbeatTrace';
import { battleHeartbeatMinSpacingMs, sleep } from './helpers/heartbeatTiming';
import type { BattleApi, BattleHeartbeatApiResult } from './types';

export interface HeartbeatHttpConfig {
    api: BattleApi;
    lobbyId: string;
    gameId: string;
    playerId: string;
    heartbeatTraceInstanceId: number;
}

/**
 * Serializes heartbeat GETs and enforces the minimum spacing between them across all callers
 * (poll loop, recovery, alignment helpers).
 */
export class HeartbeatHttp {
    /** Wall time of the last battle heartbeat HTTP request start (after min-spacing wait). */
    private lastBattleHeartbeatHttpStartedAtMs = 0;
    /** Serializes heartbeat GETs so poll + recovery cannot interleave sub-spacing requests. */
    private battleHeartbeatHttpChain: Promise<unknown> = Promise.resolve();

    constructor(private readonly config: HeartbeatHttpConfig) {}

    getBattleHeartbeatThrottled(opts?: {
        gameTick?: number;
        includePastApplied?: boolean;
        bypassThrottle?: boolean;
        tracePhase?: string;
    }): Promise<BattleHeartbeatApiResult> {
        const { api, lobbyId, gameId, playerId, heartbeatTraceInstanceId } = this.config;
        const tracePhase = opts?.tracePhase ?? 'unspecified';
        const pending = this.battleHeartbeatHttpChain.then(async (): Promise<BattleHeartbeatApiResult> => {
            if (!opts?.bypassThrottle) {
                const gap = battleHeartbeatMinSpacingMs();
                if (gap > 0) {
                    const now = Date.now();
                    if (this.lastBattleHeartbeatHttpStartedAtMs > 0) {
                        const elapsed = now - this.lastBattleHeartbeatHttpStartedAtMs;
                        if (elapsed < gap) {
                            const throttleSleepMs = gap - elapsed;
                            traceBattleHeartbeatLine('heartbeat throttle wait', {
                                traceInstanceId: heartbeatTraceInstanceId,
                                lobbyId,
                                playerId,
                                tracePhase,
                                throttleSleepMs,
                                minGapMs: gap,
                                elapsedSinceLastStartMs: elapsed,
                            });
                            await sleep(throttleSleepMs);
                        }
                    }
                    this.lastBattleHeartbeatHttpStartedAtMs = Date.now();
                }
            } else {
                traceBattleHeartbeatLine('heartbeat throttle bypassed', {
                    traceInstanceId: heartbeatTraceInstanceId,
                    lobbyId,
                    playerId,
                    tracePhase,
                });
            }
            traceBattleHeartbeatLine('heartbeat http start', {
                traceInstanceId: heartbeatTraceInstanceId,
                lobbyId,
                playerId,
                tracePhase,
                gameTick: opts?.gameTick ?? null,
                includePastApplied: opts?.includePastApplied === true,
                bypassThrottle: opts?.bypassThrottle === true,
            });
            return api.getBattleHeartbeat(lobbyId, gameId, playerId, {
                gameTick: opts?.gameTick,
                includePastApplied: opts?.includePastApplied,
            });
        });
        this.battleHeartbeatHttpChain = pending.then(
            () => undefined,
            () => undefined,
        );
        return pending;
    }
}

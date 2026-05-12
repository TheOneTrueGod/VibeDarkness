import { debugLog } from './debugLog';

export type BattleHeartbeatTracePayload = Record<string, unknown>;

function traceForcedByEnv(): boolean {
    return (
        import.meta.env.VITE_BATTLE_HEARTBEAT_TRACE === 'true' ||
        import.meta.env.VITE_BATTLE_HEARTBEAT_TRACE === '1'
    );
}

/**
 * Opt-in tracing for GET …/heartbeat scheduling, poll-loop timing, and throttle gaps.
 *
 * Enable either:
 * - Debug Console → **Debug logging** → **Battle heartbeat** → threshold **Log** (or lower), or
 * - `.env`: `VITE_BATTLE_HEARTBEAT_TRACE=1` then restart Vite (prints with `console.info` even if debug type is off).
 */
export function traceBattleHeartbeatLine(event: string, payload: BattleHeartbeatTracePayload): void {
    if (traceForcedByEnv()) {
        console.info('[battle heartbeat trace]', event, payload);
        return;
    }
    debugLog('battle heartbeat', 'log', event, payload);
}

/** True when env forces console tracing (for cheap guards at call sites). */
export function isBattleHeartbeatTraceEnvOn(): boolean {
    return traceForcedByEnv();
}

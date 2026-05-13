import { HEARTBEAT_POLL_INTERVAL_MS } from '../../../../../../../global_constants.js';

export function battleHeartbeatMinSpacingMs(): number {
    return import.meta.env.MODE === 'test' ? 0 : HEARTBEAT_POLL_INTERVAL_MS;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

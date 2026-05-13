import { BATTLE_RESYNC_AUTO_RESUME_AFTER_DESYNC } from '../../../../../../global_constants.js';
import type { BattleEventBus } from './BattleEventBus';
import type { BattleNetSyncTerminalStatus } from './types';

/**
 * Owns the BattleNet sync UI state machine: terminal status, human-readable details,
 * and the post-recovery "Continue" gate.
 */
export class SyncStatusController {
    private currentStatus: BattleNetSyncTerminalStatus = 'waiting_for_host';
    private currentDetails: string | null = null;
    /** Recovery succeeded but UX gate (`BATTLE_RESYNC_AUTO_RESUME_AFTER_DESYNC=false`) awaits Continue. */
    private awaitingUserAck = false;

    constructor(private readonly events: BattleEventBus) {}

    getStatus(): BattleNetSyncTerminalStatus {
        return this.currentStatus;
    }

    getDetails(): string | null {
        return this.currentDetails;
    }

    isAwaitingUserAck(): boolean {
        return this.awaitingUserAck;
    }

    setDetails(message: string | null): void {
        this.currentDetails = message;
        this.events.emit('sync-details', message);
    }

    setStatus(status: BattleNetSyncTerminalStatus, details: string | null = null): void {
        // After desync recovery we require explicit Continue (`synced_pending_ack`). Heartbeat
        // fingerprint reconcile must not emit `synced` / `waiting_for_host` over that gate — it
        // used to leave `awaitingUserAck` true while the UI showed `synced` (no banner).
        if (
            this.awaitingUserAck &&
            status !== 'synced_pending_ack' &&
            status !== 'resyncing' &&
            status !== 'failed'
        ) {
            return;
        }

        this.awaitingUserAck = status === 'synced_pending_ack';
        this.currentStatus = status;
        this.events.emit('sync-status', status);
        this.setDetails(details);
    }

    /** Clears the post-recovery "Continue" UX gate. */
    acknowledgeRecoveryContinue(): void {
        if (!this.awaitingUserAck) {
            return;
        }
        // Clear gate before setStatus so heartbeat's `synced` guard does not no-op the transition.
        this.awaitingUserAck = false;
        this.setStatus('synced', null);
    }

    finalizeRecoveryOutcome(synced: boolean, reason: string): void {
        if (!synced) {
            this.setStatus('failed');
            return;
        }
        if (BATTLE_RESYNC_AUTO_RESUME_AFTER_DESYNC || reason === 'initial-state-mismatch') {
            this.setStatus('synced');
            return;
        }
        this.setStatus(
            'synced_pending_ack',
            `Battle state was resynced. Press Continue when you are ready to resume. (${reason})`,
        );
    }

    summarizeOrderRejectReason(reason: string | undefined): string {
        if (reason == null || reason === '') {
            return '';
        }
        switch (reason) {
            case 'tick_in_past':
                return ': order tick already passed on the server';
            case 'tick_ahead_of_host':
                return ': order tick was ahead of host';
            case 'not_unit_owner':
                return ': you do not control this unit';
            case 'unknown_unit':
                return ': unit not found for this battle snapshot';
            default:
                return `: ${reason}`;
        }
    }

    emitRejectedOrderSyncDetail(rejectedReason?: string): void {
        const tail = this.summarizeOrderRejectReason(rejectedReason);
        const msg = `Desynced: orders rejected by server${tail}. Recovering…`;
        this.currentDetails = msg;
        this.events.emit('sync-details', msg);
    }

    /** Non-host deferred submit: local tick ahead of heartbeat `hostTick`. */
    presentWaitingForHostLocalAheadOfHeartbeat(): void {
        this.setStatus(
            'waiting_for_host',
            "Local sim is ahead of the host's last completed tick; this order will apply when the host catches up.",
        );
    }

    /** Order queued until host tick catches up (optimistic playahead / tick_ahead_of_host deferral). */
    presentWaitingForHostOptimisticQueued(): void {
        this.setStatus(
            'waiting_for_host',
            'Waiting for host (optimistic playahead). Your order is queued until the host tick catches up.',
        );
    }
}

import { describe, it, expect, vi } from 'vitest';
import { BattleEventBus } from './BattleEventBus';
import { SyncStatusController } from './SyncStatusController';

function make(): { ctrl: SyncStatusController; events: BattleEventBus } {
    const events = new BattleEventBus();
    return { ctrl: new SyncStatusController(events), events };
}

describe('SyncStatusController', () => {
    it('starts in waiting_for_host with null details and not awaiting ack', () => {
        const { ctrl } = make();
        expect(ctrl.getStatus()).toBe('waiting_for_host');
        expect(ctrl.getDetails()).toBeNull();
        expect(ctrl.isAwaitingUserAck()).toBe(false);
    });

    it('setStatus emits sync-status and forwards details via sync-details', () => {
        const { ctrl, events } = make();
        const statusListener = vi.fn();
        const detailsListener = vi.fn();
        events.on('sync-status', statusListener);
        events.on('sync-details', detailsListener);
        ctrl.setStatus('synced', 'all good');
        expect(statusListener).toHaveBeenCalledWith('synced');
        expect(detailsListener).toHaveBeenCalledWith('all good');
        expect(ctrl.getStatus()).toBe('synced');
        expect(ctrl.getDetails()).toBe('all good');
    });

    it('setStatus to synced_pending_ack sets awaiting-user-ack', () => {
        const { ctrl } = make();
        ctrl.setStatus('synced_pending_ack', 'press continue');
        expect(ctrl.isAwaitingUserAck()).toBe(true);
    });

    it('setStatus ignores non-terminal status changes while awaiting user ack', () => {
        const { ctrl, events } = make();
        ctrl.setStatus('synced_pending_ack', 'press continue');
        const statusListener = vi.fn();
        events.on('sync-status', statusListener);
        ctrl.setStatus('synced', 'auto-clear');
        expect(statusListener).not.toHaveBeenCalled();
        expect(ctrl.getStatus()).toBe('synced_pending_ack');
        expect(ctrl.isAwaitingUserAck()).toBe(true);
    });

    it('setStatus allows resyncing and failed transitions even while awaiting user ack', () => {
        const { ctrl } = make();
        ctrl.setStatus('synced_pending_ack', 'press continue');
        ctrl.setStatus('resyncing');
        expect(ctrl.getStatus()).toBe('resyncing');
        expect(ctrl.isAwaitingUserAck()).toBe(false);
    });

    it('acknowledgeRecoveryContinue clears the ack gate and transitions to synced', () => {
        const { ctrl, events } = make();
        ctrl.setStatus('synced_pending_ack', 'press continue');
        const statusListener = vi.fn();
        events.on('sync-status', statusListener);
        ctrl.acknowledgeRecoveryContinue();
        expect(statusListener).toHaveBeenCalledWith('synced');
        expect(ctrl.getStatus()).toBe('synced');
        expect(ctrl.isAwaitingUserAck()).toBe(false);
    });

    it('acknowledgeRecoveryContinue is a no-op when not awaiting ack', () => {
        const { ctrl, events } = make();
        const statusListener = vi.fn();
        events.on('sync-status', statusListener);
        ctrl.acknowledgeRecoveryContinue();
        expect(statusListener).not.toHaveBeenCalled();
    });

    it('finalizeRecoveryOutcome(false) emits failed', () => {
        const { ctrl } = make();
        ctrl.finalizeRecoveryOutcome(false, 'whatever');
        expect(ctrl.getStatus()).toBe('failed');
    });

    it('finalizeRecoveryOutcome with reason=initial-state-mismatch auto-clears to synced', () => {
        const { ctrl } = make();
        ctrl.finalizeRecoveryOutcome(true, 'initial-state-mismatch');
        expect(ctrl.getStatus()).toBe('synced');
        expect(ctrl.isAwaitingUserAck()).toBe(false);
    });

    it('summarizeOrderRejectReason returns empty string for falsy/empty reasons', () => {
        const { ctrl } = make();
        expect(ctrl.summarizeOrderRejectReason(undefined)).toBe('');
        expect(ctrl.summarizeOrderRejectReason('')).toBe('');
    });

    it('summarizeOrderRejectReason maps known reasons to human-readable suffixes', () => {
        const { ctrl } = make();
        expect(ctrl.summarizeOrderRejectReason('tick_in_past')).toContain('already passed');
        expect(ctrl.summarizeOrderRejectReason('tick_ahead_of_host')).toContain('ahead of host');
        expect(ctrl.summarizeOrderRejectReason('not_unit_owner')).toContain('do not control');
        expect(ctrl.summarizeOrderRejectReason('unknown_unit')).toContain('not found');
    });

    it('summarizeOrderRejectReason falls back to passthrough for unknown reasons', () => {
        const { ctrl } = make();
        expect(ctrl.summarizeOrderRejectReason('mystery_failure')).toBe(': mystery_failure');
    });

    it('emitRejectedOrderSyncDetail updates details and emits sync-details', () => {
        const { ctrl, events } = make();
        const detailsListener = vi.fn();
        events.on('sync-details', detailsListener);
        ctrl.emitRejectedOrderSyncDetail('tick_in_past');
        expect(detailsListener).toHaveBeenCalledTimes(1);
        const msg = detailsListener.mock.calls[0][0] as string;
        expect(msg).toContain('Desynced: orders rejected');
        expect(msg).toContain('already passed');
        expect(ctrl.getDetails()).toBe(msg);
    });
});

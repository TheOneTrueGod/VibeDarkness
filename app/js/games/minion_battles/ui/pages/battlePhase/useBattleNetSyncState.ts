import { useCallback, useEffect, useRef, useState } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import type { BattleNet, BattleNetSyncTerminalStatus } from '../../../game/battlenet';

export interface BattleNetSyncWireResult {
    unsubscribe: () => void;
    bumpOrderPipeline: () => void;
}

interface UseBattleNetSyncStateParams {
    isHost: boolean;
    onBattleNetResyncingChange?: (resyncing: boolean) => void;
}

/** ~14 BattleNet sync-status states + render-stable `wireNetEvents` for mount-once lifecycle. */
export function useBattleNetSyncState({ isHost, onBattleNetResyncingChange }: UseBattleNetSyncStateParams) {
    const initialHeartbeatCheckedRef = useRef(false);

    const [netSyncStatus, setNetSyncStatus] = useState<BattleNetSyncTerminalStatus>('waiting_for_host');
    const [netSyncDetails, setNetSyncDetails] = useState<string | null>(null);
    const [resyncInformAck, setResyncInformAck] = useState<{ reason: string; token: number } | null>(null);
    const [waitingForHostCatchup, setWaitingForHostCatchup] = useState(false);
    const [hostCatchupHostTick, setHostCatchupHostTick] = useState(0);
    const [hostCatchupTargetTick, setHostCatchupTargetTick] = useState<number | null>(null);
    const [hostCatchupStuckHeartbeats, setHostCatchupStuckHeartbeats] = useState(0);
    const [fallingBehindHost, setFallingBehindHost] = useState(false);
    const [ticksBehindHost, setTicksBehindHost] = useState(0);
    const [hostAnchorWaitPhase, setHostAnchorWaitPhase] = useState<'idle' | 'waiting_ui' | 'forcing_resync'>('idle');
    const [hostAnchorWaitElapsedMs, setHostAnchorWaitElapsedMs] = useState(0);
    const [waitingForHostPollStreak, setWaitingForHostPollStreak] = useState(0);
    const [blockingHostPausePlane, setBlockingHostPausePlane] = useState(false);
    const [orderPipeline, setOrderPipeline] = useState<{ queued: number; sending: number }>({
        queued: 0,
        sending: 0,
    });
    const [hasReceivedInitialHeartbeat, setHasReceivedInitialHeartbeat] = useState(isHost);

    const dismissResyncInformAck = useCallback(() => setResyncInformAck(null), []);

    useEffect(() => {
        onBattleNetResyncingChange?.(netSyncStatus === 'resyncing');
        return () => {
            onBattleNetResyncingChange?.(false);
        };
    }, [netSyncStatus, onBattleNetResyncingChange]);

    const wireNetEvents = useCallback((net: BattleNet, session: BattleSession): BattleNetSyncWireResult => {
        const bumpOrderPipeline = () => setOrderPipeline(net.getOrderSyncSummary());
        const unsubs: Array<() => void> = [];
        unsubs.push(
            net.on('sync-status', (status) => {
                setNetSyncStatus(status);
                if (status === 'resyncing') {
                    setResyncInformAck(null);
                }
                bumpOrderPipeline();
            }),
        );
        unsubs.push(
            net.on('sync-details', (details) => {
                setNetSyncDetails(details);
            }),
        );
        unsubs.push(
            net.on('post-resync-inform', (payload) => {
                setResyncInformAck({ reason: payload.reason, token: Date.now() });
            }),
        );
        unsubs.push(
            net.on('host-catchup-wait', (payload) => {
                setWaitingForHostCatchup(payload.blocking);
                setHostCatchupHostTick(payload.hostTick);
                setHostCatchupTargetTick(payload.targetTick);
                setHostCatchupStuckHeartbeats(payload.stuckHeartbeats);
                bumpOrderPipeline();
            }),
        );
        unsubs.push(
            net.on('waiting-for-host-poll-streak', (payload) => {
                setWaitingForHostPollStreak(payload.streak);
            }),
        );
        unsubs.push(
            net.on('falling-behind', (payload) => {
                setFallingBehindHost(payload.active);
                setTicksBehindHost(payload.ticksBehind);
            }),
        );
        unsubs.push(
            net.on('host-anchor-wait', (payload) => {
                setHostAnchorWaitPhase((prev) => (prev === payload.phase ? prev : payload.phase));
                setHostAnchorWaitElapsedMs(payload.elapsedMs);
            }),
        );
        unsubs.push(
            net.on('blocking-host-pause-plane', (payload) => {
                setBlockingHostPausePlane((prev) => (prev === payload.blocking ? prev : payload.blocking));
            }),
        );
        unsubs.push(net.on('heartbeat', bumpOrderPipeline));
        unsubs.push(
            net.on('heartbeat', () => {
                setHasReceivedInitialHeartbeat(true);
            }),
        );
        unsubs.push(net.on('orders-applied', bumpOrderPipeline));
        if (!isHost) {
            unsubs.push(
                net.on('heartbeat', (heartbeat) => {
                    if (initialHeartbeatCheckedRef.current) return;
                    if (heartbeat.initialFingerprint == null) return;
                    initialHeartbeatCheckedRef.current = true;
                    void session.compareInitialFingerprintWithHeartbeat(heartbeat.initialFingerprint);
                }),
            );
        }

        return {
            unsubscribe: () => {
                for (const unsubNet of unsubs) {
                    unsubNet();
                }
            },
            bumpOrderPipeline,
        };
    }, [isHost]);

    return {
        netSyncStatus,
        setNetSyncStatus,
        netSyncDetails,
        resyncInformAck,
        dismissResyncInformAck,
        waitingForHostCatchup,
        hostCatchupHostTick,
        hostCatchupTargetTick,
        hostCatchupStuckHeartbeats,
        fallingBehindHost,
        ticksBehindHost,
        hostAnchorWaitPhase,
        hostAnchorWaitElapsedMs,
        waitingForHostPollStreak,
        blockingHostPausePlane,
        orderPipeline,
        hasReceivedInitialHeartbeat,
        wireNetEvents,
    };
}

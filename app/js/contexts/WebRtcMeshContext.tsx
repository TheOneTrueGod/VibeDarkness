import React, {
    createContext,
    forwardRef,
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import { WebRtcLobbyMesh, WebRtcPingTestFn } from '../WebRtcLobbyMesh';
import type { LobbyState, PlayerState } from '../types';
import {
    GHOST_PLAN_UPDATE_EVENT,
    PeerStateStore,
    type ReceivedPeerState,
} from './PeerStateStore';

export interface WebRtcMeshContextValue {
    ready: boolean;
    peerConnected: Record<string, boolean>;
    peerStatesByType: Record<string, Record<string, ReceivedPeerState>>;
    broadcastPeerState: (eventType: string, payload: unknown, tick: number | null) => void;
    sendTransientEvent: (event: Record<string, unknown>) => void;
    /**
     * Listen for one peer event type. Subscribed types are delivered to listeners only (never stored
     * in {@link PeerStateStore} or resent on reconnect), so use this for fire-and-forget signals.
     */
    subscribePeerEvent: (eventType: string, listener: PeerEventListener) => () => void;
}

export type PeerEventListener = (fromPlayerId: string, event: Record<string, unknown>) => void;

export interface WebRtcMeshHandle {
    handleSignal: (fromPlayerId: string, signal: Record<string, unknown>) => void;
    sendTransientEvent: (event: Record<string, unknown>) => void;
}

const WebRtcMeshContext = createContext<WebRtcMeshContextValue | null>(null);

export function useWebRtcMesh(): WebRtcMeshContextValue {
    const ctx = useContext(WebRtcMeshContext);
    if (!ctx) {
        throw new Error('useWebRtcMesh must be used within WebRtcMeshProvider');
    }
    return ctx;
}

export function useWebRtcMeshOptional(): WebRtcMeshContextValue | null {
    return useContext(WebRtcMeshContext);
}

interface WebRtcMeshProviderProps {
    enabled: boolean;
    lobby: LobbyState | null;
    player: PlayerState | null;
    sendSignal: (toPlayerId: string, signal: Record<string, unknown>) => void;
    peerIds: string[];
    onTransientEvent?: (fromPlayerId: string, event: Record<string, unknown>) => void;
    children: React.ReactNode;
}

function buildPeerStatesSnapshot(store: PeerStateStore): Record<string, Record<string, ReceivedPeerState>> {
    return {
        [GHOST_PLAN_UPDATE_EVENT]: store.getPeerStates(GHOST_PLAN_UPDATE_EVENT),
    };
}

export const WebRtcMeshProvider = forwardRef<WebRtcMeshHandle, WebRtcMeshProviderProps>(function WebRtcMeshProvider(
    { enabled, lobby, player, sendSignal, peerIds, onTransientEvent, children },
    ref,
) {
    const meshRef = useRef<WebRtcLobbyMesh | null>(null);
    const storeRef = useRef(new PeerStateStore());
    const peerIdsRef = useRef(peerIds);
    peerIdsRef.current = peerIds;
    const onTransientEventRef = useRef(onTransientEvent);
    onTransientEventRef.current = onTransientEvent;
    const peerEventListenersRef = useRef(new Map<string, Set<PeerEventListener>>());

    const [ready, setReady] = useState(false);
    const [peerConnected, setPeerConnected] = useState<Record<string, boolean>>({});
    const [peerStatesByType, setPeerStatesByType] = useState<Record<string, Record<string, ReceivedPeerState>>>(() =>
        buildPeerStatesSnapshot(storeRef.current),
    );

    const syncPeerStates = useCallback(() => {
        setPeerStatesByType(buildPeerStatesSnapshot(storeRef.current));
    }, []);

    const sendTransientEvent = useCallback((event: Record<string, unknown>) => {
        meshRef.current?.sendEventToAll(event);
    }, []);

    const broadcastPeerState = useCallback(
        (eventType: string, payload: unknown, tick: number | null) => {
            storeRef.current.recordOutbound(eventType, payload, tick);
            if (eventType === GHOST_PLAN_UPDATE_EVENT) {
                meshRef.current?.sendEventToAll({
                    type: GHOST_PLAN_UPDATE_EVENT,
                    plan: payload as Record<string, unknown> | null,
                    tick,
                });
            } else {
                meshRef.current?.sendEventToAll({ type: eventType, payload, tick });
            }
        },
        [],
    );

    const subscribePeerEvent = useCallback((eventType: string, listener: PeerEventListener) => {
        const listeners = peerEventListenersRef.current;
        let set = listeners.get(eventType);
        if (!set) {
            set = new Set();
            listeners.set(eventType, set);
        }
        set.add(listener);
        return () => {
            set.delete(listener);
            if (set.size === 0) listeners.delete(eventType);
        };
    }, []);

    const handleSignal = useCallback((fromPlayerId: string, signal: Record<string, unknown>) => {
        void meshRef.current?.handleSignal(fromPlayerId, signal);
    }, []);

    useImperativeHandle(
        ref,
        () => ({
            handleSignal,
            sendTransientEvent,
        }),
        [handleSignal, sendTransientEvent],
    );

    // Initialize or dispose WebRTC mesh when lobby / player changes
    useEffect(() => {
        if (!enabled || !lobby || !player) {
            meshRef.current?.dispose();
            meshRef.current = null;
            setReady(false);
            setPeerConnected({});
            return;
        }

        setPeerConnected({});
        const store = storeRef.current;
        const mesh = new WebRtcLobbyMesh({
            localPlayerId: player.id,
            sendSignal,
            onPeerEvent: (fromPlayerId, event) => {
                const eventType = event.type as string | undefined;
                const subscribed = eventType ? peerEventListenersRef.current.get(eventType) : undefined;
                if (subscribed) {
                    for (const listener of [...subscribed]) {
                        listener(fromPlayerId, event);
                    }
                } else if (event.transient === true) {
                    // Fire-and-forget signal nobody here is listening for; never store it.
                } else if (eventType === 'ping') {
                    onTransientEventRef.current?.(fromPlayerId, event);
                } else if (eventType === GHOST_PLAN_UPDATE_EVENT) {
                    const plan = event.plan ?? null;
                    const tick = typeof event.tick === 'number' ? event.tick : null;
                    store.recordInbound(GHOST_PLAN_UPDATE_EVENT, fromPlayerId, plan, tick, Date.now());
                    syncPeerStates();
                } else if (eventType) {
                    const tick = typeof event.tick === 'number' ? event.tick : null;
                    store.recordInbound(eventType, fromPlayerId, event.payload ?? event, tick, Date.now());
                    syncPeerStates();
                }
            },
            onPeerConnected: (id) => {
                setPeerConnected((prev) => ({ ...prev, [id]: true }));
                for (const outbound of store.getOutboundForResend()) {
                    if (outbound.eventType === GHOST_PLAN_UPDATE_EVENT) {
                        meshRef.current?.sendEventToAll({
                            type: GHOST_PLAN_UPDATE_EVENT,
                            plan: outbound.payload as Record<string, unknown>,
                            tick: outbound.tick,
                        });
                    } else {
                        meshRef.current?.sendEventToAll({
                            type: outbound.eventType,
                            payload: outbound.payload,
                            tick: outbound.tick,
                        });
                    }
                }
            },
            onPeerDisconnected: (id) => {
                setPeerConnected((prev) => ({ ...prev, [id]: false }));
                store.clearPeer(id, Date.now());
                syncPeerStates();
            },
        });
        meshRef.current = mesh;

        // Bootstrap peer connections if the game is already in progress when the mesh is (re)created.
        // Effect B only re-runs when peerIds change; if lobby changes independently
        // (common during mission-flow transitions) the new mesh would otherwise never get updatePeers called.
        mesh.updatePeers(peerIdsRef.current);

        setReady(true);

        (window as unknown as { __vibeTestWebRtcPing?: WebRtcPingTestFn }).__vibeTestWebRtcPing = () => {
            if (!lobby || !player) return;
            const meshInstance = meshRef.current;
            if (!meshInstance) return;
            meshInstance.sendEventToAll({ type: 'ping', fromPlayerId: player.id });
            onTransientEventRef.current?.(player.id, { type: 'ping', fromPlayerId: player.id });
        };

        return () => {
            mesh.dispose();
            if ((window as unknown as { __vibeTestWebRtcPing?: WebRtcPingTestFn }).__vibeTestWebRtcPing) {
                (window as unknown as { __vibeTestWebRtcPing?: WebRtcPingTestFn }).__vibeTestWebRtcPing = undefined;
            }
        };
    }, [enabled, lobby, player, sendSignal, syncPeerStates]);

    // Keep WebRTC peers in sync with current player list; only connect once the game starts
    useEffect(() => {
        if (!enabled || !meshRef.current) return;
        meshRef.current.updatePeers(peerIds);
    }, [enabled, peerIds]);

    const contextValue = useMemo(
        (): WebRtcMeshContextValue => ({
            ready,
            peerConnected,
            peerStatesByType,
            broadcastPeerState,
            sendTransientEvent,
            subscribePeerEvent,
        }),
        [ready, peerConnected, peerStatesByType, broadcastPeerState, sendTransientEvent, subscribePeerEvent],
    );

    return <WebRtcMeshContext.Provider value={contextValue}>{children}</WebRtcMeshContext.Provider>;
});

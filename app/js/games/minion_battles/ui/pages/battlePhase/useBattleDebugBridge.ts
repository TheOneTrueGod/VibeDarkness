import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import type { BattleNet } from '../../../game/battlenet';
import { computeSynchash } from '@/utils/synchash';
import type { BattleDebugBridge, BattleDebugSnapshot } from '../../../../../contexts/DebugConsoleContext';

declare global {
    interface Window {
        /**
         * When > Date.now(), BattleCanvas pauses auto-follow centering to give debug camera focus time.
         * Internal between BattlePhase and BattleCanvas — not part of the debug bridge.
         */
        __minionBattlesDebugAutoFollowPausedUntil?: number;
    }
}

interface UseBattleDebugBridgeParams {
    sessionRef: RefObject<BattleSession | null>;
    netRef: RefObject<BattleNet | null>;
    setBattleBridge: (bridge: BattleDebugBridge | null) => void;
    adminMovePendingUnitId: string | null;
    setAdminMovePendingUnitId: (unitId: string | null) => void;
}

/** Debug bridge registration, 100 ms snapshot/synchash poll, admin-move pending sync. */
export function useBattleDebugBridge({
    sessionRef,
    netRef,
    setBattleBridge,
    adminMovePendingUnitId,
    setAdminMovePendingUnitId,
}: UseBattleDebugBridgeParams) {
    const snapshotRef = useRef<BattleDebugSnapshot>({ gameTick: null, gameState: null, synchash: null });
    const adminMovePendingRef = useRef<string | null>(null);
    adminMovePendingRef.current = adminMovePendingUnitId;

    useEffect(() => {
        const bridge: BattleDebugBridge = {
            setUnitHover: (unitId) => {
                sessionRef.current?.getRenderer()?.setDebugUnitOutline(unitId);
                if (!unitId) {
                    window.__minionBattlesDebugAutoFollowPausedUntil = Date.now();
                    return;
                }
                const engine = sessionRef.current?.getEngine();
                const camera = sessionRef.current?.getCamera();
                if (!engine || !camera) return;
                const unit = engine.getUnit(unitId);
                if (!unit) return;
                camera.snapTo(unit.x, unit.y, unit.radius);
                window.__minionBattlesDebugAutoFollowPausedUntil = Date.now() + 2500;
            },
            adminHealUnit: (unitId) => {
                const engine = sessionRef.current?.getEngine();
                const net = netRef.current;
                if (!engine || !net) return;
                engine.adminHealUnit(unitId);
                void net.debugLogLocalStateAndSubmitSnapshot();
            },
            adminKillUnit: (unitId) => {
                const engine = sessionRef.current?.getEngine();
                const net = netRef.current;
                if (!engine || !net) return;
                engine.adminKillUnit(unitId);
                void net.debugLogLocalStateAndSubmitSnapshot();
            },
            adminMoveUnit: (unitId, worldX, worldY) => {
                const engine = sessionRef.current?.getEngine();
                const net = netRef.current;
                if (!engine || !net) return;
                engine.adminMoveUnit(unitId, worldX, worldY);
                void net.debugLogLocalStateAndSubmitSnapshot();
            },
            logLocalStateToLobby: async () => {
                const net = netRef.current;
                if (!net) {
                    console.warn('[BattlePhase] debug log local state: BattleNet not ready');
                    return;
                }
                try {
                    await net.debugLogLocalStateAndSubmitSnapshot();
                } catch (e) {
                    console.error('[BattlePhase] debugLogLocalStateAndSubmitSnapshot failed:', e);
                }
            },
            triggerDesync: () => {
                sessionRef.current?.triggerDebugDesyncOnce();
            },
            triggerReplayFromStart: () => {
                void sessionRef.current?.replayMissionFromStart();
            },
            getSnapshot: () => snapshotRef.current,
            getWorldModifiersDebug: () => {
                const engine = sessionRef.current?.getEngine();
                return engine ? engine.getWorldModifiersDebugSnapshot() : [];
            },
            setWorldModifierDisabled: (modifierId, disabled) => {
                const engine = sessionRef.current?.getEngine();
                const net = netRef.current;
                if (!engine || !net) return;
                engine.state.worldModifierManager.setDisabled(modifierId, disabled);
                void net.debugLogLocalStateAndSubmitSnapshot();
            },
            addTestWorldModifier: () => {
                const engine = sessionRef.current?.getEngine();
                const net = netRef.current;
                if (!engine || !net) return;
                void import('../../../worldModifiers/presets').then(({ rainyStormModifier }) => {
                    engine.state.worldModifierManager.addModifier(rainyStormModifier());
                    void net.debugLogLocalStateAndSubmitSnapshot();
                });
            },
        };
        setBattleBridge(bridge);
        return () => {
            sessionRef.current?.getRenderer()?.setDebugUnitOutline(null);
            setBattleBridge(null);
        };
    }, [sessionRef, netRef, setBattleBridge]);

    useEffect(() => {
        let hashSeq = 0;
        const id = window.setInterval(() => {
            const engine = sessionRef.current?.getEngine();
            const mgr = sessionRef.current?.getInteractionManager();
            if (engine) {
                const state = engine.toJSON() as unknown as Record<string, unknown>;
                snapshotRef.current = {
                    gameTick: typeof engine.gameTick === 'number' ? engine.gameTick : null,
                    gameState: state,
                    synchash: snapshotRef.current.synchash,
                };
                if (adminMovePendingRef.current !== null && (mgr?.adminMovePendingUnitId ?? null) === null) {
                    setAdminMovePendingUnitId(null);
                }
                const seq = ++hashSeq;
                void computeSynchash(state).then((h: string) => {
                    if (seq === hashSeq) {
                        snapshotRef.current = { ...snapshotRef.current, synchash: h };
                    }
                });
            }
        }, 100);
        return () => {
            window.clearInterval(id);
            snapshotRef.current = { gameTick: null, gameState: null, synchash: null };
        };
    }, [sessionRef, setAdminMovePendingUnitId]);

    useEffect(() => {
        sessionRef.current?.getInteractionManager()?.setAdminMovePendingUnitId(adminMovePendingUnitId);
    }, [sessionRef, adminMovePendingUnitId]);
}

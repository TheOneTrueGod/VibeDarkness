import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import type { BattleNet } from '../../../game/battlenet';
import type {
    BattleDebugBridge,
    BattleDebugSnapshot,
    BattleDebugSnapshotOptions,
} from '../../../../../contexts/DebugConsoleContext';

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

/** Debug bridge registration + cheap admin-move pending sync (no eager toJSON). */
export function useBattleDebugBridge({
    sessionRef,
    netRef,
    setBattleBridge,
    adminMovePendingUnitId,
    setAdminMovePendingUnitId,
}: UseBattleDebugBridgeParams) {
    const snapshotRef = useRef<BattleDebugSnapshot>({ gameTick: null, gameState: null, synchash: null });
    /** Tick for which `snapshotRef.current.gameState` was last serialized. */
    const gameStateTickRef = useRef<number | null>(null);
    const adminMovePendingRef = useRef<string | null>(null);
    adminMovePendingRef.current = adminMovePendingUnitId;

    useEffect(() => {
        const refreshMeta = (): BattleDebugSnapshot => {
            const engine = sessionRef.current?.getEngine();
            if (!engine) {
                snapshotRef.current = { gameTick: null, gameState: null, synchash: null };
                gameStateTickRef.current = null;
                return snapshotRef.current;
            }
            const gameTick = typeof engine.gameTick === 'number' ? engine.gameTick : null;
            // Match BattleSession / checkpoint synchash — O(1), not a full-state hash.
            const synchash = engine.getRuntimeFingerprintHex();
            if (
                snapshotRef.current.gameTick !== gameTick ||
                snapshotRef.current.synchash !== synchash
            ) {
                snapshotRef.current = {
                    ...snapshotRef.current,
                    gameTick,
                    synchash,
                };
            }
            return snapshotRef.current;
        };

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
            getSnapshot: (options?: BattleDebugSnapshotOptions) => {
                refreshMeta();
                if (!options?.includeGameState) {
                    return snapshotRef.current;
                }
                const engine = sessionRef.current?.getEngine();
                if (!engine) return snapshotRef.current;
                const gameTick = typeof engine.gameTick === 'number' ? engine.gameTick : null;
                if (
                    snapshotRef.current.gameState != null &&
                    gameStateTickRef.current === gameTick
                ) {
                    return snapshotRef.current;
                }
                snapshotRef.current = {
                    ...snapshotRef.current,
                    gameTick,
                    gameState: engine.toJSON() as unknown as Record<string, unknown>,
                    synchash: engine.getRuntimeFingerprintHex(),
                };
                gameStateTickRef.current = gameTick;
                return snapshotRef.current;
            },
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

    // Cheap poll: clear React admin-move pending when the interaction manager finishes.
    // Full engine toJSON / synchash hashing is on-demand via getSnapshot({ includeGameState }).
    useEffect(() => {
        const id = window.setInterval(() => {
            const mgr = sessionRef.current?.getInteractionManager();
            if (adminMovePendingRef.current !== null && (mgr?.adminMovePendingUnitId ?? null) === null) {
                setAdminMovePendingUnitId(null);
            }
        }, 100);
        return () => {
            window.clearInterval(id);
            snapshotRef.current = { gameTick: null, gameState: null, synchash: null };
            gameStateTickRef.current = null;
        };
    }, [sessionRef, setAdminMovePendingUnitId]);

    useEffect(() => {
        sessionRef.current?.getInteractionManager()?.setAdminMovePendingUnitId(adminMovePendingUnitId);
    }, [sessionRef, adminMovePendingUnitId]);
}

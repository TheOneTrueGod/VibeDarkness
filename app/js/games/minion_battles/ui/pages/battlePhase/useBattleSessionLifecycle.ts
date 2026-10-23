import { useEffect, useState, type MutableRefObject, type RefObject } from 'react';
import type { PlayerState } from '../../../../../types';
import type { MessageEntry } from '../../../../../components/Chat';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';

import { BattleSession, type BattleSessionEvent } from '../../../game/BattleSession';
import { createBattleNet, type BattleNet, type BattleNetSyncTerminalStatus } from '../../../game/battlenet';
import { runBattleBootstrap, type BattleInitPhase } from '../../../game/battleBootstrap';
import type { BattleNetSyncWireResult } from './useBattleNetSyncState';
import type { DarknessUpgradesState } from '../../../../../types';
import { resolveBattleDarknessUpgrades } from '../../../../../researchTrees/darknessUpgradeRewards';
import { getCompletedMissionIds } from '../../../../../researchTrees/darknessUpgrades';
import { getMissionDarknessUpgradeLimits } from '../../../../../researchTrees/darknessUpgradeSelection';
import { MISSION_MAP } from '../../../storylines';
import { SPECTATOR_ID, isControlEnemy } from '../../../state';
import type { VictorySnapshot } from '../../../storylines/victoryHealthConversion';

export type { BattleInitPhase };

interface UseBattleSessionLifecycleParams {
    api: MinionBattlesApi;
    missionId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
    initialGameState?: Record<string, unknown> | null;
    onLoadDarknessUpgrades?: () => Promise<DarknessUpgradesState | undefined>;
    /** Reports the host's active upgrade node ids once the engine is loaded (all clients). */
    onActiveDarknessUpgradeNodeIds?: (nodeIds: string[]) => void;
    onVictory?: (missionResult: string, hungerLoss?: number, snapshot?: VictorySnapshot) => void;
    onDefeat?: () => void;
    onEmittedChatMessage?: (entry: MessageEntry) => void;
    sessionRef: RefObject<BattleSession | null>;
    netRef: RefObject<BattleNet | null>;
    wireNetEvents: (net: BattleNet, session: BattleSession) => BattleNetSyncWireResult;
    onSessionEventRef: MutableRefObject<(ev: BattleSessionEvent, session: BattleSession) => void>;
    setNetSyncStatus: (status: BattleNetSyncTerminalStatus) => void;
}

/** Mount-once BattleSession load + UI subscription; preserves Strict Mode abort teardown (T1/T7). */
export function useBattleSessionLifecycle({
    api,
    missionId,
    playerId,
    isHost,
    players,
    characterSelections,
    initialGameState,
    onLoadDarknessUpgrades,
    onActiveDarknessUpgradeNodeIds,
    onVictory,
    onDefeat,
    onEmittedChatMessage,
    sessionRef,
    netRef,
    wireNetEvents,
    onSessionEventRef,
    setNetSyncStatus,
}: UseBattleSessionLifecycleParams) {
    const [battleInitPhase, setBattleInitPhase] = useState<BattleInitPhase>('fetching_assets');

    useEffect(() => {
        let effectAlive = true;

        const session = new BattleSession({
            api,
            missionId,
            playerId,
            isHost,
            onVictory,
            onDefeat,
            onEmittedChatMessage,
        });
        sessionRef.current = session;

        const unsub = session.subscribe((ev) => {
            onSessionEventRef.current(ev, session);
        });

        const net = createBattleNet({
            api: api.getLobbyClient(),
            session,
            isHost,
            lobbyId: api.getLobbyId(),
            gameId: api.getGameId(),
            playerId,
        });
        netRef.current = net;
        session.setNetAdapter(net);

        const cleanupRef = {
            current: () => {},
        };

        void (async () => {
            // Host-only: resolve the host's Darkness Upgrades into the bag that lands in the initial
            // snapshot. Non-hosts get `undefined` and read the bag from that snapshot instead.
            let resolvedUpgrades: ReturnType<typeof resolveBattleDarknessUpgrades>;
            if (isHost) {
                let localDarknessUpgrades: DarknessUpgradesState | undefined;
                try {
                    localDarknessUpgrades = await onLoadDarknessUpgrades?.();
                } catch {
                    localDarknessUpgrades = undefined;
                }
                // Upgrades earned from a mission only apply for a character who has completed that mission.
                let completedMissionIds: Set<string> = new Set();
                const characterId = characterSelections[playerId];
                if (characterId && characterId !== SPECTATOR_ID && !isControlEnemy(characterId)) {
                    try {
                        const rawChar = await api.getCharacter(characterId);
                        completedMissionIds = getCompletedMissionIds(rawChar.missionResults);
                    } catch {
                        completedMissionIds = new Set();
                    }
                }
                resolvedUpgrades = resolveBattleDarknessUpgrades({
                    isHost,
                    playerId,
                    players,
                    localDarknessUpgrades,
                    completedMissionIds,
                    maximumDarknessUpgrades: getMissionDarknessUpgradeLimits(MISSION_MAP[missionId]).max,
                });
            }
            await runBattleBootstrap({
                session,
                net,
                netRef,
                api,
                missionId,
                playerId,
                isHost,
                players,
                characterSelections,
                initialGameState,
                darknessUpgradeBonuses: resolvedUpgrades?.bonuses,
                darknessUpgradeNodeIds: resolvedUpgrades?.activeNodeIds,
                isAlive: () => effectAlive,
                onPhase: setBattleInitPhase,
                wireNet: wireNetEvents,
                registerCleanup: (cleanup) => {
                    const prevCleanup = cleanupRef.current;
                    cleanupRef.current = () => {
                        cleanup();
                        prevCleanup();
                    };
                },
                onFatalMissingSeed: () => setNetSyncStatus('failed'),
            });
            if (effectAlive) {
                onActiveDarknessUpgradeNodeIds?.(session.getEngine()?.darknessUpgradeNodeIds ?? []);
            }
        })();

        return () => {
            effectAlive = false;
            cleanupRef.current();
            unsub();
            session.destroy();
            sessionRef.current = null;
        };
        // Intentionally mount once: same pattern as previous loadGameState([]) (T1).
    }, []);

    return { battleInitPhase };
}

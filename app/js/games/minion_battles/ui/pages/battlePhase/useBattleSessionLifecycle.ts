import { useEffect, useState, type MutableRefObject, type RefObject } from 'react';

import type { PlayerState } from '../../../../../types';

import type { MessageEntry } from '../../../../../components/Chat';

import type { MinionBattlesApi } from '../../../api/minionBattlesApi';


import { BattleSession, type BattleSessionEvent } from '../../../game/BattleSession';

import { createBattleNet, type BattleNet, type BattleNetSyncTerminalStatus } from '../../../game/battlenet';

import { runBattleBootstrap, type BattleInitPhase } from '../../../game/battleBootstrap';

import type { BattleNetSyncWireResult } from './useBattleNetSyncState';



export type { BattleInitPhase };



interface UseBattleSessionLifecycleParams {

    api: MinionBattlesApi;

    missionId: string;

    playerId: string;

    isHost: boolean;

    players: Record<string, PlayerState>;

    characterSelections: Record<string, string>;

    initialGameState?: Record<string, unknown> | null;

    onVictory?: (missionResult: string) => void;

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



        void runBattleBootstrap({

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


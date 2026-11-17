import type { PlayerState } from '../../../types';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import type { SerializedGameState } from './types';
import type { BattleSession } from './BattleSession';
import type { BattleNet } from './battlenet';
import { fetchBattleAssets } from './fetchBattleAssets';
import { MISSION_MAP, DARK_AWAKENING } from '../storylines';
import { logToLobbyLog } from '../../../lobbyLog';
import { SPECTATOR_ID, isControlEnemy } from '../state';

export type BattleInitPhase = 'fetching_assets' | 'loading_battle' | 'submitting' | 'ready';

export interface BattleBootstrapWireResult {
    unsubscribe: () => void;
    bumpOrderPipeline: () => void;
}

export interface RunBattleBootstrapParams {
    session: BattleSession;
    net: BattleNet;
    netRef: { current: BattleNet | null };
    api: MinionBattlesApi;
    missionId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
    initialGameState?: Record<string, unknown> | null;
    /** Host's resolved Darkness Upgrades bag; non-host clients read it from the initial snapshot. */
    darknessUpgradeBonuses?: import('../../../researchTrees/types').PassiveBonuses;
    /** Host's active upgrade node ids; non-host clients read them from the initial snapshot. */
    darknessUpgradeNodeIds?: string[];
    /** Optional per-player knowledge override; normally read from the initial snapshot. */
    playerKnowledgeKeysByPlayer?: Record<string, string[]>;
    isAlive: () => boolean;
    onPhase: (phase: BattleInitPhase) => void;
    wireNet: (net: BattleNet, session: BattleSession) => BattleBootstrapWireResult;
    registerCleanup: (cleanup: () => void) => void;
    onFatalMissingSeed: () => void;
}

/** Async battle load sequencing extracted from mount-once lifecycle (T3/T8). */
export async function runBattleBootstrap({
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
    darknessUpgradeBonuses,
    darknessUpgradeNodeIds,
    playerKnowledgeKeysByPlayer,
    isAlive,
    onPhase,
    wireNet,
    registerCleanup,
    onFatalMissingSeed,
}: RunBattleBootstrapParams): Promise<void> {
    session.updateLobbyContext(players, characterSelections);

    /** `BattleNet` exists before async work finishes; React Strict Mode can unmount between awaits. */
    const tearDownNetForAbortedLoad = (): void => {
        net.stop();
        session.setNetAdapter(null);
        if (netRef.current === net) {
            netRef.current = null;
        }
    };

    const logInit = (message: string, severity: 'info' | 'warn' = 'info') => {
        void logToLobbyLog({
            lobbyClient: api.getLobbyClient(),
            lobbyId: api.getLobbyId(),
            playerId,
            gameId: api.getGameId(),
            tick: 0,
            severity,
            logType: 'debug',
            gamePhase: 'battle',
            message,
        });
    };

    // --- Battle Initialization: fetch terrain assets ---
    onPhase('fetching_assets');
    const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
    await fetchBattleAssets(api, playerId, mission.getFetchSegmentIds());

    if (!isAlive()) {
        tearDownNetForAbortedLoad();
        return;
    }

    onPhase('loading_battle');
    logInit('Battle Initialization: loading battle engine...');

    let bootstrappedFromCheckpoint = false;
    try {
        bootstrappedFromCheckpoint = await net.tryBootstrapFromLatestCheckpoint();
    } catch (err) {
        console.error('[BattlePhase] tryBootstrapFromLatestCheckpoint failed:', err);
    }

    if (!isAlive()) {
        tearDownNetForAbortedLoad();
        return;
    }

    if (!bootstrappedFromCheckpoint) {
        const battleSeed = typeof initialGameState?.battleSeed === 'number' ? initialGameState.battleSeed : null;
        if (battleSeed == null) {
            console.error(
                '[BattlePhase] battleSeed missing from game payload; cannot initialize deterministic battle',
            );
            onFatalMissingSeed();
            net.stop();
            session.setNetAdapter(null);
            netRef.current = null;
            return;
        }

        await session.load({
            players,
            characterSelections,
            battleSeed,
            initialSnapshot: (initialGameState as SerializedGameState | null | undefined) ?? undefined,
            darknessUpgradeBonuses,
            darknessUpgradeNodeIds,
            playerKnowledgeKeysByPlayer,
        });
    }

    logInit('Battle Initialization: engine loaded');

    // Mission start grant: the engine flag is already set from `startRewards` at load; also record it on
    // this player's own account (idempotent; the server allowlists the keys). Best effort.
    const startKnowledgeKeys = mission.startRewards?.knowledgeKeys ?? [];
    const myChoice = characterSelections[playerId];
    if (startKnowledgeKeys.length > 0 && myChoice && myChoice !== SPECTATOR_ID && !isControlEnemy(myChoice)) {
        api.grantBattleStartKnowledge(startKnowledgeKeys).catch((err) => {
            console.error('[BattlePhase] grantBattleStartKnowledge failed:', err);
        });
    }

    if (!isAlive()) {
        tearDownNetForAbortedLoad();
        return;
    }
    const wired = wireNet(net, session);

    registerCleanup(() => {
        wired.unsubscribe();
        net.stop();
        session.setNetAdapter(null);
        netRef.current = null;
    });

    if (isHost) {
        onPhase('submitting');
        logInit('Battle Initialization: submitting initial state to server...');
        await net.saveInitialState();
    }
    onPhase('ready');
    logInit('Battle Initialization: complete');
    session.startEngine();
    net.start();
    wired.bumpOrderPipeline();
}

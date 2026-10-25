/**
 * BattleSession engine wiring: `bindEngineCallbacks` (network/preview-aware engine callbacks) and
 * `finalizeEngine` (install a freshly built engine). Pure moves out of `BattleSession`.
 */
import type { MessageEntry } from '../../../components/Chat';
import { MessageType } from '../../../MessageTypes';
import { MISSION_MAP, DARK_AWAKENING } from '../storylines';
import { logToLobbyLogBattleSync } from '../../../lobbyLog';
import { GameEngine } from './GameEngine';
import { logUserState } from './battlenet/userStateLog';
import { buildWorldModifiersFromSources } from '../worldModifiers/buildWorldModifiers';
import { BUILTIN_WORLD_MODIFIERS } from '../worldModifiers/builtins/index';
import { compileWorldModifiers } from '../../../darknessStrength/compile';
import { bumpEpoch, assertNever } from './interaction/simTimeline';
import type { BattleSession } from './BattleSession';

export function bindEngineCallbacks(session: BattleSession, engine: GameEngine): void {
    const { api, isHost, onEmittedChatMessage } = session.config;
    // Non-host: freeze ITS at local-player parallel pauses (lobby 39E984).
    engine.freezeItsOnLocalPlayerParallelPause = !isHost;
    engine.setOnCheckpoint((gameTick, state) => {
        const timeline = session.getTimeline();
        switch (timeline.kind) {
            case 'canonical': {
                if (isHost) {
                    // Non-blocking for the engine; host persist POSTs await the in-flight snapshot.
                    const token = session.mintCanonicalToken();
                    void session.netAdapter?.saveSnapshotOnPause(gameTick, state, token);
                }
                break;
            }
            case 'preview': {
                const buffer = session.getPreviewEmissionBuffer();
                if (buffer) {
                    buffer.recordCheckpoint(gameTick, state, timeline.runId);
                }
                break;
            }
            default:
                assertNever(timeline);
        }
    });
    engine.setOnTickComplete((gameTick, fingerprintHex, paused, adminReason) => {
        const timeline = session.getTimeline();
        switch (timeline.kind) {
            case 'canonical': {
                if (isHost) {
                    const token = session.mintCanonicalToken();
                    session.netAdapter?.queueFingerprint(gameTick, fingerprintHex, paused, adminReason, token);
                }
                logUserState({ api, playerId: session.config.playerId, engine, fingerprintHex });
                break;
            }
            case 'preview': {
                const buffer = session.getPreviewEmissionBuffer();
                if (buffer) {
                    buffer.recordFingerprint(gameTick, fingerprintHex, paused, adminReason, timeline.runId);
                }
                break;
            }
            default:
                assertNever(timeline);
        }
    });
    if (isHost) {
        engine.setOnParallelBatchResolved((batchAtTick) => {
            const timeline = session.getTimeline();
            switch (timeline.kind) {
                case 'canonical': {
                    // Fire-and-follow: `tryResumeParallel` stays paused while this hook returns a
                    // Promise, which blocked host local playahead. Merge HTTP still runs, but only
                    // after persist appends land (`BattleNet.mergeAppliedOrdersForBatch` no-ops while
                    // that batch still has an unacked host append).
                    void session.netAdapter?.mergeAppliedOrdersForBatch(batchAtTick);
                    break;
                }
                case 'preview': {
                    const buffer = session.getPreviewEmissionBuffer();
                    if (buffer) {
                        buffer.recordResolvedBatch(batchAtTick, timeline.runId);
                    }
                    break;
                }
                default:
                    assertNever(timeline);
            }
        });
    } else {
        engine.setOnParallelBatchResolved(null);
    }
    engine.setOnEmitMessage((text, npcId) => {
        if (!isHost) return;
        const onSent = (res: { messageId: number; chatEntry?: Record<string, unknown> }) => {
            if (res.chatEntry) onEmittedChatMessage?.(res.chatEntry as MessageEntry);
        };
        if (npcId) {
            api.sendMessage(MessageType.NPC_CHAT, { npcId, message: text }).then(onSent).catch(() => {});
        } else {
            api.sendMessage(MessageType.CHAT, { message: text }).then(onSent).catch(() => {});
        }
    });
    engine.setOnItsParallelPauseDecision((decision, waiters, gameTick, info) => {
        const localPlayerId = session.config.playerId;
        const missingPick = info?.missingPick === true;
        // A dropped missing-pick waiter is an automatic pass-and-fizzle: always mark the preview as
        // depending on another player (even for a local waiter), so the commit rewinds and the real
        // timeline asks for the real pick.
        const newlyUncertain =
            session.interactiveTargeting.isActive
            && (missingPick || waiters.some((w) => w.ownerId !== localPlayerId))
            && session.interactiveTargeting.noteMultiplayerUncertaintyDuringPreview();
        const lobbyClient = typeof api.getLobbyClient === 'function' ? api.getLobbyClient() : null;
        if (!lobbyClient) return;
        if (!newlyUncertain && decision === 'drop') {
            // Skip duplicate lobby lines when waiters persist across preview ticks.
            return;
        }
        logToLobbyLogBattleSync({
            lobbyClient,
            lobbyId: api.getLobbyId(),
            playerId: session.config.playerId,
            tick: gameTick,
            severity: 'info',
            gameId: api.getGameId(),
            message:
                decision === 'freeze'
                    ? 'ITS: freezing at parallel pause (local player is waiter)'
                    : missingPick
                        ? 'ITS: auto pass-and-fizzle at a missing-pick pause'
                        : 'ITS: dropping ally-only parallel pause (preview continues)',
            context: {
                decision,
                missingPick,
                isHost,
                waiterOwnerIds: waiters.map((w) => w.ownerId),
                waiterUnitIds: waiters.map((w) => w.unitId),
            },
        });
    });
}

export function finalizeEngine(session: BattleSession, engine: GameEngine): void {
    const mission = MISSION_MAP[session.config.missionId] ?? DARK_AWAKENING;
    // Defs are runtime-only; re-register after fromJSON so late spawns still assign.
    // Fresh load already registered in initializeGameState — this is idempotent.
    engine.registerPlayerControl(
        mission.playerControl ?? [],
        { ...engine.getNpcControlAssignments() },
    );
    if (session.renderer) {
        session.renderer.localTeamId = engine.getLocalPlayerTeamId();
    }
    const { onVictory, onDefeat } = session.config;
    engine.registerBattleObjectives(mission.battleObjectives ?? []);
    engine.state.worldModifierManager.install(
        buildWorldModifiersFromSources({
            builtins: BUILTIN_WORLD_MODIFIERS,
            campaign: compileWorldModifiers(engine.activeDarknessStrengths),
            mission: mission.worldModifiers,
        }),
    );
    session.engine = engine;
    // Bump epoch when engine instance is replaced.
    session.timeline = bumpEpoch(session.timeline);
    session.emit({ type: 'round_number', roundNumber: engine.roundNumber });
    session.emit({ type: 'round_progress', progress: engine.roundProgress });
    session.emit({ type: 'pause_state', paused: !!engine.waitingForOrders, waitingForOrders: engine.waitingForOrders });

    engine.setOnWaitingForOrders((info) => {
        if (engine.isSequentialTargetingPreview) return;
        session.emit({
            type: 'waiting_for_orders',
            engine,
            info,
            source: 'engine_callback',
        });
    });
    bindEngineCallbacks(session, engine);
    engine.eventBus.on('ability_bar_changed', () => {
        if (engine.isSequentialTargetingPreview) return;
        session.emit({ type: 'card_state', engine });
    });
    engine.setOnRoundEnd((rn) => {
        if (engine.isSequentialTargetingPreview) return;
        session.emit({ type: 'round_number', roundNumber: rn + 1 });
        session.emit({ type: 'card_state', engine });
    });
    engine.setOnStateChanged(() => {
        if (engine.isSequentialTargetingPreview) return;
        session.emit({ type: 'round_progress', progress: engine.roundProgress });
        session.emit({ type: 'round_number', roundNumber: engine.roundNumber });
    });
    if (onVictory) {
        engine.setOnVictory((result) => {
            if (engine.isSequentialTargetingPreview) {
                session.commitPreviewForTerminalOutcome(engine);
                return;
            }
            onVictory(result, session.matchHungerLossFor(engine), session.victorySnapshotFor(engine));
        });
    }
    if (onDefeat) {
        engine.setOnDefeat(() => {
            if (engine.isSequentialTargetingPreview) {
                session.commitPreviewForTerminalOutcome(engine);
                return;
            }
            onDefeat();
        });
    }
    const myUnit = engine.getLocalPlayerUnit();
    if (myUnit && session.camera) {
        session.camera.snapTo(myUnit.x, myUnit.y, myUnit.radius);
    }
    session.emit({ type: 'card_state', engine });
    if (engine.waitingForOrders) {
        session.emit({
            type: 'waiting_for_orders',
            engine,
            info: engine.waitingForOrders,
            source: 'post_full_state_sync',
        });
    } else {
        engine.isPaused = false;
    }
    engine.clearDeferredOrderPauseAndAccumulator();
}

/**
 * BattleSession terminal-outcome handling (victory/defeat latched during an ITS preview).
 * Pure moves out of `BattleSession`.
 */
import type { BattleSession } from './BattleSession';
import type { GameEngine } from './GameEngine';
import { computeMatchHungerLoss, findPlayerUnitForMatchHunger } from '../storylines/matchHunger';
import type { VictorySnapshot } from '../storylines/victoryHealthConversion';

/**
 * Fallback when a terminal outcome fires with preview flags set but no live ITS session
 * (e.g. flags orphaned after an external teardown): clear flags and surface the outcome.
 */
function teardownSequentialTargetingPreviewForTerminalOutcome(session: BattleSession, engine: GameEngine): void {
    engine.isSequentialTargetingPreview = false;
    engine.sequentialTargetingPreviewCast = null;
    engine.waitingForTargetInput = null;
    if (session.interactiveTargeting.isActive) {
        session.interactiveTargeting.endPreviewForTerminalOutcome(session);
    }
    session.rebindEngineCallbacks();
}

/**
 * Victory/defeat latched during ITS preview playahead. The killing order exists only in the
 * local preview sim, so the outcome must not be surfaced until the order is persisted —
 * otherwise other clients (and the server) never see the kill and desync.
 *
 * Routes through {@link InteractiveTargetingSession.commit}:
 * - In-place commit persists the finalized order, then `reemitSuppressedTerminalOutcome`
 *   fires the victory/defeat UI.
 * - Rollback commit restores the mark (discarding the preview's terminal state) and resubmits
 *   via BattleNet; the outcome re-fires naturally when the authoritative sim reaches the kill.
 * - A failed commit restores the pre-preview pause with no outcome UI — correct, since the
 *   kill never happened authoritatively.
 */
export function commitPreviewForTerminalOutcome(session: BattleSession, engine: GameEngine): void {
    if (session.terminalPreviewAutoCommitInFlight) return;
    if (!session.interactiveTargeting.isActive) {
        teardownSequentialTargetingPreviewForTerminalOutcome(session, engine);
        reemitSuppressedTerminalOutcome(session, engine);
        return;
    }
    session.terminalPreviewAutoCommitInFlight = true;
    void session.interactiveTargeting
        .commit(session, 'terminal_outcome_auto_commit')
        .finally(() => {
            session.terminalPreviewAutoCommitInFlight = false;
        });
}

/**
 * Re-fire victory/defeat UI callbacks when a terminal result latched during preview
 * (`LevelEventManager.isTerminal`) but was swallowed by `isSequentialTargetingPreview` guards.
 */
export function reemitSuppressedTerminalOutcome(session: BattleSession, engine: GameEngine): void {
    const outcome = engine.state.levelEventManager.getTerminalOutcome();
    if (!outcome) {
        return;
    }
    if (outcome.kind === 'victory') {
        session.config.onVictory?.(
            outcome.missionResult,
            matchHungerLossFor(engine),
            victorySnapshotFor(engine),
        );
    } else {
        session.config.onDefeat?.();
    }
}

/** Objective rows and the local player's HP at match end, for the victory popover. */
export function victorySnapshotFor(engine: GameEngine): VictorySnapshot {
    const unit = findPlayerUnitForMatchHunger(
        engine.units,
        engine.localPlayerId,
        engine.getLocalPlayerUnit(),
    );
    return {
        objectives: engine.getBattleObjectiveRows(),
        playerHp: unit ? { hp: unit.hp, maxHp: unit.maxHp } : null,
    };
}

/** Positive Hunger lost by the local player this match (see `computeMatchHungerLoss`). */
export function matchHungerLossFor(engine: GameEngine): number {
    const unit = findPlayerUnitForMatchHunger(
        engine.units,
        engine.localPlayerId,
        engine.getLocalPlayerUnit(),
    );
    return unit ? computeMatchHungerLoss(unit) : 0;
}

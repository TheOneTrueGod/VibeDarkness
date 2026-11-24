import type { GameEngine } from '../GameEngine';
import type { Camera } from '../Camera';
import type { GameRenderer } from '../GameRenderer';
import type { AbilityStatic } from '../../abilities/Ability';
import type { BattleOrder, ResolvedTarget, SerializedGameState, WaitingForOrders } from '../types';

export interface PlayerInteractionSession {
    submitPlayerOrder(order: BattleOrder, opts: { canSubmitOrders: boolean }): Promise<void>;
    /**
     * The session's current manager. An ITS rewind restores the engine, which rebuilds the manager
     * (`BattleSession.startEngine`), so a swap must continue on this one, not the one that started it.
     */
    getInteractionManager?(): {
        activateAbilityTargeting(cardIndex: number, ability: AbilityStatic): void;
        adoptOrderUiState(from: {
            canUseOrderUi: boolean;
            myAbilityIds: readonly string[];
            abilityModeResolver: ((abilityId: string) => string | undefined) | null;
        }): void;
        submitOrder(abilityId: string, targets: ResolvedTarget[]): void;
    } | null;
    /** ITS preview gate — used to block wait/end-turn while a local preview is active. */
    readonly interactiveTargeting: {
        readonly isActive: boolean;
        readonly previewOrderQueued: boolean;
        /** True while a resume preview (picking at a missing-pick pause) is running. */
        readonly isResumeMode: boolean;
        /** Snapshot a rewind restores; the ability hand reads its caster during a preview (`getHandViewUnit`). */
        readonly mark?: SerializedGameState | null;
        /** Ability the active preview runs (null when inactive). Optional so minimal test doubles still fit. */
        readonly abilityId?: string | null;
        /** Caster of the active preview (null when inactive). */
        readonly unitId?: string | null;
        /** Targets collected so far; Undo / swap rules read whether any exist. */
        readonly collectedTargets?: Readonly<Record<string, unknown>>;
        shouldForceItsCommitAtComboWindow(): boolean;
        /** True while a commit is running. Optional so minimal test doubles still fit. */
        readonly isCommitInFlight?: boolean;
        /** Combo pause planes whose follow-up already started (survives the manager rebuild a rewind causes). */
        hasComboFollowUpStarted?(planeKey: string): boolean;
        noteComboFollowUpStarted?(planeKey: string): void;
        commit(session: PlayerInteractionSession, actionSource?: string): Promise<void>;
        reset(
            session: PlayerInteractionSession,
            actionSource?: string,
            cancelReason?: string,
            rewindReason?: string,
        ): Promise<void>;
        /** Non-null when the preview cast ended early (interrupt / fizzle / death); Pass then commits at Done. */
        getPreviewCastEndedEarly?(engine: GameEngine): unknown;
    };
}

export interface PlayerInteractionContext {
    engine: GameEngine;
    camera: Camera;
    renderer: GameRenderer;
    session: PlayerInteractionSession;
    playerId: string;
}

export type PlayerInteractionUIState = {
    selectedAbility: AbilityStatic | null;
    selectedCardIndex: number | null;
    nonconfirmedOrder: BattleOrder | null;
    currentTargets: ResolvedTarget[];
    mouseWorld: { x: number; y: number };
    previewOrderUnitId: string | null;
};

/** Minimal manager API that tools receive as a parameter — implemented by PlayerInteractionManager. */
export interface IPlayerInteractionManager {
    readonly canUseOrderUi: boolean;
    readonly waitingForOrders: WaitingForOrders | null;
    readonly adminMovePendingUnitId: string | null;
    submitOrder(
        abilityId: string,
        targets: ResolvedTarget[],
        targetsByLabel?: Record<string, ResolvedTarget>,
    ): void;
    deactivateTool(): void;
    setCurrentTargets(targets: ResolvedTarget[]): void;
    getUIState(): PlayerInteractionUIState;
    /**
     * Updates movement fields on the current nonconfirmedOrder (or creates a wait+move plan)
     * and resubmits it without ending the turn.
     */
    updateNonconfirmedMovement(
        movePath: { col: number; row: number }[],
        moveTargetUnitId: string | undefined,
        moveTargetPixel: { x: number; y: number } | undefined,
    ): void;
    setAdminMovePendingUnitId(id: string | null): void;
    clearAdminMovePending(): void;
}

export interface InteractionTool {
    onCanvasClick?(
        screenX: number,
        screenY: number,
        ctx: PlayerInteractionContext,
        manager: IPlayerInteractionManager,
    ): boolean;
    onCanvasRightClick?(
        screenX: number,
        screenY: number,
        shiftKey: boolean,
        ctrlKey: boolean,
        ctx: PlayerInteractionContext,
        manager: IPlayerInteractionManager,
        /** Right-button drag: update the local movement preview only; submit no order. */
        previewOnly?: boolean,
    ): boolean;
    onCanvasMouseMove?(
        screenX: number,
        screenY: number,
        ctx: PlayerInteractionContext,
        manager: IPlayerInteractionManager,
    ): boolean;
    onDeactivate?(
        ctx: PlayerInteractionContext,
        manager: IPlayerInteractionManager,
    ): void;
}

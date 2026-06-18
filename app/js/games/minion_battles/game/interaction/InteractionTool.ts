import type { GameEngine } from '../GameEngine';
import type { Camera } from '../Camera';
import type { GameRenderer } from '../GameRenderer';
import type { AbilityStatic } from '../../abilities/Ability';
import type { BattleOrder, ResolvedTarget, WaitingForOrders } from '../types';

export interface PlayerInteractionSession {
    submitPlayerOrder(order: BattleOrder, opts: { canSubmitOrders: boolean }): Promise<void>;
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
     * Updates movement fields on the current nonconfirmedOrder and resubmits it.
     * No-op if there is no nonconfirmedOrder or AUTO_END_TURN is set.
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

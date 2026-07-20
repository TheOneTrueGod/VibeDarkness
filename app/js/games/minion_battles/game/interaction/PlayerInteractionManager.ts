import type { AbilityStatic } from '../../abilities/Ability';
import { getAbilityTargets } from '../../abilities/Ability';
import type { BattleOrder, ResolvedTarget, WaitingForOrders } from '../types';
import type { BattleSession } from '../BattleSession';
import type { InteractionTool, PlayerInteractionContext, PlayerInteractionUIState, IPlayerInteractionManager } from './InteractionTool';
import { DefaultTool } from './tools/DefaultTool';
import { AbilityTargetingTool } from './tools/AbilityTargetingTool';
import { UnitSelectorDebugTool } from './tools/UnitSelectorDebugTool';
import { AdminMoveDebugTool } from './tools/AdminMoveDebugTool';
import { getDebugState } from '../../debugState';
import { resolveClick, getSelectTargetDefsFromTimings } from '../../abilities/targeting';
import { getAutoEndTurn } from '../autoEndTurnSetting';
import { USE_SEQUENTIAL_TARGETING } from '../../featureFlags';
import { getAbility } from '../../abilities/AbilityRegistry';
import { TERRAIN_PROPERTIES } from '../../terrain/TerrainType';
import { getLightGrid } from '../LightGrid';
import { logOrderUiKeyAction } from './itsLobbyLog';

declare global {
    interface Window {
        __minionBattlesDebugMouse?: {
            worldX: number;
            worldY: number;
            row: number;
            col: number;
            terrainName: string;
            lightLevel: number | null;
            segmentId: string | null;
        };
    }
}

type UIListener = () => void;

const EMPTY_UI_STATE: PlayerInteractionUIState = {
    selectedAbility: null,
    selectedCardIndex: null,
    nonconfirmedOrder: null,
    currentTargets: [],
    mouseWorld: { x: 0, y: 0 },
    previewOrderUnitId: null,
};

export class PlayerInteractionManager implements IPlayerInteractionManager {
    private ctx: PlayerInteractionContext | null = null;
    private activeTool: InteractionTool | null = null;
    private defaultTool: DefaultTool | null = null;
    private uiState: PlayerInteractionUIState = { ...EMPTY_UI_STATE };
    private _canUseOrderUi: boolean = false;
    private _waitingForOrders: WaitingForOrders | null = null;
    private _adminMovePendingUnitId: string | null = null;
    private myAbilityIds: string[] = [];
    private resolveAbilityMode: ((abilityId: string) => string | undefined) | null = null;
    private readonly listeners = new Set<UIListener>();

    // -------------------------------------------------------------------------
    // IPlayerInteractionManager — public read-only accessors

    get canUseOrderUi(): boolean {
        return this._canUseOrderUi;
    }

    get waitingForOrders(): WaitingForOrders | null {
        return this._waitingForOrders;
    }

    get adminMovePendingUnitId(): string | null {
        return this._adminMovePendingUnitId;
    }

    setAdminMovePendingUnitId(id: string | null): void {
        this._adminMovePendingUnitId = id;
    }

    clearAdminMovePending(): void {
        this._adminMovePendingUnitId = null;
    }

    // -------------------------------------------------------------------------
    // Setup

    setContext(ctx: PlayerInteractionContext): void {
        this.ctx = ctx;
        this.defaultTool = new DefaultTool();
    }

    setCanUseOrderUi(value: boolean): void {
        this._canUseOrderUi = value;
    }

    setWaitingForOrders(info: WaitingForOrders | null): void {
        const prev = this._waitingForOrders;
        this._waitingForOrders = info;
        const changed =
            prev === null !== (info === null) ||
            (prev != null && info != null && prev.atTick !== info.atTick);
        if (changed) {
            this.defaultTool?.reset();
            if (info != null && this.ctx) {
                const active = this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId);
                if (active) {
                    const unit = this.ctx.engine.getUnit(active.unitId);
                    if (unit) this.defaultTool?.seedFromUnit(unit);
                }
            }
            // Nonconfirmed orders belong to a single pause batch. When the plane advances
            // (or clears), drop any leftover — e.g. ITS Done left throw_rock in UI state and
            // the next right-click would re-submit it via updateNonconfirmedMovement.
            this.uiState = {
                ...this.uiState,
                nonconfirmedOrder: null,
                previewOrderUnitId: info
                    ? (this.ctx?.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx?.playerId ?? '')?.unitId ?? null)
                    : null,
            };
            this.emitChange();
        }
    }

    setMyAbilityIds(ids: string[]): void {
        this.myAbilityIds = ids;
    }

    /** BattlePhase supplies per-ability mode selection for order submission. */
    setAbilityModeResolver(resolver: ((abilityId: string) => string | undefined) | null): void {
        this.resolveAbilityMode = resolver;
    }

    /** Re-submit nonconfirmed order when the player toggles mode mid-targeting. */
    refreshNonconfirmedAbilityMode(abilityId: string): void {
        const order = this.uiState.nonconfirmedOrder;
        if (!order || order.abilityId !== abilityId || !this.ctx) return;
        const mode = this.resolveAbilityMode?.(abilityId);
        const updated: BattleOrder = {
            ...order,
            ...(mode !== undefined ? { abilityMode: mode } : {}),
        };
        if (updated.abilityMode === order.abilityMode) return;
        this.uiState = { ...this.uiState, nonconfirmedOrder: updated };
        void this.ctx.session.submitPlayerOrder(updated, { canSubmitOrders: this._canUseOrderUi });
        this.emitChange();
    }

    // -------------------------------------------------------------------------
    // Event routing

    onCanvasClick(screenX: number, screenY: number): void {
        if (!this.ctx) return;

        // Debug: unit selector mode takes priority over everything else.
        if (getDebugState().unitSelectorMode) {
            const debugTool = new UnitSelectorDebugTool();
            this.activateTool(debugTool);
            debugTool.onCanvasClick?.(screenX, screenY, this.ctx, this);
            return;
        }

        // Debug: admin move pending unit id.
        const adminMovePendingUnitId = this._adminMovePendingUnitId;
        if (adminMovePendingUnitId) {
            const adminTool = new AdminMoveDebugTool(adminMovePendingUnitId);
            this.activateTool(adminTool);
            adminTool.onCanvasClick?.(screenX, screenY, this.ctx, this);
            return;
        }

        const tool = this.activeTool;
        if (tool?.onCanvasClick) {
            const handled = tool.onCanvasClick(screenX, screenY, this.ctx, this);
            if (handled) return;
        }
        const dt = this.defaultTool as InteractionTool | null;
        dt?.onCanvasClick?.(screenX, screenY, this.ctx, this);
    }

    onCanvasRightClick(screenX: number, screenY: number, shiftKey: boolean, ctrlKey: boolean): void {
        if (!this.ctx) return;
        const tool = this.activeTool;
        if (tool?.onCanvasRightClick) {
            const handled = tool.onCanvasRightClick(screenX, screenY, shiftKey, ctrlKey, this.ctx, this);
            if (handled) return;
        }
        const dt = this.defaultTool as InteractionTool | null;
        dt?.onCanvasRightClick?.(screenX, screenY, shiftKey, ctrlKey, this.ctx, this);
    }

    onCanvasMouseMove(screenX: number, screenY: number): void {
        if (!this.ctx) return;
        const worldPos = this.ctx.camera.screenToWorld(screenX, screenY);
        this.uiState = { ...this.uiState, mouseWorld: { x: worldPos.x, y: worldPos.y } };

        if (getDebugState().unitSelectorMode) {
            const { engine, camera, renderer } = this.ctx;
            const hoverResult = resolveClick(screenX, screenY, camera, engine.units);
            renderer.setDebugUnitOutline(hoverResult.unit?.id ?? null);
        }

        const tool = this.activeTool;
        if (tool?.onCanvasMouseMove) {
            const handled = tool.onCanvasMouseMove(screenX, screenY, this.ctx, this);
            if (handled) return;
        }
        const dt = this.defaultTool as InteractionTool | null;
        dt?.onCanvasMouseMove?.(screenX, screenY, this.ctx, this);

        const { engine, camera } = this.ctx;
        if (engine.terrainManager) {
            const wPos = camera.screenToWorld(screenX, screenY);
            const grid = engine.terrainManager.grid;
            const clampedX = Math.max(0, Math.min(wPos.x, engine.getWorldWidth()));
            const clampedY = Math.max(0, Math.min(wPos.y, engine.getWorldHeight()));
            const { col, row } = grid.worldToGrid(clampedX, clampedY);
            const terrain = engine.terrainManager.getTerrainAt(clampedX, clampedY);
            const terrainName = TERRAIN_PROPERTIES[terrain]?.name ?? String(terrain);
            let lightLevel: number | null = null;
            if (engine.lightLevelEnabled) {
                const lightGrid = getLightGrid(
                    engine.globalLightLevel,
                    grid.width,
                    grid.height,
                    engine.getAllLightSources(),
                );
                lightLevel = lightGrid[row]?.[col] ?? null;
            }
            const segmentId = engine.terrainManager.getSegmentIdAt(col, row);
            window.__minionBattlesDebugMouse = { worldX: clampedX, worldY: clampedY, row, col, terrainName, lightLevel, segmentId };
        }
    }

    onKeyDown(e: KeyboardEvent): void {
        // Space — confirm/wait
        if (e.code === 'Space' && !e.repeat) {
            e.preventDefault();
            if (!this._canUseOrderUi) {
                if (this.ctx) {
                    logOrderUiKeyAction(this.ctx.session as BattleSession, {
                        action: 'space',
                        itsActive: this.ctx.session.interactiveTargeting.isActive,
                        canUseOrderUi: false,
                        hasActiveLocalWaiter:
                            this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId) != null,
                        hasNonconfirmedOrder: this.uiState.nonconfirmedOrder != null,
                        autoEndTurn: getAutoEndTurn(),
                        blocked: true,
                        blockReason: 'can_use_order_ui_false',
                    });
                }
                return;
            }
            if (this.uiState.nonconfirmedOrder && !getAutoEndTurn()) {
                this.handleEndTurn();
            } else {
                this.handleWait();
            }
            return;
        }

        // Escape — cancel targeting or cancel nonconfirmed order
        if (e.code === 'Escape') {
            if (this.activeTool instanceof AbilityTargetingTool) {
                this.deactivateTool();
                this.emitChange();
            } else if (this.uiState.nonconfirmedOrder) {
                const order = this.uiState.nonconfirmedOrder;
                this.uiState = { ...this.uiState, nonconfirmedOrder: null };
                if (this.ctx) {
                    void this.ctx.session.submitPlayerOrder(
                        { unitId: order.unitId, abilityId: 'wait', targets: [], endTurn: false },
                        { canSubmitOrders: this._canUseOrderUi },
                    );
                }
                this.emitChange();
            }
            return;
        }

        // 1-9 — select ability by index
        const digit = e.key >= '1' && e.key <= '9' ? parseInt(e.key, 10) : 0;
        if (digit > 0 && this._canUseOrderUi) {
            const index = digit - 1;
            if (index < this.myAbilityIds.length) {
                const abilityId = this.myAbilityIds[index];
                const ability = abilityId ? getAbility(abilityId) : null;
                if (ability) {
                    e.preventDefault();
                    this.activateAbilityTargeting(index, ability);
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // Tool management

    activateTool(tool: InteractionTool): void {
        if (this.activeTool && this.activeTool !== tool) {
            if (this.ctx) this.activeTool.onDeactivate?.(this.ctx, this);
        }
        this.activeTool = tool;
        const ability = tool instanceof AbilityTargetingTool ? tool.ability : null;
        const cardIndex = tool instanceof AbilityTargetingTool ? tool.cardIndex : null;
        this.uiState = {
            ...this.uiState,
            selectedAbility: ability,
            selectedCardIndex: cardIndex,
            currentTargets: [],
        };
        this.emitChange();
    }

    deactivateTool(): void {
        if (this.activeTool && this.ctx) {
            this.activeTool.onDeactivate?.(this.ctx, this);
        }
        this.activeTool = null;
        this.uiState = {
            ...this.uiState,
            selectedAbility: null,
            selectedCardIndex: null,
            currentTargets: [],
        };
        this.emitChange();
    }

    activateAbilityTargeting(cardIndex: number, ability: AbilityStatic): void {
        if (this.activeTool instanceof AbilityTargetingTool && this.activeTool.cardIndex === cardIndex) {
            this.deactivateTool();
            return;
        }
        if (!this._waitingForOrders || !this.ctx) return;
        const active = this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId);
        if (!active) return;
        if (USE_SEQUENTIAL_TARGETING) {
            const caster = this.ctx.engine.getUnit(active.unitId) ?? undefined;
            const selectDefs = getSelectTargetDefsFromTimings(ability, caster, this.ctx.engine);
            if (selectDefs.length > 0) {
                this.submitOrder(ability.id, []);
                return;
            }
            // Self-cast abilities with no select steps submit immediately (e.g. Light Imbuement).
            const staticTargets = getAbilityTargets(ability, caster, this.ctx.engine);
            if (staticTargets.length === 0) {
                this.submitOrder(ability.id, []);
                return;
            }
        }
        this.activateTool(new AbilityTargetingTool(ability, cardIndex, active.unitId));
    }

    // -------------------------------------------------------------------------
    // Order submission

    submitOrder(
        abilityId: string,
        targets: ResolvedTarget[],
        targetsByLabel?: Record<string, ResolvedTarget>,
    ): void {
        if (!this._waitingForOrders || !this.ctx || !this._canUseOrderUi) return;
        const active = this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId);
        if (!active) return;

        const movePath = this.defaultTool?.pendingMovePath ?? undefined;
        const moveTargetUnitId = this.defaultTool?.pendingMoveTargetUnitId ?? undefined;
        const moveTargetPixel = this.defaultTool?.pendingMoveTargetPixel ?? undefined;

        const order: BattleOrder = {
            unitId: active.unitId,
            abilityId,
            targets,
            movePath: movePath ?? undefined,
            moveTargetUnitId: moveTargetUnitId ?? undefined,
            moveTargetPixel: moveTargetPixel ?? undefined,
            ...(targetsByLabel && Object.keys(targetsByLabel).length > 0 ? { targetsByLabel } : {}),
            ...(this.resolveAbilityMode?.(abilityId) !== undefined
                ? { abilityMode: this.resolveAbilityMode!(abilityId) }
                : {}),
        };

        this.defaultTool?.reset();
        this.uiState = { ...this.uiState, currentTargets: [] };

        if (abilityId === 'wait' || getAutoEndTurn()) {
            order.endTurn = true;
            this.uiState = { ...this.uiState, nonconfirmedOrder: null };
            void this.ctx.session.submitPlayerOrder(order, { canSubmitOrders: this._canUseOrderUi });
        } else {
            this.uiState = { ...this.uiState, nonconfirmedOrder: order };
            void this.ctx.session.submitPlayerOrder(order, { canSubmitOrders: this._canUseOrderUi });
        }
        this.emitChange();
    }

    handleWait(): void {
        const logWait = (blocked: boolean, blockReason: string | null): void => {
            if (!this.ctx) return;
            logOrderUiKeyAction(this.ctx.session as BattleSession, {
                action: 'wait',
                itsActive: this.ctx.session.interactiveTargeting.isActive,
                canUseOrderUi: this._canUseOrderUi,
                hasActiveLocalWaiter:
                    this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId) != null,
                hasNonconfirmedOrder: this.uiState.nonconfirmedOrder != null,
                autoEndTurn: getAutoEndTurn(),
                blocked,
                blockReason,
            });
        };
        if (this.ctx?.session.interactiveTargeting.isActive) {
            // Deferred-first-select ITS keeps waitingForOrders + active waiter, so Space would
            // otherwise POST wait for the open batch (lobby 10EA88 / 12D040).
            logWait(true, 'its_preview_active');
            return;
        }
        if (!this._canUseOrderUi || !this._waitingForOrders) {
            logWait(true, !this._canUseOrderUi ? 'can_use_order_ui_false' : 'no_waiting_for_orders_ui');
            return;
        }
        if (!this.ctx?.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId)) {
            logWait(true, 'no_active_local_waiter');
            return;
        }
        logWait(false, null);
        this.deactivateTool();
        this.submitOrder('wait', []);
    }

    handleEndTurn(): void {
        const order = this.uiState.nonconfirmedOrder;
        if (this.ctx?.session.interactiveTargeting.isActive) {
            logOrderUiKeyAction(this.ctx.session as BattleSession, {
                action: 'end_turn',
                itsActive: true,
                canUseOrderUi: this._canUseOrderUi,
                hasActiveLocalWaiter:
                    this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId) != null,
                hasNonconfirmedOrder: order != null,
                autoEndTurn: getAutoEndTurn(),
                blocked: true,
                blockReason: 'its_preview_active',
            });
            return;
        }
        if (!order || !this._canUseOrderUi || !this.ctx) {
            if (this.ctx) {
                logOrderUiKeyAction(this.ctx.session as BattleSession, {
                    action: 'end_turn',
                    itsActive: this.ctx.session.interactiveTargeting.isActive,
                    canUseOrderUi: this._canUseOrderUi,
                    hasActiveLocalWaiter:
                        this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId) != null,
                    hasNonconfirmedOrder: this.uiState.nonconfirmedOrder != null,
                    autoEndTurn: getAutoEndTurn(),
                    blocked: true,
                    blockReason: !order
                        ? 'no_nonconfirmed_order'
                        : !this._canUseOrderUi
                          ? 'can_use_order_ui_false'
                          : 'no_context',
                });
            }
            return;
        }
        logOrderUiKeyAction(this.ctx.session as BattleSession, {
            action: 'end_turn',
            itsActive: this.ctx.session.interactiveTargeting.isActive,
            canUseOrderUi: true,
            hasActiveLocalWaiter:
                this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId) != null,
            hasNonconfirmedOrder: true,
            autoEndTurn: getAutoEndTurn(),
            blocked: false,
            blockReason: null,
        });
        const confirmed: BattleOrder = { ...order, endTurn: true };
        this.uiState = { ...this.uiState, nonconfirmedOrder: null };
        void this.ctx.session.submitPlayerOrder(confirmed, { canSubmitOrders: this._canUseOrderUi });
        this.emitChange();
    }

    // -------------------------------------------------------------------------
    // UI state helpers (used by tools)

    setCurrentTargets(targets: ResolvedTarget[]): void {
        this.uiState = { ...this.uiState, currentTargets: targets };
        this.emitChange();
    }

    updateNonconfirmedMovement(
        movePath: { col: number; row: number }[],
        moveTargetUnitId: string | undefined,
        moveTargetPixel: { x: number; y: number } | undefined,
    ): void {
        const order = this.uiState.nonconfirmedOrder;
        if (!order || !this.ctx || getAutoEndTurn()) return;
        const updated = { ...order, movePath, moveTargetUnitId, moveTargetPixel };
        this.uiState = { ...this.uiState, nonconfirmedOrder: updated };
        void this.ctx.session.submitPlayerOrder(updated, { canSubmitOrders: this._canUseOrderUi });
        this.emitChange();
    }

    /** Drop UI nonconfirmed order (ITS commit / batch advance). */
    clearNonconfirmedOrder(): void {
        if (this.uiState.nonconfirmedOrder == null) return;
        this.uiState = { ...this.uiState, nonconfirmedOrder: null };
        this.emitChange();
    }

    getUIState(): PlayerInteractionUIState {
        return this.uiState;
    }

    // -------------------------------------------------------------------------
    // Subscription

    subscribe(listener: UIListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    destroy(): void {
        if (this.activeTool && this.ctx) {
            this.activeTool.onDeactivate?.(this.ctx, this);
        }
        this.activeTool = null;
        this.listeners.clear();
    }

    private emitChange(): void {
        for (const l of this.listeners) {
            l();
        }
    }
}

import type { AbilityStatic } from '../../abilities/Ability';
import type { Unit } from '../units/Unit';
import { getAbilityTargets } from '../../abilities/Ability';
import type { BattleOrder, ResolvedTarget, WaitingForOrders } from '../types';
import type { BattleSession } from '../BattleSession';
import type { InteractionTool, PlayerInteractionContext, PlayerInteractionUIState, IPlayerInteractionManager } from './InteractionTool';
import { DefaultTool } from './tools/DefaultTool';
import { AbilityTargetingTool } from './tools/AbilityTargetingTool';
import { UnitSelectorDebugTool } from './tools/UnitSelectorDebugTool';
import { AdminMoveDebugTool } from './tools/AdminMoveDebugTool';
import { getDebugState } from '../../debugState';
import { resolveClick, getInteractiveTargetDefsFromTimings, getSelectTargetDefsFromTimings } from '../../abilities/targeting';
import { getAutoEndTurn } from '../autoEndTurnSetting';
import { isSequentialTargetingEnabled } from '../../featureFlags';
import { getAbility } from '../../abilities/AbilityRegistry';
import { resolveModeAbilityId, resolveSlotMode } from '../../abilities/resolveAbilityMode';
import { TERRAIN_PROPERTIES } from '../../terrain/TerrainType';
import { logOrderUiKeyAction } from './itsLobbyLog';
import {
    getConditionalCancelDecisionCast,
    isAtConditionalCancelDecision,
    isAtFollowUpPreview,
    isAtMissingPickDecision,
    isITSPreviewComplete,
} from './isITSPreviewComplete';
import { canUseAbilityNow } from '../../abilities/abilityUses';
import { getItsSwapBlockReason } from './itsSwap';
import { getRewindTargetUnit, getRewindUnusableCause } from './itsHandView';
import { ONLY_UNDO_AT_START } from '../gameConstants';

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
    /** True from a swap's rewind until it hands over to the new preview; blocks a second swap meanwhile. */
    private _swapInFlight = false;

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
            if (info != null) this.maybeAutoContinueCombo();
        }
    }

    /** The ability a hand slot casts, honouring a mode toggle that swaps the slot to another ability. */
    private resolveSlotAbility(index: number): AbilityStatic | null {
        const slotAbilityId = this.myAbilityIds[index];
        const slotAbility = slotAbilityId ? getAbility(slotAbilityId) : null;
        if (!slotAbility) return null;
        return getAbility(resolveModeAbilityId(slotAbility, this.effectiveAbilityMode(slotAbility.id))) ?? slotAbility;
    }

    /** `${unitId}:${atTick}` of the pause plane the local order UI is at (engine truth, then the pushed one). */
    private comboPlaneKey(unitId: string): string | null {
        const atTick = this.ctx?.engine.waitingForOrders?.atTick ?? this._waitingForOrders?.atTick;
        return atTick == null ? null : `${unitId}:${atTick}`;
    }

    /**
     * Combo auto-continue: at a conditional-cancel pause whose cast asks for it
     * (`conditionalCancelFollowUp === 'same_ability'`), start the same ability's follow-up preview by
     * itself, through the normal `activateAbilityTargeting` Combo follow-up path.
     *
     * Local player's active waiter only, and only while the order UI is usable. Fires at most once per
     * pause plane; the memory lives on the ITS session so Undo / swap back to the plane (which rebuilds
     * this manager) does not restart it. Skipped while the preview must be committed first
     * (`shouldForceItsCommitAtComboWindow`): it then fires on the real combo pause after that commit.
     * Called from `setWaitingForOrders` and from the ITS progress poll when a preview is done.
     */
    maybeAutoContinueCombo(): boolean {
        const ctx = this.ctx;
        if (!ctx || !this._canUseOrderUi || !this._waitingForOrders) return false;
        const its = ctx.session.interactiveTargeting;
        if (its.isCommitInFlight || this._swapInFlight) return false;
        if (this.isAtMissingPickPause()) return false;
        const active = ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(ctx.playerId);
        if (!active) return false;
        const cast = getConditionalCancelDecisionCast(ctx.engine, active.unitId, its);
        if (cast?.conditionalCancelFollowUp !== 'same_ability') return false;
        if (its.shouldForceItsCommitAtComboWindow()) return false;
        const planeKey = this.comboPlaneKey(active.unitId);
        if (planeKey == null || its.hasComboFollowUpStarted?.(planeKey)) return false;
        const caster = ctx.engine.getUnit(active.unitId);
        if (!caster) return false;
        for (let index = 0; index < this.myAbilityIds.length; index++) {
            const ability = this.resolveSlotAbility(index);
            if (!ability || ability.id !== cast.abilityId) continue;
            if (!canUseAbilityNow(caster, ability)) return false;
            // activateAbilityTargeting records the plane once the follow-up actually starts.
            this.activateAbilityTargeting(index, ability);
            return true;
        }
        return false;
    }

    setMyAbilityIds(ids: string[]): void {
        this.myAbilityIds = ids;
    }

    /** BattlePhase supplies per-ability mode selection for order submission. */
    setAbilityModeResolver(resolver: ((abilityId: string) => string | undefined) | null): void {
        this.resolveAbilityMode = resolver;
    }

    /**
     * The mode the slot actually shows/casts (`resolveSlotMode`): the mode picked on the strip, or with no
     * pick the default / its fallback, so orders and previews match the shown card.
     */
    private effectiveAbilityMode(abilityId: string): string | undefined {
        const picked = this.resolveAbilityMode?.(abilityId);
        const slotAbility = getAbility(abilityId);
        if (!slotAbility?.abilityModes) return picked;
        const unit = this.ctx
            ? (() => {
                const active = this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId);
                return (active ? this.ctx.engine.getUnit(active.unitId) : null) ?? this.ctx.engine.getLocalPlayerUnit();
            })()
            : null;
        return unit ? resolveSlotMode(unit, slotAbility, picked) : (picked ?? slotAbility.abilityModes.defaultMode);
    }

    /** Re-submit nonconfirmed order when the player toggles mode mid-targeting. */
    refreshNonconfirmedAbilityMode(abilityId: string): void {
        const order = this.uiState.nonconfirmedOrder;
        if (!order || order.abilityId !== abilityId || !this.ctx) return;
        const mode = this.effectiveAbilityMode(abilityId);
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

    onCanvasRightClick(
        screenX: number,
        screenY: number,
        shiftKey: boolean,
        ctrlKey: boolean,
        previewOnly = false,
    ): void {
        if (!this.ctx) return;
        const tool = this.activeTool;
        if (tool?.onCanvasRightClick) {
            const handled = tool.onCanvasRightClick(screenX, screenY, shiftKey, ctrlKey, this.ctx, this, previewOnly);
            if (handled) return;
        }
        const dt = this.defaultTool as InteractionTool | null;
        dt?.onCanvasRightClick?.(screenX, screenY, shiftKey, ctrlKey, this.ctx, this, previewOnly);
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
            // Use the engine's live light tile grid (updated on light ticks). Do not
            // recompute the full target grid here — that was O(map×sources) per mousemove
            // only to fill a debug tooltip polled at 100ms.
            const lightLevel = engine.getLightAt(col, row);
            const segmentId = engine.terrainManager.getSegmentIdAt(col, row);
            window.__minionBattlesDebugMouse = { worldX: clampedX, worldY: clampedY, row, col, terrainName, lightLevel, segmentId };
        }
    }

    onKeyDown(e: KeyboardEvent): void {
        // Space — confirm/wait
        if (e.code === 'Space' && !e.repeat) {
            e.preventDefault();
            // An ended-early preview at Done has no active order waiter (so no order UI), but Pass commits it.
            if (this.isAtEndedEarlyDone()) {
                this.handleWait();
                return;
            }
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
        // Locked at a missing-pick decision: the owner picks on the canvas or passes (the cast fizzles).
        if (digit > 0 && this._canUseOrderUi && !this.isAtMissingPickPause()) {
            const index = digit - 1;
            if (index < this.myAbilityIds.length) {
                const ability = this.resolveSlotAbility(index);
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

    /**
     * Copy the order-UI inputs the React bridge normally pushes. An ITS rewind rebuilds the manager
     * (`BattleSession.startEngine`) and the bridge only re-pushes on its next render, so a swap
     * hands the old manager's state to the new one synchronously and reads the pause plane from the
     * restored engine.
     */
    adoptOrderUiState(from: {
        canUseOrderUi: boolean;
        myAbilityIds: readonly string[];
        abilityModeResolver: ((abilityId: string) => string | undefined) | null;
    }): void {
        this._canUseOrderUi = from.canUseOrderUi;
        this.myAbilityIds = [...from.myAbilityIds];
        this.resolveAbilityMode = from.abilityModeResolver;
        this.setWaitingForOrders(this.ctx?.engine.waitingForOrders ?? null);
    }

    /**
     * Clicking another ability card (or its number key) while an ITS preview is running: rewind to
     * the preview's mark with the quick `'swap'` rewind, then start the new ability's preview.
     * Gated by {@link getItsSwapBlockReason}; returns false when nothing was done.
     */
    swapItsPreviewAbility(cardIndex: number, ability: AbilityStatic): boolean {
        if (!this.ctx || this._swapInFlight) return false;
        const session = this.ctx.session;
        const its = session.interactiveTargeting;
        // Specials never enter ITS; an uncastable ability would rewind to an instantly-interrupted preview.
        if (ability.actionChannel === 'special') return false;
        // Castability at the rewind target (the mark), the same view the ability bar shows.
        const liveCaster = its.unitId ? (this.ctx.engine.getUnit(its.unitId) ?? null) : null;
        const rewindCaster = getRewindTargetUnit(this.ctx.engine, its, liveCaster);
        if (rewindCaster ? getRewindUnusableCause(rewindCaster, ability) != null
            : liveCaster != null && !canUseAbilityNow(liveCaster, ability)) return false;
        const blockReason = getItsSwapBlockReason({
            itsActive: its.isActive,
            itsAbilityId: its.abilityId ?? null,
            targetAbilityId: ability.id,
            isResumeMode: its.isResumeMode,
            atEndedEarlyDone: this.isAtEndedEarlyDone(),
            isRewindCrossfade: this._swapInFlight,
            onlyUndoAtStart: ONLY_UNDO_AT_START,
            hasCollectedTargets: Object.keys(its.collectedTargets ?? {}).length > 0,
        });
        if (blockReason != null) return false;

        const carried = {
            canUseOrderUi: this._canUseOrderUi,
            myAbilityIds: this.myAbilityIds,
            abilityModeResolver: this.resolveAbilityMode,
        };
        this._swapInFlight = true;
        this.deactivateTool();
        void its.reset(session, 'ui_swap', 'user_swap', 'swap').then(
            () => {
                this._swapInFlight = false;
                // The restore rebuilt the manager; continue on the session's current one.
                const next = session.getInteractionManager?.() ?? this;
                next.adoptOrderUiState(carried);
                next.activateAbilityTargeting(cardIndex, ability);
            },
            () => {
                this._swapInFlight = false;
            },
        );
        return true;
    }

    activateAbilityTargeting(cardIndex: number, ability: AbilityStatic): void {
        // Mid-preview card click = swap. Checked before the pause-plane guard below: during playahead
        // `_waitingForOrders` may be null. A click at a Combo / Entombed pause (a done ITS) keeps the
        // existing conditional-cancel follow-up path.
        if (this.ctx?.session.interactiveTargeting.isActive) {
            const waiter = this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId);
            const atDecision = isAtConditionalCancelDecision(
                this.ctx.engine,
                waiter?.unitId ?? this.ctx.session.interactiveTargeting.unitId,
                this.ctx.session.interactiveTargeting,
            );
            if (!atDecision && !this.isAtMissingPickPause()) {
                this.swapItsPreviewAbility(cardIndex, ability);
                return;
            }
        }
        if (!this._waitingForOrders || !this.ctx) return;
        const active = this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId);
        if (!active) return;
        if (this.isAtMissingPickPause()) return;
        const caster = this.ctx.engine.getUnit(active.unitId) ?? undefined;
        const comboCancelPause = isAtConditionalCancelDecision(
            this.ctx.engine,
            active.unitId,
            this.ctx.session.interactiveTargeting,
        );
        if (comboCancelPause && this.ctx.session.interactiveTargeting.shouldForceItsCommitAtComboWindow()) {
            return;
        }
        // Mirrors executeUnitAbility's gate (e.g. Charged Rock out of uses while its card shows
        // Throw Rock); an uncastable order would only start a preview that is instantly interrupted.
        if (caster && ability.actionChannel !== 'special' && !canUseAbilityNow(caster, ability)) {
            return;
        }

        // A follow-up from a Combo pause starts here (auto or clicked): remember the plane so Undo / swap
        // back to it does not auto-continue again.
        if (comboCancelPause) {
            const planeKey = this.comboPlaneKey(active.unitId);
            if (planeKey != null) this.ctx.session.interactiveTargeting.noteComboFollowUpStarted?.(planeKey);
        }

        // Same card again: toggle off, unless a mode toggle swapped the card to another ability.
        if (this.activeTool instanceof AbilityTargetingTool && this.activeTool.cardIndex === cardIndex) {
            const sameAbility = this.activeTool.ability.id === ability.id;
            this.deactivateTool();
            if (sameAbility) return;
        }

        // Toggle-off: re-selecting the same special clears it from the nonconfirmed order.
        if (
            ability.actionChannel === 'special'
            && this.uiState.nonconfirmedOrder?.specialAction?.abilityId === ability.id
            && !(this.activeTool instanceof AbilityTargetingTool)
        ) {
            this.clearSpecialAction();
            return;
        }

        // A special with nothing to pick (e.g. Guard) submits at once, like a self-cast primary.
        if (ability.actionChannel === 'special' && getAbilityTargets(ability, caster, this.ctx.engine).length === 0) {
            this.submitOrder(ability.id, []);
            return;
        }

        // Specials never enter ITS (zero-frame; no select timings). Combo / Entombed follow-ups do:
        // submitPlayerOrder commits any open ITS at its pause, then begins a new preview.
        if (ability.actionChannel !== 'special') {
            if (
                isSequentialTargetingEnabled()
                && getInteractiveTargetDefsFromTimings(ability, caster, this.ctx.engine).length > 0
            ) {
                this.submitOrder(ability.id, []);
                return;
            }
            // Nothing to click (e.g. Gather Light) submits immediately, with or without playahead.
            // Confirm-radius steps only ask "are you sure" inside ITS, so they do not count here;
            // select steps do (their abilities often have empty static `targets`).
            if (
                getSelectTargetDefsFromTimings(ability, caster, this.ctx.engine).length === 0
                && getAbilityTargets(ability, caster, this.ctx.engine).length === 0
            ) {
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
        const ability = abilityId !== 'wait' ? getAbility(abilityId) : null;
        const isSpecial = ability?.actionChannel === 'special';
        const prev = this.uiState.nonconfirmedOrder;

        let order: BattleOrder;

        if (isSpecial) {
            // Merge into specialAction; keep existing primary (or wait placeholder).
            const primaryId = prev && prev.abilityId !== 'wait' ? prev.abilityId : 'wait';
            const primaryTargets = primaryId !== 'wait' && prev ? prev.targets : [];
            order = {
                unitId: active.unitId,
                abilityId: primaryId,
                targets: primaryTargets,
                ...(prev?.targetsByLabel ? { targetsByLabel: prev.targetsByLabel } : {}),
                ...(prev?.abilityMode ? { abilityMode: prev.abilityMode } : {}),
                ...(prev?.movementByLabel ? { movementByLabel: prev.movementByLabel } : {}),
                movePath: movePath ?? prev?.movePath,
                moveTargetUnitId: moveTargetUnitId ?? prev?.moveTargetUnitId,
                moveTargetPixel: moveTargetPixel ?? prev?.moveTargetPixel,
                specialAction: {
                    abilityId,
                    targets,
                    ...(targetsByLabel && Object.keys(targetsByLabel).length > 0
                        ? { targetsByLabel }
                        : {}),
                },
            };
            // Special alone never auto-ends the turn.
            this.defaultTool?.reset();
            this.uiState = { ...this.uiState, currentTargets: [], nonconfirmedOrder: order };
            void this.ctx.session.submitPlayerOrder(order, { canSubmitOrders: this._canUseOrderUi });
            this.emitChange();
            return;
        }

        const effectiveMode = this.effectiveAbilityMode(abilityId);
        order = {
            unitId: active.unitId,
            abilityId,
            targets,
            movePath: movePath ?? undefined,
            moveTargetUnitId: moveTargetUnitId ?? undefined,
            moveTargetPixel: moveTargetPixel ?? undefined,
            ...(targetsByLabel && Object.keys(targetsByLabel).length > 0 ? { targetsByLabel } : {}),
            ...(effectiveMode !== undefined ? { abilityMode: effectiveMode } : {}),
            // Carry any previously chosen special alongside the primary.
            ...(prev?.specialAction ? { specialAction: prev.specialAction } : {}),
        };

        this.defaultTool?.reset();
        this.uiState = { ...this.uiState, currentTargets: [] };

        // Auto-end-turn applies to primary (and wait), not specials.
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

    /** Clear specialAction from the nonconfirmed order (toggle-off). */
    clearSpecialAction(): void {
        const prev = this.uiState.nonconfirmedOrder;
        if (!prev?.specialAction || !this.ctx) return;
        // Keep the key present so OrderManager's in-place merge clears the field.
        const updated: BattleOrder = { ...prev, specialAction: undefined };
        // If only wait + special remained, drop the whole nonconfirmed order via cancel sentinel.
        if (updated.abilityId === 'wait' && !updated.movePath?.length) {
            this.uiState = { ...this.uiState, nonconfirmedOrder: null };
            void this.ctx.session.submitPlayerOrder(
                { unitId: prev.unitId, abilityId: 'wait', targets: [], endTurn: false },
                { canSubmitOrders: this._canUseOrderUi },
            );
        } else {
            this.uiState = { ...this.uiState, nonconfirmedOrder: updated };
            void this.ctx.session.submitPlayerOrder(updated, { canSubmitOrders: this._canUseOrderUi });
        }
        this.emitChange();
    }

    /**
     * True when the local player's active waiter is at a missing-pick pause (its cast has
     * `awaitingPickLabel`), or its ITS resume preview is running. Abilities are locked there; Pass fizzles.
     */
    private isAtMissingPickPause(): boolean {
        if (!this.ctx) return false;
        if (this.ctx.session.interactiveTargeting.isResumeMode) return true;
        const active = this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId);
        return isAtMissingPickDecision(this.ctx.engine, active?.unitId);
    }

    /**
     * True when an ITS preview whose cast ended early (interrupt / fizzle / death) has reached its stop
     * point (Done). Pass then commits that timeline (used when Undo is allowed, so it did not auto-commit).
     */
    private isAtEndedEarlyDone(): boolean {
        if (!this.ctx) return false;
        const its = this.ctx.session.interactiveTargeting;
        if (!its.isActive) return false;
        if (its.getPreviewCastEndedEarly?.(this.ctx.engine) == null) return false;
        return isITSPreviewComplete(this.ctx.engine);
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
        // Pass at a missing-pick decision: end any resume preview (back to the pause), then submit `wait`
        // for the batch. The cast keeps running, enters the select with the pick still missing and fizzles.
        if (this.ctx && this.isAtMissingPickPause()) {
            if (!this._canUseOrderUi || !this._waitingForOrders) {
                logWait(true, !this._canUseOrderUi ? 'can_use_order_ui_false' : 'no_waiting_for_orders_ui');
                return;
            }
            logWait(false, 'missing_pick_pass');
            const session = this.ctx.session;
            this.deactivateTool();
            void session.interactiveTargeting.reset(session, 'ui_reset').then(() => {
                this.submitOrder('wait', []);
            });
            return;
        }
        // Pass at the stop point of an ended-early preview commits that timeline.
        if (this.ctx && this.isAtEndedEarlyDone()) {
            logWait(false, 'ended_early_pass_commit');
            void this.ctx.session.interactiveTargeting.commit(this.ctx.session, 'pass_ended_early');
            return;
        }
        if (this.ctx?.session.interactiveTargeting.isActive) {
            const active = this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId);
            if (isAtConditionalCancelDecision(this.ctx.engine, active?.unitId, this.ctx.session.interactiveTargeting)) {
                if (this.ctx.session.interactiveTargeting.shouldForceItsCommitAtComboWindow()) {
                    logWait(true, 'its_combo_after_assumed_pass');
                    void this.ctx.session.interactiveTargeting.commit(
                        this.ctx.session,
                        'combo_window_after_assumed_pass',
                    );
                    return;
                }
                void this.ctx.session.interactiveTargeting
                    .commit(this.ctx.session, 'conditional_cancel_continue')
                    .then(() => {
                        if (!this.ctx?.session.interactiveTargeting.isActive) {
                            this.deactivateTool();
                            this.submitOrder('wait', []);
                        }
                    });
                return;
            }
            // Pass in a follow-up preview: rewind to the combo pause (quick 'swap' rewind), then continue
            // the paused cast with `wait` (the same end state as Pass at the decision).
            if (isAtFollowUpPreview(this.ctx.session.interactiveTargeting)) {
                this.passFromFollowUpPreview(logWait);
                return;
            }
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
        this.confirmPendingClientOrders();
    }

    /**
     * Pass during a follow-up preview. `reset` rebuilds this manager (`BattleSession.startEngine`), so the
     * `wait` is submitted on the session's current manager after carrying the order-UI state across, as
     * `swapItsPreviewAbility` does. The plane memory on the ITS session stops auto-continue restarting the preview.
     */
    private passFromFollowUpPreview(logWait: (blocked: boolean, blockReason: string | null) => void): void {
        if (!this.ctx || this._swapInFlight) return;
        if (!this._canUseOrderUi) {
            logWait(true, 'can_use_order_ui_false');
            return;
        }
        logWait(false, 'follow_up_preview_pass');
        const session = this.ctx.session;
        const carried = {
            canUseOrderUi: this._canUseOrderUi,
            myAbilityIds: this.myAbilityIds,
            abilityModeResolver: this.resolveAbilityMode,
        };
        this._swapInFlight = true;
        this.deactivateTool();
        void session.interactiveTargeting.reset(session, 'ui_reset', 'user_reset', 'swap').then(
            () => {
                this._swapInFlight = false;
                const next = session.getInteractionManager?.() ?? this;
                next.adoptOrderUiState(carried);
                next.submitOrder('wait', []);
            },
            () => {
                this._swapInFlight = false;
            },
        );
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
        if (!this._canUseOrderUi || !this.ctx) {
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
                    blockReason: !this._canUseOrderUi ? 'can_use_order_ui_false' : 'no_context',
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
            hasNonconfirmedOrder: order != null,
            autoEndTurn: getAutoEndTurn(),
            blocked: false,
            blockReason: null,
        });
        this.confirmPendingClientOrders();
    }

    /**
     * Snapshot right-click / nonconfirmed movement so Wait/Space can attach it even if
     * {@link DefaultTool} was reset (e.g. a waitingForOrders seed) before the keyup.
     */
    private snapshotPendingMovement(unit: Unit | undefined): {
        movePath?: { col: number; row: number }[];
        moveTargetUnitId?: string;
        moveTargetPixel?: { x: number; y: number };
    } {
        const tool = this.defaultTool;
        if (tool?.pendingMovePath && tool.pendingMovePath.length > 0) {
            return {
                movePath: tool.pendingMovePath.map((p) => ({ ...p })),
                ...(tool.pendingMoveTargetUnitId ? { moveTargetUnitId: tool.pendingMoveTargetUnitId } : {}),
                ...(tool.pendingMoveTargetPixel ? { moveTargetPixel: { ...tool.pendingMoveTargetPixel } } : {}),
            };
        }
        const fromOrder = this.uiState.nonconfirmedOrder;
        if (fromOrder?.movePath && fromOrder.movePath.length > 0) {
            return {
                movePath: fromOrder.movePath.map((p) => ({ ...p })),
                ...(fromOrder.moveTargetUnitId ? { moveTargetUnitId: fromOrder.moveTargetUnitId } : {}),
                ...(fromOrder.moveTargetPixel ? { moveTargetPixel: { ...fromOrder.moveTargetPixel } } : {}),
            };
        }
        if (unit?.movement && unit.movement.path.length > 0) {
            return {
                movePath: unit.movement.path.map((p) => ({ ...p })),
                ...(unit.movement.targetUnitId ? { moveTargetUnitId: unit.movement.targetUnitId } : {}),
                ...(unit.movement.targetPixel ? { moveTargetPixel: { ...unit.movement.targetPixel } } : {}),
            };
        }
        if (unit?.walkIntent) {
            return {
                movePath: [{ ...unit.walkIntent.dest }],
                ...(unit.walkIntent.targetUnitId ? { moveTargetUnitId: unit.walkIntent.targetUnitId } : {}),
                ...(unit.walkIntent.targetPixel ? { moveTargetPixel: { ...unit.walkIntent.targetPixel } } : {}),
            };
        }
        return {};
    }

    /**
     * End the turn with whatever is already planned locally: nonconfirmed ability/special
     * plus right-click movement (DefaultTool, nonconfirmed order, or unit.movement).
     */
    private confirmPendingClientOrders(): void {
        if (!this.ctx || !this._waitingForOrders || !this._canUseOrderUi) return;
        const active = this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId);
        if (!active) return;

        const unit = this.ctx.engine.getUnit(active.unitId);
        const move = this.snapshotPendingMovement(unit);
        const prev = this.uiState.nonconfirmedOrder;
        const hasPrimary = prev != null && prev.abilityId !== 'wait';
        const order: BattleOrder = {
            unitId: active.unitId,
            abilityId: hasPrimary ? prev.abilityId : 'wait',
            targets: hasPrimary ? prev.targets : (prev?.targets ?? []),
            ...(prev?.targetsByLabel ? { targetsByLabel: prev.targetsByLabel } : {}),
            ...(prev?.abilityMode ? { abilityMode: prev.abilityMode } : {}),
            ...(prev?.movementByLabel ? { movementByLabel: prev.movementByLabel } : {}),
            ...(prev?.specialAction ? { specialAction: prev.specialAction } : {}),
            ...move,
            endTurn: true,
        };

        this.defaultTool?.reset();
        this.uiState = { ...this.uiState, nonconfirmedOrder: null };
        void this.ctx.session.submitPlayerOrder(order, { canSubmitOrders: this._canUseOrderUi });
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
        if (!this.ctx || !this._waitingForOrders) return;
        const active = this.ctx.engine.state.orderMgr.getActiveOrderWaiterForPlayer(this.ctx.playerId);
        if (!active) return;

        const order = this.uiState.nonconfirmedOrder;
        const updated: BattleOrder = order
            ? { ...order, movePath, moveTargetUnitId, moveTargetPixel }
            : {
                unitId: active.unitId,
                abilityId: 'wait',
                targets: [],
                movePath,
                moveTargetUnitId,
                moveTargetPixel,
            };
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

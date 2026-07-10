import type { AbilityStatic } from '../../../abilities/Ability';
import { getAbility } from '../../../abilities/AbilityRegistry';
import type { BattleSession } from '../../../game/BattleSession';
import type { WaitingForOrders, BattleOrder, GhostPlanData } from '../../../game/types';

/** Snapshot of targeting/preview state read synchronously by BattleCanvas's render-loop each frame. */
export interface BattleTargetingState {
    selectedAbility: AbilityStatic | null;
    currentTargets: readonly { type: string; unitId?: string; position?: { x: number; y: number } }[];
    mouseWorld: { x: number; y: number };
    waitingForOrders: WaitingForOrders | null;
    /** Caster unit for targeting preview (parallel batch active local unit). */
    previewOrderUnitId: string | null;
    ghostPlans?: Record<string, GhostPlanData>;
    /** Nonconfirmed order (submitted to engine without endTurn: true). Used for stable ghost plan broadcast. */
    nonconfirmedOrder: BattleOrder | null;
}

/**
 * Fresh empty targeting-state object. Must be called (not shared) — `handleCanvasMouseMove`
 * mutates `.current.mouseWorld` in place between renders.
 */
export function createEmptyTargetingState(): BattleTargetingState {
    return {
        selectedAbility: null,
        currentTargets: [],
        mouseWorld: { x: 0, y: 0 },
        waitingForOrders: null,
        previewOrderUnitId: null,
        nonconfirmedOrder: null,
    };
}

/**
 * Computed in the component body so it's always current before each render.
 * BattleCanvas reads targetingStateRef.current.selectedAbility to suppress drag-to-pan.
 */
export function computeTargetingState(
    session: BattleSession | null,
    inputs: {
        waitingForOrders: WaitingForOrders | null;
        activeLocalWaiterUnitId: string | null;
        ghostPlans: Record<string, GhostPlanData> | undefined;
    },
): BattleTargetingState {
    const { waitingForOrders, activeLocalWaiterUnitId, ghostPlans } = inputs;

    const itsManager = session?.getInteractionManager();
    const itsUiState = itsManager?.getUIState();
    const its = session?.interactiveTargeting;
    const itsActive = its?.isActive ?? false;
    const itsAbilityId = itsActive && its ? its.abilityId : null;
    const itsUnitId = itsActive && its ? its.unitId : null;
    const itsAbility = itsAbilityId ? getAbility(itsAbilityId) : null;
    // Only show the targeting cursor when the engine is actually paused waiting for an input.
    const itsWaitingForTarget = itsActive
        ? (session?.getEngine()?.waitingForTargetInput ?? null)
        : null;
    const itsShowCursor = itsActive && itsWaitingForTarget !== null;
    const itsCurrentTargets = itsShowCursor && its
        ? Object.values(its.collectedTargets)
        : null;

    return {
        selectedAbility: itsShowCursor && itsAbility ? itsAbility : (itsUiState?.selectedAbility ?? null),
        currentTargets: itsShowCursor && itsCurrentTargets !== null
            ? itsCurrentTargets
            : (itsUiState?.currentTargets ?? []),
        mouseWorld: itsUiState?.mouseWorld ?? { x: 0, y: 0 },
        waitingForOrders,
        previewOrderUnitId: itsActive && itsUnitId ? itsUnitId : (itsUiState?.previewOrderUnitId ?? activeLocalWaiterUnitId ?? null),
        ghostPlans,
        nonconfirmedOrder: itsUiState?.nonconfirmedOrder ?? null,
    };
}

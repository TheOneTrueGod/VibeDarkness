import type { AbilityStatic } from '../../abilities/Ability';
import { getAbility } from '../../abilities/AbilityRegistry';
import {
    resolveClick,
    getSelectTargetDefsFromTimings,
    getInteractiveTargetDefsFromTimings,
    buildMeleeSelectOrderTargets,
    clampSelectTarget,
    resolveSelectTargetCompanionLockOns,
    resolveSelectTargetLockOnCandidates,
} from '../../abilities/targeting';
import type { InteractiveTargetDef, SelectTargetDef } from '../../abilities/timingTargetDef';
import { isConfirmRadiusTargetDef, isSelectTargetDef } from '../../abilities/timingTargetDef';
import { buildPlayerMovePathThroughWaypoints } from '../../terrain/playerMovePath';
import type { Unit } from '../units/Unit';
import type { ResolvedTarget } from '../types';
import type { GameEngine } from '../GameEngine';
import type { BattleSession } from '../BattleSession';
import { isCasterInConditionalCancelPause } from './isITSPreviewComplete';

export interface ItsSelectTargetResolution {
    labelTarget: ResolvedTarget;
    resolved: ResolvedTarget;
    orderTargets: ResolvedTarget[];
}

/**
 * Pure select-target resolution for an ITS canvas click (no camera/session).
 * Returns null when the click cannot resolve (e.g. miss with allowMiss === false).
 */
export function resolveItsSelectTargetForClick(
    abilityDef: AbilityStatic,
    caster: Unit,
    selectDef: SelectTargetDef,
    mouseWorld: { x: number; y: number },
    clickWorldPos: { x: number; y: number },
    collectedTargets: Record<string, ResolvedTarget>,
    engine: GameEngine,
): ItsSelectTargetResolution | null {
    const candidates = resolveSelectTargetLockOnCandidates(
        abilityDef,
        caster,
        selectDef,
        mouseWorld,
        engine,
    );
    const companionUnits = resolveSelectTargetCompanionLockOns(
        abilityDef,
        caster,
        selectDef,
        mouseWorld,
        engine,
        candidates,
    );
    let resolved: ResolvedTarget | null = null;
    if (candidates.length > 0) {
        resolved = { type: 'unit', unitId: candidates[0]!.id };
    } else if (selectDef.allowMiss !== false) {
        resolved = { type: 'pixel', position: clickWorldPos };
    }
    if (!resolved) {
        return null;
    }
    const selectDefs = getSelectTargetDefsFromTimings(abilityDef, caster, engine);
    const collectedOrdered = selectDefs
        .map((d) => collectedTargets[d.label])
        .filter((t): t is ResolvedTarget => t != null);
    resolved = clampSelectTarget(
        abilityDef,
        caster,
        selectDef,
        collectedTargets,
        collectedOrdered,
        resolved,
        engine,
    );
    const numTargets = selectDef.numTargets ?? selectDef.hitbox.numTargets;
    const lockOnCandidates = candidates.map((u) => ({ unitId: u.id }));
    const companionCandidates = companionUnits.map((u) => ({ unitId: u.id }));
    const labelTarget: ResolvedTarget = lockOnCandidates.length > 0
        ? { type: 'unit', unitId: lockOnCandidates[0]!.unitId }
        : resolved;
    const orderTargets = buildMeleeSelectOrderTargets(
        resolved,
        lockOnCandidates,
        clickWorldPos,
        numTargets,
        companionCandidates,
    );
    return { labelTarget, resolved, orderTargets };
}

/** Confirm-radius: any click (when allowMiss !== false) stores a dummy pixel; geometry unchanged. */
export function resolveItsConfirmRadiusForClick(
    def: InteractiveTargetDef & { kind: 'confirmRadius' },
    clickWorldPos: { x: number; y: number },
): ItsSelectTargetResolution | null {
    if (def.allowMiss === false) return null;
    const resolved: ResolvedTarget = { type: 'pixel', position: clickWorldPos };
    return { labelTarget: resolved, resolved, orderTargets: [resolved] };
}

/**
 * Combo/Entombed follow-up uses AbilityTargetingTool while ITS preview may still be active
 * (before in-place commit). Defer canvas input to the order UI instead of swallowing clicks.
 */
export function shouldDeferItsCanvasInputToOrderUi(
    engine: GameEngine | null | undefined,
    its: { isActive: boolean; unitId: string | null },
): boolean {
    if (!its.isActive || !engine || engine.waitingForTargetInput != null) {
        return false;
    }
    if (!its.unitId) return false;
    return isCasterInConditionalCancelPause(engine.getUnit(its.unitId));
}

/** Returns true iff ITS is active (swallows the click even when engine/camera/waitingSignal are missing). */
export function handleItsCanvasClick(
    session: BattleSession,
    screenX: number,
    screenY: number,
): boolean {
    const its = session.interactiveTargeting;
    if (!its.isActive) {
        return false;
    }
    const engine = session.getEngine();
    if (shouldDeferItsCanvasInputToOrderUi(engine, its)) {
        return false;
    }
    const camera = session.getCamera();
    const waitingSignal = engine?.waitingForTargetInput;
    if (engine && camera && waitingSignal) {
        const label = waitingSignal.label;
        const caster = engine.getUnit(waitingSignal.unitId);
        const abilityDef = its.abilityId ? getAbility(its.abilityId) : null;
        const clickResult = resolveClick(screenX, screenY, camera, engine.units);
        if (caster && abilityDef) {
            const interactiveDefs = getInteractiveTargetDefsFromTimings(abilityDef, caster, engine);
            const interactiveDef = interactiveDefs.find((d) => d.label === label);
            if (interactiveDef) {
                const mouseWorld = camera.screenToWorld(screenX, screenY);
                let resolution: ItsSelectTargetResolution | null = null;
                if (isConfirmRadiusTargetDef(interactiveDef)) {
                    resolution = resolveItsConfirmRadiusForClick(interactiveDef, clickResult.worldPosition);
                } else if (isSelectTargetDef(interactiveDef)) {
                    resolution = resolveItsSelectTargetForClick(
                        abilityDef,
                        caster,
                        interactiveDef,
                        mouseWorld,
                        clickResult.worldPosition,
                        its.collectedTargets,
                        engine,
                    );
                }
                if (resolution) {
                    its.resolveTarget(
                        label,
                        resolution.labelTarget,
                        session,
                        resolution.orderTargets,
                    );
                }
            }
        }
    }
    return true;
}

/** Returns true iff ITS is active (swallows the right-click even when prerequisites are missing). */
export function handleItsCanvasRightClick(
    session: BattleSession,
    screenX: number,
    screenY: number,
    _shiftKey: boolean,
    ctrlKey: boolean,
): boolean {
    const its = session.interactiveTargeting;
    if (!its.isActive) {
        return false;
    }
    const engine = session.getEngine();
    if (shouldDeferItsCanvasInputToOrderUi(engine, its)) {
        return false;
    }
    const camera = session.getCamera();
    const waitingSignal = engine?.waitingForTargetInput;
    if (engine && camera && waitingSignal && engine.terrainManager) {
        const label = waitingSignal.label;
        const caster = engine.getUnit(waitingSignal.unitId);
        if (caster) {
            const grid = engine.terrainManager.grid;
            const worldPos = camera.screenToWorld(screenX, screenY);
            const clampedX = Math.max(0, Math.min(worldPos.x, engine.getWorldWidth()));
            const clampedY = Math.max(0, Math.min(worldPos.y, engine.getWorldHeight()));
            const unitGrid = grid.worldToGrid(caster.x, caster.y);
            if (ctrlKey) {
                const destGrid = grid.worldToGrid(clampedX, clampedY);
                const fullPath = buildPlayerMovePathThroughWaypoints(engine.terrainManager, unitGrid.col, unitGrid.row, [destGrid]);
                if (fullPath !== null) {
                    its.resolveMovement(label, { movePath: fullPath, moveTargetPixel: { x: clampedX, y: clampedY } }, session);
                }
            } else {
                const destGrid = grid.worldToGrid(clampedX, clampedY);
                const fullPath = buildPlayerMovePathThroughWaypoints(engine.terrainManager, unitGrid.col, unitGrid.row, [destGrid]);
                if (fullPath !== null) {
                    its.resolveMovement(label, { movePath: fullPath }, session);
                }
            }
        }
    }
    return true;
}

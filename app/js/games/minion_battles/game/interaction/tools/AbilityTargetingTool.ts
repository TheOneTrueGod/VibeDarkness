import {
    resolveClick,
    getSelectTargetDefsFromTimings,
    buildMeleeSelectOrderTargets,
    clampSelectTarget,
    clampResolvedTargetToAbilityRange,
    resolveSelectTargetLockOnCandidates,
} from '../../../abilities/targeting';
import { getAbilityTargets } from '../../../abilities/Ability';
import type { ResolvedTarget } from '../../types';
import type { InteractionTool, PlayerInteractionContext, IPlayerInteractionManager } from '../InteractionTool';
import type { AbilityStatic } from '../../../abilities/Ability';

type LockOnCache = {
    targetIdx: number;
    mouseWorldPos: { x: number; y: number };
    /** All highlighted candidates sorted by proximity to mouse, up to hitbox numTargets. */
    allCandidates: Array<{ unitId: string }>;
};

/**
 * Multi-step click targeting for ability use.
 * Prefers per-timing SelectTargetDef; falls back to classic `ability.targets` (pixel/unit).
 */
export class AbilityTargetingTool implements InteractionTool {
    private currentTargets: ResolvedTarget[] = [];
    private targetsByLabel: Record<string, ResolvedTarget> = {};
    private lockOnCache: LockOnCache | null = null;

    constructor(
        public readonly ability: AbilityStatic,
        public readonly cardIndex: number,
        public readonly casterUnitId: string,
    ) {}

    onCanvasClick(
        screenX: number,
        screenY: number,
        ctx: PlayerInteractionContext,
        manager: IPlayerInteractionManager,
    ): boolean {
        const { engine, camera } = ctx;

        const clickResult = resolveClick(screenX, screenY, camera, engine.units);
        const targetIndex = this.currentTargets.length;
        const caster = engine.getUnit(this.casterUnitId) ?? undefined;

        const selectTargetDefs = getSelectTargetDefsFromTimings(this.ability, caster, engine);
        if (selectTargetDefs.length > 0) {
            const selectDef = selectTargetDefs[targetIndex];
            if (!selectDef) return true;

            const cache = this.lockOnCache;
            const allCandidates = cache?.targetIdx === targetIndex ? (cache.allCandidates ?? []) : [];
            const numTargets = selectDef.numTargets ?? selectDef.hitbox.numTargets;

            let resolved: ResolvedTarget;
            if (allCandidates.length > 0) {
                resolved = { type: 'unit', unitId: allCandidates[0]!.unitId };
            } else if (selectDef.allowMiss !== false) {
                resolved = { type: 'pixel', position: clickResult.worldPosition };
            } else {
                return true;
            }

            if (caster) {
                resolved = clampSelectTarget(
                    this.ability,
                    caster,
                    selectDef,
                    this.targetsByLabel,
                    this.currentTargets,
                    resolved,
                    engine,
                );
            }

            // `newTargets` tracks one entry per click step so the next targetIndex is correct.
            const newTargets = [...this.currentTargets, resolved];
            const labelTarget: ResolvedTarget = allCandidates.length > 0
                ? { type: 'unit', unitId: allCandidates[0]!.unitId }
                : resolved;
            const newTargetsByLabel = { ...this.targetsByLabel, [selectDef.label]: labelTarget };
            this.currentTargets = newTargets;
            this.targetsByLabel = newTargetsByLabel;
            manager.setCurrentTargets(newTargets);

            if (newTargets.length >= selectTargetDefs.length) {
                const orderTargets = buildMeleeSelectOrderTargets(
                    resolved,
                    allCandidates,
                    clickResult.worldPosition,
                    numTargets,
                );
                manager.submitOrder(this.ability.id, orderTargets, newTargetsByLabel);
                manager.deactivateTool();
            }
            return true;
        }

        // Classic ability.targets (e.g. charge ground-aim, legacy unit lock-on).
        const staticTargets = getAbilityTargets(this.ability, caster, engine);
        if (staticTargets.length === 0) {
            manager.submitOrder(this.ability.id, []);
            manager.deactivateTool();
            return true;
        }

        const targetDef = staticTargets[targetIndex];
        if (!targetDef) return true;

        const tType = targetDef.type ?? 'pixel';
        let resolved: ResolvedTarget | null = null;
        if (tType === 'pixel') {
            resolved = { type: 'pixel', position: { ...clickResult.worldPosition } };
        } else if (tType === 'unit') {
            if (!clickResult.unit) return true;
            resolved = { type: 'unit', unitId: clickResult.unit.id };
        } else if (tType === 'player') {
            if (!clickResult.unit) return true;
            resolved = {
                type: 'player',
                playerId: clickResult.unit.ownerId,
                unitId: clickResult.unit.id,
            };
        }
        if (!resolved) return true;

        if (caster) {
            resolved = clampResolvedTargetToAbilityRange(
                this.ability,
                caster,
                resolved,
                engine,
            );
        }

        const newTargets = [...this.currentTargets, resolved];
        this.currentTargets = newTargets;
        manager.setCurrentTargets(newTargets);

        if (newTargets.length >= staticTargets.length) {
            manager.submitOrder(this.ability.id, newTargets);
            manager.deactivateTool();
        }
        return true;
    }

    onCanvasMouseMove(
        screenX: number,
        screenY: number,
        ctx: PlayerInteractionContext,
        _manager: IPlayerInteractionManager,
    ): boolean {
        const { engine, camera } = ctx;
        const worldPos = camera.screenToWorld(screenX, screenY);
        const targetIndex = this.currentTargets.length;
        const caster = engine.getUnit(this.casterUnitId) ?? undefined;

        // New-style: check per-timing SelectTargetDef first
        const selectTargetDefs = getSelectTargetDefsFromTimings(this.ability, caster, engine);
        if (selectTargetDefs.length > 0) {
            const selectDef = selectTargetDefs[targetIndex];
            if (selectDef) {
                const cache = this.lockOnCache;
                const cacheStale =
                    !cache ||
                    cache.targetIdx !== targetIndex ||
                    Math.sqrt(
                        (worldPos.x - cache.mouseWorldPos.x) ** 2 +
                            (worldPos.y - cache.mouseWorldPos.y) ** 2,
                    ) > 2;
                if (cacheStale) {
                    if (caster) {
                        const hitUnits = resolveSelectTargetLockOnCandidates(
                            this.ability,
                            caster,
                            selectDef,
                            worldPos,
                            engine,
                        );
                        this.lockOnCache = {
                            targetIdx: targetIndex,
                            mouseWorldPos: { x: worldPos.x, y: worldPos.y },
                            allCandidates: hitUnits.map((u) => ({ unitId: u.id })),
                        };
                    } else {
                        this.lockOnCache = null;
                    }
                }
            } else {
                this.lockOnCache = null;
            }
            return false;
        }

        return false;
    }

    onDeactivate(): void {
        this.currentTargets = [];
        this.targetsByLabel = {};
        this.lockOnCache = null;
    }
}

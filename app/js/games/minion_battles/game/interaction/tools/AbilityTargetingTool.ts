import {
    resolveClick,
    getSelectTargetDefsFromTimings,
    buildMeleeSelectOrderTargets,
    clampResolvedTargetToAbilityRange,
    resolveSelectTargetLockOnCandidates,
} from '../../../abilities/targeting';
import type { ResolvedTarget } from '../../types';
import type { InteractionTool, PlayerInteractionContext, IPlayerInteractionManager } from '../InteractionTool';
import type { AbilityStatic } from '../../../abilities/Ability';

type LockOnCache = {
    targetIdx: number;
    mouseWorldPos: { x: number; y: number };
    /** All highlighted candidates sorted by proximity to mouse, up to hitbox numTargets. */
    allCandidates: Array<{ unitId: string }>;
};

/** Multi-step click targeting for ability use (new-style SelectTargetDef). */
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
                resolved = clampResolvedTargetToAbilityRange(
                    this.ability,
                    caster,
                    resolved,
                    engine,
                );
            }

            // `newTargets` tracks one entry per click step so the next targetIndex is correct.
            const newTargets = [...this.currentTargets, resolved];
            const newTargetsByLabel = { ...this.targetsByLabel, [selectDef.label]: resolved };
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

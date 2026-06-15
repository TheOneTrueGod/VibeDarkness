import type { AbilityStatic } from '../../../abilities/Ability';
import { getAbilityTargets } from '../../../abilities/Ability';
import {
    resolveClick,
    validateAndResolveTarget,
    getSelectTargetDefsFromTimings,
    filterSelectTargetCandidates,
} from '../../../abilities/targeting';
import { resolveHitbox } from '../../../abilities/hitboxDef';
import type { ResolvedTarget } from '../../types';
import type { InteractionTool, PlayerInteractionContext, IPlayerInteractionManager } from '../InteractionTool';

type LockOnCache = {
    targetIdx: number;
    mouseWorldPos: { x: number; y: number };
    candidate: { unitId: string } | null;
    /** All highlighted candidates sorted by proximity to mouse, up to hitbox numTargets. */
    allCandidates: Array<{ unitId: string }>;
};

/** Multi-step click targeting for ability use (new-style SelectTargetDef and legacy). */
export class AbilityTargetingTool implements InteractionTool {
    private currentTargets: ResolvedTarget[] = [];
    private targetsByLabel: Record<string, ResolvedTarget> = {};
    private lockOnCache: LockOnCache | null = null;

    constructor(
        public readonly ability: AbilityStatic,
        public readonly cardIndex: number,
        public readonly casterUnitId: string,
    ) {}

    getLockOnCache(): LockOnCache | null {
        return this.lockOnCache;
    }

    onCanvasClick(
        screenX: number,
        screenY: number,
        ctx: PlayerInteractionContext,
        manager: IPlayerInteractionManager,
    ): boolean {
        const { engine, camera } = ctx;

        const clickResult = resolveClick(screenX, screenY, camera, engine.units);
        const targetIndex = this.currentTargets.length;

        // --- New-style: per-timing SelectTargetDef ---
        const selectTargetDefs = getSelectTargetDefsFromTimings(this.ability);
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

            // `newTargets` tracks one entry per click step so the next targetIndex is correct.
            const newTargets = [...this.currentTargets, resolved];
            const newTargetsByLabel = { ...this.targetsByLabel, [selectDef.label]: resolved };
            this.currentTargets = newTargets;
            this.targetsByLabel = newTargetsByLabel;
            manager.setCurrentTargets(newTargets);

            if (newTargets.length >= selectTargetDefs.length) {
                // Build the order's targets array. For multi-target hitboxes we append:
                //   1. Additional lock-on units (candidates 1..numTargets-1) so MeleeAttack
                //      can guarantee all highlighted units, not just the primary.
                //   2. The raw click world position as a pixel entry so MeleeAttack can
                //      preserve the player's original swing direction at impact time.
                let orderTargets = newTargets;
                if (allCandidates.length > 0) {
                    const additionalLockOns: ResolvedTarget[] = allCandidates
                        .slice(1, numTargets)
                        .map((c) => ({ type: 'unit' as const, unitId: c.unitId }));
                    const aimPixelEntry: ResolvedTarget = {
                        type: 'pixel',
                        position: clickResult.worldPosition,
                    };
                    orderTargets = [...newTargets, ...additionalLockOns, aimPixelEntry];
                }
                manager.submitOrder(this.ability.id, orderTargets, newTargetsByLabel);
                manager.deactivateTool();
            }
            return true;
        }

        // --- Legacy: ability-level targets[] ---
        const caster = engine.getUnit(this.casterUnitId);
        const resolvedTargets = getAbilityTargets(this.ability, caster, engine);
        const targetDef = resolvedTargets[targetIndex];
        if (!targetDef) return true;

        let resolved: ResolvedTarget | null;

        if (targetDef.lockOn) {
            const cache = this.lockOnCache;
            const candidate = cache?.targetIdx === targetIndex ? cache.candidate : null;
            if (candidate) {
                resolved = { type: 'unit', unitId: candidate.unitId };
            } else if (targetDef.lockOn.allowMiss !== false) {
                // allowMiss defaults to true — fall back to pixel
                resolved = { type: 'pixel', position: clickResult.worldPosition };
            } else {
                // allowMiss: false with no candidate — block the click
                return true;
            }
        } else {
            resolved = validateAndResolveTarget(targetDef, clickResult);
            if (!resolved) return true;
        }

        const newTargets = [...this.currentTargets, resolved];
        this.currentTargets = newTargets;
        manager.setCurrentTargets(newTargets);

        if (newTargets.length >= resolvedTargets.length) {
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

        // New-style: check per-timing SelectTargetDef first
        const selectTargetDefs = getSelectTargetDefsFromTimings(this.ability);
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
                    const caster = engine.getUnit(this.casterUnitId);
                    if (caster) {
                        const rawHitUnits = selectDef.hitbox.resolveTargets(caster, worldPos, engine.units);
                        const hitUnits = filterSelectTargetCandidates(rawHitUnits, caster, selectDef.filter);
                        hitUnits.sort((a, b) => {
                            const da = (a.x - worldPos.x) ** 2 + (a.y - worldPos.y) ** 2;
                            const db = (b.x - worldPos.x) ** 2 + (b.y - worldPos.y) ** 2;
                            return da - db;
                        });
                        const maxCandidates = selectDef.numTargets ?? selectDef.hitbox.numTargets;
                        this.lockOnCache = {
                            targetIdx: targetIndex,
                            mouseWorldPos: { x: worldPos.x, y: worldPos.y },
                            candidate: hitUnits[0] ? { unitId: hitUnits[0].id } : null,
                            allCandidates: hitUnits.slice(0, maxCandidates).map((u) => ({ unitId: u.id })),
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

        // Legacy: ability-level targets[] with lockOn
        const caster = engine.getUnit(this.casterUnitId);
        const resolvedTargets = getAbilityTargets(this.ability, caster ?? undefined, engine);
        const targetDef = resolvedTargets[targetIndex];
        if (targetDef?.lockOn) {
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
                    const hitUnits = resolveHitbox(targetDef.lockOn.hitbox, {
                        engine: engine as unknown as import('../../../hitboxes/Hitbox').HitboxEngineContext,
                        caster,
                        originX: caster.x,
                        originY: caster.y,
                        aimX: worldPos.x,
                        aimY: worldPos.y,
                    });
                    hitUnits.sort((a, b) => {
                        const da = (a.x - worldPos.x) ** 2 + (a.y - worldPos.y) ** 2;
                        const db = (b.x - worldPos.x) ** 2 + (b.y - worldPos.y) ** 2;
                        return da - db;
                    });
                    this.lockOnCache = {
                        targetIdx: targetIndex,
                        mouseWorldPos: { x: worldPos.x, y: worldPos.y },
                        candidate: hitUnits[0] ? { unitId: hitUnits[0].id } : null,
                        allCandidates: [],
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

    onDeactivate(): void {
        this.currentTargets = [];
        this.targetsByLabel = {};
        this.lockOnCache = null;
    }
}

/**
 * pet_engage — Chase the locked target and attack it.
 *
 * Prefers any owned ability with aiSettings that is usable and in range (e.g. Fling Thorn
 * from Mimic Thorn research). Falls back to basicAttackAbilityId (Dog Bite) otherwise.
 * Backs off to pet_return when too far from the owner, retreats to pet_heel when heeled,
 * and falls back to pet_follow when the target dies.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { PetAITreeContext, PetNodeId } from './context';
import { findEnemies, applyAIMovementToUnit, buildResolvedTargets, distance, ROUND_DURATION } from '../utils';
import { getPetDef } from '../../pet_defs/petDef';
import { getAbility } from '../../../../abilities/AbilityRegistry';
import { canUseAbilityNow, meetsTagRequirements } from '../../../../abilities/abilityUses';
import type { AbilityStatic } from '../../../../abilities/Ability';

const RESCAN_INTERVAL_ROUNDS = 0.25;

/**
 * Pick the best engage ability for the locked target: highest aiSettings.priority among
 * usable in-range abilities, then longer maxRange. Falls back to basicAttackAbilityId.
 */
function pickPetEngageAbility(
    unit: Unit,
    target: Unit,
    basicAttackAbilityId: string,
): AbilityStatic | null {
    const dist = distance(unit.x, unit.y, target.x, target.y);
    const candidates: { ability: AbilityStatic; priority: number; maxRange: number }[] = [];

    for (const abilityId of unit.abilities) {
        const ability = getAbility(abilityId);
        if (!ability?.aiSettings) continue;
        if (!canUseAbilityNow(unit, ability)) continue;
        if (!meetsTagRequirements(unit, ability)) continue;
        const { minRange, maxRange } = ability.aiSettings;
        if (dist < minRange || dist > maxRange) continue;
        candidates.push({
            ability,
            priority: ability.aiSettings.priority ?? 0,
            maxRange,
        });
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => b.priority - a.priority || b.maxRange - a.maxRange);
        return candidates[0]!.ability;
    }

    return getAbility(basicAttackAbilityId) ?? null;
}

export const pet_engage: AINode<'pet', PetNodeId> = {
    nodeId: 'pet_engage',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as PetAITreeContext;

            // Heel overrides engagement
            if ((ctx.heelUntilGameTime ?? 0) > context.gameTime) {
                ctx.aiState = 'pet_heel';
                ctx.targetUnitId = undefined;
                ctx.orderedFocus = false;
                return;
            }

            const petDef = unit.petState.defId ? getPetDef(unit.petState.defId) : null;
            const returnRange = petDef?.returnLeashRange ?? 300;

            const owner = unit.petState.ownerUnitId ? context.getUnit(unit.petState.ownerUnitId) : null;
            const ownerAlive = owner?.isAlive() ?? false;

            // Check return leash
            if (ownerAlive && owner && distance(unit.x, unit.y, owner.x, owner.y) > returnRange) {
                ctx.aiState = 'pet_return';
                ctx.targetUnitId = undefined;
                ctx.orderedFocus = false;
                return;
            }

            // Rescan to refresh target
            const lastScan = ctx.lastScanTime ?? -Infinity;
            if (context.gameTime - lastScan >= RESCAN_INTERVAL_ROUNDS * ROUND_DURATION) {
                ctx.lastScanTime = context.gameTime;
                const enemies = findEnemies(unit, context.getUnits());
                if (enemies.length > 0) {
                    // Sticky ordered focus: keep current target while it remains a valid enemy.
                    const currentAlive = ctx.targetUnitId
                        ? enemies.some((e) => e.id === ctx.targetUnitId)
                        : false;
                    if (ctx.orderedFocus && currentAlive) {
                        // Keep lock — do not steal focus.
                    } else if (!currentAlive && enemies.length > 0) {
                        if (ctx.orderedFocus) {
                            // Ordered target gone — clear sticky lock and pick nearest.
                            ctx.orderedFocus = false;
                        }
                        enemies.sort((a, b) => distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y));
                        ctx.targetUnitId = enemies[0]!.id;
                    }
                } else {
                    ctx.targetUnitId = undefined;
                    ctx.orderedFocus = false;
                }
            }

            const target = ctx.targetUnitId ? context.getUnit(ctx.targetUnitId) : null;

            if (!target?.isAlive()) {
                ctx.aiState = 'pet_follow';
                ctx.targetUnitId = undefined;
                ctx.orderedFocus = false;
                return;
            }

            // Chase the target
            if (unit.aiSettings && context.terrainManager) {
                applyAIMovementToUnit(unit, target, {
                    findGridPath: (fc, fr, tc, tr) => context.findGridPathForUnit(unit, fc, fr, tc, tr),
                    worldToGrid: context.terrainManager.grid.worldToGrid.bind(context.terrainManager.grid),
                    gameTick: context.gameTick,
                    worldWidth: context.WORLD_WIDTH,
                    worldHeight: context.WORLD_HEIGHT,
                });
            }

            if (petDef) {
                const ability = pickPetEngageAbility(unit, target, petDef.basicAttackAbilityId);
                if (ability) {
                    const targets = buildResolvedTargets(ability, target);
                    context.queueOrder(context.gameTick, {
                        unitId: unit.id,
                        abilityId: ability.id,
                        targets,
                        movePath: unit.pathInvalidated ? undefined : (unit.movement?.path ? [...unit.movement.path] : undefined),
                    });
                    context.emitTurnEnd(unit.id);
                    return;
                }
            }

            context.emitTurnEnd(unit.id);
        },

        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as PetAITreeContext;
            const target = ctx.targetUnitId ? context.getUnit(ctx.targetUnitId) : null;
            if (!target?.isAlive() || !unit.aiSettings || !context.terrainManager) return;
            applyAIMovementToUnit(unit, target, {
                findGridPath: (fc, fr, tc, tr) => context.findGridPathForUnit(unit, fc, fr, tc, tr),
                worldToGrid: context.terrainManager.grid.worldToGrid.bind(context.terrainManager.grid),
                gameTick: context.gameTick,
                worldWidth: context.WORLD_WIDTH,
                worldHeight: context.WORLD_HEIGHT,
            });
        },
    },
    edges: [
        {
            targetNodeId: 'pet_heel',
            evaluate(unit: Unit, context: AIContext): boolean {
                const ctx = unit.aiContext as PetAITreeContext;
                return (ctx.heelUntilGameTime ?? 0) > context.gameTime;
            },
        },
        {
            targetNodeId: 'pet_follow',
            evaluate(unit: Unit, context: AIContext): boolean {
                const ctx = unit.aiContext as PetAITreeContext;
                const target = ctx.targetUnitId ? context.getUnit(ctx.targetUnitId) : null;
                return !target?.isAlive();
            },
        },
        {
            targetNodeId: 'pet_return',
            evaluate(unit: Unit, context: AIContext): boolean {
                const petDef = unit.petState.defId ? getPetDef(unit.petState.defId) : null;
                const returnRange = petDef?.returnLeashRange ?? 300;
                const owner = unit.petState.ownerUnitId ? context.getUnit(unit.petState.ownerUnitId) : null;
                if (!owner?.isAlive()) return false;
                return distance(unit.x, unit.y, owner.x, owner.y) > returnRange;
            },
        },
    ],
};

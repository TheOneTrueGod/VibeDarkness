/**
 * pet_engage — Chase the locked target and bite it.
 *
 * Uses only basicAttackAbilityId (no other abilities auto-triggered from this state).
 * Backs off to pet_return when too far from the owner, retreats to pet_heel when heeled,
 * and falls back to pet_follow when the target dies.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { PetAITreeContext, PetNodeId } from './context';
import { findEnemies, applyAIMovementToUnit, buildResolvedTargets, distance, ROUND_DURATION } from '../utils';
import { getPetDef } from '../../pet_defs/petDef';
import { getAbility } from '../../../../abilities/AbilityRegistry';

const RESCAN_INTERVAL_ROUNDS = 0.25;

export const pet_engage: AINode<'pet', PetNodeId> = {
    nodeId: 'pet_engage',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as PetAITreeContext;

            // Heel overrides engagement
            if ((ctx.heelUntilGameTime ?? 0) > context.gameTime) {
                ctx.aiState = 'pet_heel';
                ctx.targetUnitId = undefined;
                return;
            }

            const petDef = unit.petDefId ? getPetDef(unit.petDefId) : null;
            const returnRange = petDef?.returnLeashRange ?? 300;

            const owner = unit.petOwnerUnitId ? context.getUnit(unit.petOwnerUnitId) : null;
            const ownerAlive = owner?.isAlive() ?? false;

            // Check return leash
            if (ownerAlive && owner && distance(unit.x, unit.y, owner.x, owner.y) > returnRange) {
                ctx.aiState = 'pet_return';
                ctx.targetUnitId = undefined;
                return;
            }

            // Rescan to refresh target
            const lastScan = ctx.lastScanTime ?? -Infinity;
            if (context.gameTime - lastScan >= RESCAN_INTERVAL_ROUNDS * ROUND_DURATION) {
                ctx.lastScanTime = context.gameTime;
                const enemies = findEnemies(unit, context.getUnits());
                if (enemies.length > 0) {
                    // Keep current target if still alive; otherwise pick nearest
                    const currentAlive = ctx.targetUnitId
                        ? enemies.some((e) => e.id === ctx.targetUnitId)
                        : false;
                    if (!currentAlive && enemies.length > 0) {
                        enemies.sort((a, b) => distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y));
                        ctx.targetUnitId = enemies[0]!.id;
                    }
                } else {
                    ctx.targetUnitId = undefined;
                }
            }

            const target = ctx.targetUnitId ? context.getUnit(ctx.targetUnitId) : null;

            if (!target?.isAlive()) {
                ctx.aiState = 'pet_follow';
                ctx.targetUnitId = undefined;
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

            // Only use the basic attack ability
            if (petDef) {
                const ability = getAbility(petDef.basicAttackAbilityId);
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
                const petDef = unit.petDefId ? getPetDef(unit.petDefId) : null;
                const returnRange = petDef?.returnLeashRange ?? 300;
                const owner = unit.petOwnerUnitId ? context.getUnit(unit.petOwnerUnitId) : null;
                if (!owner?.isAlive()) return false;
                return distance(unit.x, unit.y, owner.x, owner.y) > returnRange;
            },
        },
    ],
};

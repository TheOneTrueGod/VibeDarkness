/**
 * pet_follow — Stay near owner; scan for enemies within the engage leash.
 *
 * Within GUARD_TETHER_RANGE the pet wanders on a ring around the owner (guard mode).
 * If farther than that, paths toward the owner. Every SCAN_INTERVAL_ROUNDS it checks
 * for enemies within engageLeashRange of the owner and transitions to pet_engage.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { PetAITreeContext, PetNodeId } from './context';
import { clearPetGuardWander, retriggerPetGuardWanderPath, runPetGuardWander } from './pet_guardWander';
import { findEnemies, queueWaitAndEndTurn, distance, ROUND_DURATION } from '../utils';
import { getPetDef } from '../../pet_defs/petDef';

/** Distance to owner (px) below which the pet guards (wanders) instead of closing in. */
const GUARD_TETHER_RANGE = 50;

/** How often (in rounds) the pet scans for enemies to engage. */
const SCAN_INTERVAL_ROUNDS = 0.25;

export const pet_follow: AINode<'pet', PetNodeId> = {
    nodeId: 'pet_follow',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as PetAITreeContext;

            const owner = unit.petState.ownerUnitId ? context.getUnit(unit.petState.ownerUnitId) : null;
            const ownerAlive = owner?.isAlive() ?? false;

            // Scan for enemies near the owner
            const lastScan = ctx.lastScanTime ?? -Infinity;
            if (context.gameTime - lastScan >= SCAN_INTERVAL_ROUNDS * ROUND_DURATION) {
                ctx.lastScanTime = context.gameTime;
                const petDef = unit.petState.defId ? getPetDef(unit.petState.defId) : null;
                const engageRange = petDef?.engageLeashRange ?? 150;

                if (ownerAlive && owner) {
                    const enemies = findEnemies(unit, context.getUnits());
                    const nearOwner = enemies.filter((e) => distance(e.x, e.y, owner.x, owner.y) <= engageRange);
                    nearOwner.sort((a, b) => distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y));
                    if (nearOwner.length > 0) {
                        clearPetGuardWander(ctx);
                        ctx.aiState = 'pet_engage';
                        ctx.targetUnitId = nearOwner[0]!.id;
                        return;
                    }
                }
            }

            if (ownerAlive && owner && context.terrainManager) {
                const dist = distance(unit.x, unit.y, owner.x, owner.y);
                if (dist > GUARD_TETHER_RANGE) {
                    clearPetGuardWander(ctx);
                    const grid = context.terrainManager.grid;
                    const from = grid.worldToGrid(unit.x, unit.y);
                    const to = grid.worldToGrid(owner.x, owner.y);
                    if (from.col !== to.col || from.row !== to.row) {
                        const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
                        if (path && path.length > 0) {
                            // Don't walk all the way to the owner's exact cell — stop one cell short
                            const truncated = path.length > 1 ? path.slice(0, -1) : path;
                            unit.setMovement(truncated, owner.id, context.gameTick);
                        }
                    }
                } else {
                    runPetGuardWander(unit, owner, context, ctx, GUARD_TETHER_RANGE);
                }
            }

            queueWaitAndEndTurn(unit, context);
        },

        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const owner = unit.petState.ownerUnitId ? context.getUnit(unit.petState.ownerUnitId) : null;
            if (!owner?.isAlive() || !context.terrainManager) return;
            const dist = distance(unit.x, unit.y, owner.x, owner.y);
            if (dist <= GUARD_TETHER_RANGE) {
                retriggerPetGuardWanderPath(unit, context);
                return;
            }
            const grid = context.terrainManager.grid;
            const from = grid.worldToGrid(unit.x, unit.y);
            const to = grid.worldToGrid(owner.x, owner.y);
            const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
            if (path && path.length > 0) {
                const truncated = path.length > 1 ? path.slice(0, -1) : path;
                unit.setMovement(truncated, owner.id, context.gameTick);
            }
        },
    },
    edges: [],
};


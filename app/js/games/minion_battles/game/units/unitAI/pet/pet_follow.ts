/**
 * pet_follow — Stay near owner; scan for enemies within the engage leash.
 *
 * Within GUARD_TETHER_RANGE the pet wanders on a ring around the owner (guard mode).
 * If farther than that, chases toward the owner (stopping one cell short). Every SCAN_INTERVAL_ROUNDS it checks
 * for enemies within engageLeashRange of the owner and transitions to pet_engage.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { PetAITreeContext, PetNodeId } from './context';
import { clearPetGuardWander, runPetGuardWander } from './pet_guardWander';
import { findEnemies, queueWaitAndEndTurn, distance, ROUND_DURATION } from '../utils';
import { getPetDef } from '../../pet_defs/petDef';
import { petStateOf } from '../../components/petComponent';

/** Distance to owner (px) below which the pet guards (wanders) instead of closing in. */
const GUARD_TETHER_RANGE = 50;

/** How often (in rounds) the pet scans for enemies to engage. */
const SCAN_INTERVAL_ROUNDS = 0.25;

export const pet_follow: AINode<'pet', PetNodeId> = {
    nodeId: 'pet_follow',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as PetAITreeContext;

            const owner = petStateOf(unit).ownerUnitId ? context.getUnit(petStateOf(unit).ownerUnitId!) : null;
            const ownerAlive = owner?.isAlive() ?? false;

            // Scan for enemies near the owner
            const lastScan = ctx.lastScanTime ?? -Infinity;
            if (context.gameTime - lastScan >= SCAN_INTERVAL_ROUNDS * ROUND_DURATION) {
                ctx.lastScanTime = context.gameTime;
                const petDef = petStateOf(unit).defId ? getPetDef(petStateOf(unit).defId!) : null;
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

            if (ownerAlive && owner) {
                const dist = distance(unit.x, unit.y, owner.x, owner.y);
                if (dist > GUARD_TETHER_RANGE) {
                    clearPetGuardWander(ctx);
                    // Chase owner, stopping one cell short (~ 40 px)
                    context.nav.chaseUnit(unit, owner, { stopRange: 40 });
                } else {
                    runPetGuardWander(unit, owner, context, ctx, GUARD_TETHER_RANGE);
                }
            }

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};


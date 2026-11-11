/**
 * pet_follow — Stay near the anchor; engage or shoot at enemies depending on the pet def.
 *
 * The anchor is the point the pet was last ordered to (`ctx.anchorX/Y`, set by Order: Move) or, while
 * guarding, the owner. Within the def's `anchorRadius` the pet wanders on a ring around the anchor; beyond
 * it, it walks back (chasing the owner when guarding).
 *
 * - `autoEngage` (default true): every SCAN_INTERVAL_ROUNDS it checks for enemies within engageLeashRange
 *   of the owner and transitions to pet_engage.
 * - `autoEngage: false`: it never chases. While idle it fires any usable ability with `aiSettings` at the
 *   nearest enemy already in that ability's range.
 * - `engageWhileGuarding` (the spirit animal): as `autoEngage`, but only while guarding (no ordered point).
 *   Pets start every mission guarding.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { PetAITreeContext, PetNodeId } from './context';
import { clearPetGuardWander, runPetGuardWander, type PetAnchor } from './pet_guardWander';
import { pickPetEngageAbility } from './pet_engage';
import { buildResolvedTargets, findEnemies, queueWaitAndEndTurn, distance, ROUND_DURATION } from '../utils';
import { getPetDef } from '../../pet_defs/petDef';
import { petStateOf } from '../../components/petComponent';

/** Default distance (px) from the anchor the pet may wander. */
export const DEFAULT_PET_ANCHOR_RADIUS = 50;

/** How often (in rounds) the pet scans for enemies to engage. */
const SCAN_INTERVAL_ROUNDS = 0.25;

/** The pet's anchor: its ordered point, else its living owner; null when neither exists. */
export function resolvePetAnchor(ctx: PetAITreeContext, owner: Unit | null): PetAnchor | null {
    if (ctx.anchorX !== undefined && ctx.anchorY !== undefined) return { x: ctx.anchorX, y: ctx.anchorY };
    return owner?.isAlive() ? owner : null;
}

/** Shoot at the nearest enemy already in range of a usable `aiSettings` ability. True when an order was queued. */
function tryRangedPotshot(unit: Unit, context: AIContext): boolean {
    if (unit.activeAbilities.length > 0) return false;
    const enemies = findEnemies(unit, context.getUnits());
    if (enemies.length === 0) return false;
    enemies.sort((a, b) => distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y));
    const target = enemies[0]!;
    const ability = pickPetEngageAbility(unit, target, null);
    if (!ability) return false;
    context.queueOrder(context.gameTick, { unitId: unit.id, abilityId: ability.id, targets: buildResolvedTargets(ability, target) });
    context.emitTurnEnd(unit.id);
    return true;
}

export const pet_follow: AINode<'pet', PetNodeId> = {
    nodeId: 'pet_follow',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as PetAITreeContext;
            const ownerId = petStateOf(unit).ownerUnitId;
            const owner = ownerId ? context.getUnit(ownerId) ?? null : null;
            const ownerAlive = owner?.isAlive() ?? false;
            const petDef = petStateOf(unit).defId ? getPetDef(petStateOf(unit).defId!) : null;
            const guarding = ctx.anchorX === undefined || ctx.anchorY === undefined;
            const autoEngage = petDef?.autoEngage !== false || (guarding && petDef?.engageWhileGuarding === true);

            if (autoEngage) {
                // Scan for enemies near the owner
                const lastScan = ctx.lastScanTime ?? -Infinity;
                if (context.gameTime - lastScan >= SCAN_INTERVAL_ROUNDS * ROUND_DURATION) {
                    ctx.lastScanTime = context.gameTime;
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
            } else if (tryRangedPotshot(unit, context)) {
                return;
            }

            const anchor = resolvePetAnchor(ctx, owner);
            if (anchor) {
                const radius = petDef?.anchorRadius ?? DEFAULT_PET_ANCHOR_RADIUS;
                const dist = distance(unit.x, unit.y, anchor.x, anchor.y);
                if (dist > radius) {
                    clearPetGuardWander(ctx);
                    if (anchor === owner) {
                        // Chase owner, stopping one cell short (~ 40 px)
                        context.nav.chaseUnit(unit, owner, { stopRange: Math.min(40, radius - 1) });
                    } else {
                        context.nav.moveToPoint(unit, anchor.x, anchor.y, { exact: true });
                    }
                } else {
                    runPetGuardWander(unit, anchor, context, ctx, radius);
                }
            }

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};

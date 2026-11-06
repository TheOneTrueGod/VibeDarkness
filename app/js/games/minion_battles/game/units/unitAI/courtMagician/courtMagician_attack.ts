/**
 * courtMagician_attack - Keep his distance on foot (slowly, so the party can catch him), Blink away
 * once they have had a few hits up close (see `courtMagicianAI.ts`), and otherwise cast the best
 * eligible ability. The Crystal Laser (enraged, every other round) goes first when allowed; otherwise
 * he follows `COURT_MAGICIAN_ROTATION` (Rearrange, then Shard Nova / Crystal Volley, each half round).
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { CourtMagicianAITreeContext, CourtMagicianNodeId } from './context';
import { applyAIMovementToUnit, distance, tryQueueAbilityOrder } from '../utils';
import { getEnemiesInRangeNearestFirst, getVisibleEnemiesNearestFirst } from '../displacer/displacerPerception';
import { getAbility } from '../../../../abilities/AbilityRegistry';
import { canUseAbilityNow } from '../../../../abilities/abilityUses';
import { BLINK_ABILITY_ID } from '../../../../card_defs/14_enemy_court_magician/courtMagicianConstants';
import { CELL_SIZE } from '../../../../terrain/TerrainGrid';
import { pickRetreatPoint } from '../aiRetreatPoint';
import { tryQueueRotationAbility } from '../abilityRotation';
import {
    BLINK_COOLDOWN_SEC,
    COURT_MAGICIAN_ROTATION,
    COURT_MAGICIAN_ROTATION_IDS,
    RETREAT_MIN_HOP_PX,
    RETREAT_RADIUS_PX,
    clearContact,
    shouldBlink,
    updateContact,
} from './courtMagicianAI';

/** Queue a Blink to the best retreat point. Returns false when Blink is unavailable or nowhere is open. */
function tryBlinkAway(unit: Unit, ctx: CourtMagicianAITreeContext, threats: Unit[], context: AIContext): boolean {
    const blink = getAbility(BLINK_ABILITY_ID);
    if (!blink || !unit.abilities.includes(BLINK_ABILITY_ID) || !canUseAbilityNow(unit, blink)) return false;
    const dest = pickRetreatPoint({
        anchor: { x: ctx.homeX ?? unit.x, y: ctx.homeY ?? unit.y },
        radius: RETREAT_RADIUS_PX,
        from: unit,
        threats,
        minHop: RETREAT_MIN_HOP_PX,
        isOpen: (x, y) =>
            x >= 0 &&
            y >= 0 &&
            x < context.WORLD_WIDTH &&
            y < context.WORLD_HEIGHT &&
            context.nav.isReachable(unit, Math.floor(x / CELL_SIZE), Math.floor(y / CELL_SIZE)),
    });
    if (!dest) return false;
    context.queueOrder(context.gameTick, {
        unitId: unit.id,
        abilityId: BLINK_ABILITY_ID,
        targets: [{ type: 'pixel', position: dest }],
    });
    clearContact(ctx);
    ctx.nextBlinkAt = context.gameTime + BLINK_COOLDOWN_SEC;
    context.emitTurnEnd(unit.id);
    return true;
}

export const courtMagician_attack: AINode<'courtMagician', CourtMagicianNodeId> = {
    nodeId: 'courtMagician_attack',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as CourtMagicianAITreeContext;
            if (ctx.homeX === undefined || ctx.homeY === undefined) {
                ctx.homeX = unit.x;
                ctx.homeY = unit.y;
            }
            const inSight = getVisibleEnemiesNearestFirst(unit, context);
            const nearby = getEnemiesInRangeNearestFirst(unit, context);
            const target = inSight[0] ?? nearby[0];
            if (!target) {
                ctx.aiState = 'courtMagician_idle';
                return;
            }
            ctx.targetUnitId = target.id;

            const nearest = nearby[0] ?? target;
            updateContact(ctx, unit, distance(unit.x, unit.y, nearest.x, nearest.y), context.gameTime);
            if (shouldBlink(ctx, unit, context.gameTime) && tryBlinkAway(unit, ctx, nearby, context)) return;

            applyAIMovementToUnit(unit, nearest, context);
            if (inSight.length > 0) {
                // Anything outside the rotation first (the Crystal Laser super), then the rotation's next step.
                if (tryQueueAbilityOrder(unit, context, inSight, undefined, { exclude: COURT_MAGICIAN_ROTATION_IDS })) return;
                if (tryQueueRotationAbility(unit, context, inSight, ctx, COURT_MAGICIAN_ROTATION)) return;
            }
            context.emitTurnEnd(unit.id);
        },
    },
    edges: [
        {
            targetNodeId: 'courtMagician_idle',
            evaluate(unit: Unit, context: AIContext): boolean {
                return getEnemiesInRangeNearestFirst(unit, context).length === 0;
            },
        },
    ],
};

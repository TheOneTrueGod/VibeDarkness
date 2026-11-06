/**
 * Scout travel: pathfind toward target nest POI; opportunistically attack enemies en route.
 * On arrival, begin construction timer (see scoutConstruction.ts) and transition to lnet_scout_construct.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import {
    findEnemies,
    getEnemiesInPerceptionAndLOS,
    tryQueueAbilityOrder,
    queueWaitAndEndTurn,
} from '../utils';
import { getPerceptionRange } from '../../unit_defs/unitDef';
import type { LanterniteNetworkAITreeContext, LanterniteNetworkNodeId } from './context';
import { lanterniteStateOf } from '../../components/lanterniteComponent';
import { getScoutStandPosition, tryBeginScoutConstruction } from './scoutConstruction';

const ATTACK_COOLDOWN_SEC = 1;

export const lnet_scout_travel: AINode<'lanterniteNetwork', LanterniteNetworkNodeId> = {
    nodeId: 'lnet_scout_travel',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as LanterniteNetworkAITreeContext;
            ctx.aiTree = 'lanterniteNetwork';
            ctx.aiState = 'lnet_scout_travel';

            const far = lanterniteStateOf(unit).patrolFarWorld;
            if (!far || !unit.isAlive()) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const stand = getScoutStandPosition(unit);
            if (!stand) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // Normally already started by processLanterniteNests on the arrival tick; this covers
            // AI-only harnesses and the first turn after spawning on the spot.
            if (tryBeginScoutConstruction(unit, context.getUnits(), context.gameTime)) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // Pathfind toward stand position (not directly on top of the build site)
            context.nav.moveToPoint(unit, stand.x, stand.y);

            // Opportunistic attack (do not chase; just fire if eligible and enemy in range)
            if (context.gameTime >= lanterniteStateOf(unit).attackReadyAtGameTime) {
                const enemies = findEnemies(unit, context.getUnits());
                const perceptionRange = getPerceptionRange(unit.characterId);
                const inSight = getEnemiesInPerceptionAndLOS(
                    unit,
                    enemies,
                    perceptionRange,
                    context.hasLineOfSight,
                );
                if (tryQueueAbilityOrder(unit, context, inSight)) {
                    lanterniteStateOf(unit).attackReadyAtGameTime = context.gameTime + ATTACK_COOLDOWN_SEC;
                    return;
                }
            }

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'lnet_scout_construct',
            evaluate(unit: Unit): boolean {
                return lanterniteStateOf(unit).constructionCompleteAtGameTime != null;
            },
        },
    ],
};

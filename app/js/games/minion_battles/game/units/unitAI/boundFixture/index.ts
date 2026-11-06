/**
 * boundFixture UnitAITree - a unit that never acts on its own: it only casts what its master orders
 * (queued orders, e.g. the Court Magician's crystals charging on command). Each turn it fades if its
 * master type is gone (`UnitDefEntry.boundToCharacterId`, see `units/boundUnits.ts`), otherwise ends
 * its turn without moving.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode, UnitAITree } from '../types';
import { despawnIfMasterGone, getBoundMasterCharacterId } from '../../boundUnits';

export type BoundFixtureNodeId = 'boundFixture_idle';

const boundFixture_idle: AINode<'boundFixture', BoundFixtureNodeId> = {
    nodeId: 'boundFixture_idle',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const master = getBoundMasterCharacterId(unit);
            if (master && despawnIfMasterGone(unit, context, master)) return;
            context.emitTurnEnd(unit.id);
        },
    },
    edges: [],
};

export const BOUND_FIXTURE_AI_TREE: UnitAITree<'boundFixture', BoundFixtureNodeId> = {
    name: 'boundFixture',
    entryNodeId: 'boundFixture_idle',
    nodes: { boundFixture_idle },
};

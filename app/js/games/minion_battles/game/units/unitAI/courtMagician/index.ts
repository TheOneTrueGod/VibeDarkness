/**
 * courtMagician UnitAITree - boss AI for the Court Magician.
 * Idle (wait for sight) -> Attack (keep distance, Blink away after a few hits up close, cast by ability priority).
 */

import type { UnitAITree } from '../types';
import type { CourtMagicianNodeId } from './context';
import { courtMagician_idle } from './courtMagician_idle';
import { courtMagician_attack } from './courtMagician_attack';

export type { CourtMagicianNodeId, CourtMagicianAITreeContext } from './context';

export const COURT_MAGICIAN_AI_TREE: UnitAITree<'courtMagician', CourtMagicianNodeId> = {
    name: 'courtMagician',
    entryNodeId: 'courtMagician_idle',
    nodes: {
        courtMagician_idle,
        courtMagician_attack,
    },
};

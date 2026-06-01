/**
 * Hunt UnitAITree - Relentlessly pursue and attack the nearest enemy.
 *
 * Immediately picks a target (no LOS required) and chases it down.
 * Re-targets the nearest enemy every 0.5 rounds while pursuing.
 */

import type { UnitAITree } from '../types';
import type { HuntNodeId } from './context';
import { hunt_seek } from './hunt_seek';
import { hunt_pursue } from './hunt_pursue';

export type { HuntNodeId } from './context';
export type { HuntAITreeContext } from './context';

export const HUNT_AI_TREE: UnitAITree<'hunt', HuntNodeId> = {
    name: 'hunt',
    entryNodeId: 'hunt_seek',
    nodes: {
        hunt_seek,
        hunt_pursue,
    },
};

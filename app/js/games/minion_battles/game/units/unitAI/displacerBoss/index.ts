/**
 * DisplacerBoss UnitAITree - boss AI for the Displacer Spirit.
 * Idle (wait for sight) -> Attack (hover at ~70% bolt range, cast by ability priority/round window).
 */

import type { UnitAITree } from '../types';
import type { DisplacerBossNodeId } from './context';
import { displacerBoss_idle } from './displacerBoss_idle';
import { displacerBoss_attack } from './displacerBoss_attack';

export type { DisplacerBossNodeId, DisplacerBossAITreeContext } from './context';

export const DISPLACER_BOSS_AI_TREE: UnitAITree<'displacerBoss', DisplacerBossNodeId> = {
    name: 'displacerBoss',
    entryNodeId: 'displacerBoss_idle',
    nodes: {
        displacerBoss_idle,
        displacerBoss_attack,
    },
};

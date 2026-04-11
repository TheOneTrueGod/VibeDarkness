/**
 * AlphaWolfBoss UnitAITree - Boss AI for alpha wolf mission.
 * Idle (wait for sight) -> Attack (move, use best ability by priority).
 */

import type { UnitAITree } from '../types';
import type { AlphaWolfBossNodeId } from './context';
import { alphaWolfBoss_idle } from './alphaWolfBoss_idle';
import { alphaWolfBoss_attack } from './alphaWolfBoss_attack';

export type { AlphaWolfBossNodeId } from './context';
export type { AlphaWolfBossAITreeContext } from './context';

export const ALPHA_WOLF_BOSS_AI_TREE: UnitAITree<'alphaWolfBoss', AlphaWolfBossNodeId> = {
    name: 'alphaWolfBoss',
    entryNodeId: 'alphaWolfBoss_idle',
    nodes: {
        alphaWolfBoss_idle,
        alphaWolfBoss_attack,
    },
};

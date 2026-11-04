/**
 * SentryPatrol UnitAITree - Walk a waypoint loop oblivious to the world; once disturbed (hurt, or
 * an enemy seen close by), turn hostile for good and wake nearby sentries on the same tree.
 */

import type { UnitAITree } from '../types';
import type { SentryPatrolNodeId } from './context';
import { sentryPatrol_patrol } from './sentryPatrol_patrol';
import { sentryPatrol_hostile } from './sentryPatrol_hostile';

export type { SentryPatrolNodeId, SentryPatrolAITreeContext, SentryWakeTrigger } from './context';
export { DEFAULT_SENTRY_WAKE_ON } from './context';
export { wakeSentries, isSleepingSentry, DEFAULT_SENTRY_ALERT_RADIUS_PX } from './sentryPatrolAlert';
export { DEFAULT_SENTRY_NOTICE_RANGE_PX } from './sentryPatrol_patrol';

export const SENTRY_PATROL_AI_TREE: UnitAITree<'sentryPatrol', SentryPatrolNodeId> = {
    name: 'sentryPatrol',
    entryNodeId: 'sentryPatrol_patrol',
    nodes: {
        sentryPatrol_patrol,
        sentryPatrol_hostile,
    },
};

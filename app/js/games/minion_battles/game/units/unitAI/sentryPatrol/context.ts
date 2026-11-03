/**
 * SentryPatrol tree AI context.
 */

import type { UnitAIContextBase } from '../contextBase';

/** Mission-authored patrol for a `sentryPatrol` unit (EnemySpawnDef / SpawnWaveEntry `sentryPatrol`). */
export interface SentryPatrolConfig {
    /**
     * World points walked in order, looping. The spawn position is prepended unless
     * `startAtSpawn` is false, so one point gives a back-and-forth between spawn and that point.
     */
    waypoints: { x: number; y: number }[];
    /** Default true. */
    startAtSpawn?: boolean;
    /** Overrides `DEFAULT_SENTRY_NOTICE_RANGE_PX`. */
    noticeRangePx?: number;
    /** Overrides `DEFAULT_SENTRY_ALERT_RADIUS_PX`. */
    alertRadiusPx?: number;
}

export type SentryPatrolNodeId = 'sentryPatrol_patrol' | 'sentryPatrol_hostile';

export interface SentryPatrolAITreeContext extends UnitAIContextBase {
    aiTree: 'sentryPatrol';
    aiState?: SentryPatrolNodeId;
    /** Points walked in order, looping (two points = back and forth). Empty/absent = stand guard. */
    waypoints?: { x: number; y: number }[];
    /** Index into `waypoints` of the point currently being walked to. */
    waypointIndex?: number;
    /** An enemy within this many px (with line of sight) disturbs the sentry. */
    noticeRangePx?: number;
    /** When disturbed, sleeping sentries on the same team and tree within this many px wake too. */
    alertRadiusPx?: number;
    /** HP at the last patrol tick; any drop means the sentry was hurt and wakes. */
    lastSeenHp?: number;
    /** gameTime when the last notice scan (patrol) or retarget scan (hostile) ran. */
    lastScanTime?: number;
}

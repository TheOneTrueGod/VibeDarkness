/**
 * Mission triggers — "when EVENT happens, if CONDITIONS hold, do ACTIONS" (Warcraft III style).
 *
 * Everything here is plain data: a mission lists `TriggerDef`s (JSON-serializable) and the
 * engine's `TriggerManager` runs them. To extend the system add a member to one of the unions
 * below and handle it in `TriggerManager` (events / actions) or `missionConditions.ts` (conditions).
 */

import type { TeamId } from '../teams';
import type { UnitTag } from '../units/unitTag';
import type { EnemySpawnDef, SpawnWaveEntry, VictoryCondition } from '../../storylines/types';

// ---- Regions --------------------------------------------------------------

/** An area of the map. Rects are in grid cells; circles in world px. */
export type TriggerRegion =
    | {
          type: 'rect';
          /** Top-left cell (global mission grid). */
          col: number;
          row: number;
          /** Size in cells. */
          width: number;
          height: number;
      }
    | { type: 'circle'; x: number; y: number; radiusPx: number };

// ---- Unit filters ---------------------------------------------------------

/** Which units an event cares about. Every set field must match; an empty filter matches any unit. */
export interface TriggerUnitFilter {
    /** `'anyPlayer'` = units a real player controls; `'ai'` = AI-owned units. */
    owner?: 'anyPlayer' | 'ai';
    teamId?: TeamId;
    characterId?: string;
    tag?: UnitTag;
}

// ---- Events ---------------------------------------------------------------

/**
 * Fires once for each matching unit that is inside the region now but was not on the previous
 * check (including units that appear inside it). That unit becomes the triggering unit.
 */
export interface TriggerEventUnitEntersRegion {
    type: 'unitEntersRegion';
    region: TriggerRegion;
    unit?: TriggerUnitFilter;
}

export type TriggerEvent = TriggerEventUnitEntersRegion;

// ---- Conditions -----------------------------------------------------------

/**
 * Predicate over battle state. Any mission `VictoryCondition` works as a leaf, plus boolean
 * combinators and trigger-state checks.
 */
export type TriggerCondition =
    | VictoryCondition
    | { type: 'and'; conditions: TriggerCondition[] }
    | { type: 'or'; conditions: TriggerCondition[] }
    | { type: 'not'; condition: TriggerCondition }
    | { type: 'triggerFired'; triggerId: string };

// ---- Actions --------------------------------------------------------------

/** Spawn a wave, exactly like a `spawnWave` level event. */
export interface TriggerActionSpawnWave {
    type: 'spawnWave';
    spawns: SpawnWaveEntry[];
    /** Extra units at exact positions (e.g. nests), as in level events. */
    extraEnemySpawns?: EnemySpawnDef[];
    /**
     * Centre every `spawns` entry on the triggering unit: entries become `spawnBehaviour: 'anywhere'`
     * with a `spawnTarget` of this radius (tiles) around it. Each entry keeps its own `inDarkness`.
     * Ignored when the event has no triggering unit.
     */
    nearTriggeringUnit?: { radiusTiles: number };
}

export type TriggerAction =
    | TriggerActionSpawnWave
    | { type: 'message'; text: string; npcId?: string }
    | { type: 'revealObjectives'; objectiveIds: string[] }
    | { type: 'setTriggerEnabled'; triggerId: string; enabled: boolean };

// ---- Trigger --------------------------------------------------------------

export interface TriggerDef {
    /** Stable id: referenced by `triggerFired`, `setTriggerEnabled`, level-event `afterTrigger`, and checkpoints. */
    id: string;
    /** Any one of these firing runs the trigger. */
    events: TriggerEvent[];
    /** All must hold when the event fires (implicit AND). Omit for none. */
    conditions?: TriggerCondition[];
    /** Run in order. */
    actions: TriggerAction[];
    /** Default true. A disabled trigger ignores its events until a `setTriggerEnabled` action turns it on. */
    enabled?: boolean;
    /** Default true: after the actions run once, the trigger never runs again. */
    fireOnce?: boolean;
}

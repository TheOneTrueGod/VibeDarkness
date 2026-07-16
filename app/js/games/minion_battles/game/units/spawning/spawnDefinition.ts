/**
 * SpawnDefinition — the single, strongly-typed contract for "what/where/AI-state" describing a
 * unit to be spawned. Every spawn code path (mission bootstrap, level events, nest ticks,
 * abilities) resolves down to one or more of these and hands them to `spawnUnit()`
 * (./spawnUnit.ts), the single code path allowed to construct and add a unit to the battle.
 *
 * Decision logic (which role, which POI, which angle) stays caller-side — a SpawnDefinition only
 * ever carries already-decided, concrete values. See game/lanternite/AGENTS.md for the ecology
 * background this was built to unify.
 */

import type { TeamId } from '../../teams';
import type { UnitTag } from '../unitTag';
import type { AISettings, UnitCombatSettings } from '../unitTypes';
import type {
    LanterniteNestMissionConfig,
    SwarmNestMissionConfig,
    ThornlingNestMissionConfig,
} from './nestMissionConfigs';

/** Where to place a spawned unit. */
export type SpawnPlacement =
    | { kind: 'fixedWorld'; x: number; y: number }
    | { kind: 'fixedGrid'; col: number; row: number }
    | { kind: 'edgeOfMap' }
    | {
          kind: 'anywhere';
          inDarkness?: boolean;
          target?: { x: number; y: number; radius: number };
          zoneId?: string;
      }
    | { kind: 'closestToPlayers'; inDarkness?: boolean }
    | {
          kind: 'closestEnemySpawnPoint';
          /** Tiles within this radius (in cells) of the POI are candidates. 0 = the POI cell itself. */
          radius?: number;
          inDarkness?: boolean;
          matchesTags?: string[];
      }
    | {
          kind: 'relativeToUnit';
          anchorUnitId: string;
          /** Random annulus around the anchor (default min = anchor's own radius). */
          minRadiusPx?: number;
          maxRadiusPx: number;
          /** Explicit fixed offset instead of a random annulus draw, when set. */
          fixedOffset?: { dx: number; dy: number };
      };

/**
 * Resolved AI-hookup state to apply to the spawned unit. Each variant carries only concrete,
 * already-decided values — never decision logic. `unitAITreeId` (on SpawnDefinition itself)
 * still needs to be set explicitly by the caller; this union only supplies the state the chosen
 * tree consumes (see game/units/unitAI/index.ts's TREE_REGISTRY for which tree expects what).
 */
export type SpawnAiHookup =
    | { kind: 'none' }
    | {
          kind: 'lanternite';
          /** Legacy non-networked patrol. */
          patrolFarWorld?: { x: number; y: number };
          patrolLeg?: 'toFar' | 'toNest';
          /** Networked lanternite. */
          role?: 'scout' | 'defender';
          targetNestPoiId?: string;
          /** Scout only — lnet_scout_travel.ts reads nestConfig.scoutConstructionSec. */
          nestConfig?: LanterniteNestMissionConfig;
          constructionAngle?: number;
          attackReadyAtGameTime?: number;
          nestOwnerUnitId?: string;
      }
    | { kind: 'lanterniteNest'; nestConfig: LanterniteNestMissionConfig; homeNestPoiId?: string }
    | { kind: 'swarm'; orbitAngle?: number; targetNestPoiId?: string; nestOwnerUnitId?: string }
    | { kind: 'swarmNest'; nestConfig: SwarmNestMissionConfig; homeNestPoiId?: string }
    | { kind: 'thornlingNest'; nestConfig: ThornlingNestMissionConfig }
    | { kind: 'pet'; ownerUnitId: string; defId: string };

export interface SpawnDefinition {
    // ---- what ----
    characterId: string;
    name?: string;
    hp?: number;
    speed?: number;
    stackSize?: number;
    abilities: string[];
    aiSettings?: AISettings | null;
    radius?: number;
    unitTags?: UnitTag[];
    teamId: TeamId;
    /** Default 'ai'. */
    ownerId?: string;
    controlGroupId?: string;
    controllable?: boolean;
    combatSettings?: UnitCombatSettings;
    /** Absolute gameTime after which this unit despawns (ephemeral summons). */
    ephemeralDespawnAtGameTime?: number | null;
    invulnerabilityGenerations?: number;
    /** Stable checkpoint id (e.g. nests referenced by lanternite patrol/hookup fields). */
    unitId?: string;
    stamina?: number;
    /** Omitted -> resolved by spawnUnit's single fallback chain (see spawnUnit.ts). */
    unitAITreeId?: string;

    // ---- where ----
    placement: SpawnPlacement;

    // ---- AI state ----
    /** Default { kind: 'none' }. */
    aiHookup?: SpawnAiHookup;

    // ---- batch ----
    /** Default 1. spawnUnit() loops internally and returns one Unit per successful placement. */
    count?: number;
}

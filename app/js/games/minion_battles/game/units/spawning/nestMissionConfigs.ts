/**
 * Config shapes for nest-kind units (`thornling_nest`, `swarm_nest`, `lanternite_nest`).
 *
 * Lives here (a leaf module, same layer as `Unit.ts`) rather than in `storylines/types.ts` so
 * `SpawnAiHookup` (spawning/spawnDefinition.ts) can reference these without creating an import
 * cycle back through `storylines/types.ts`. `storylines/types.ts` re-exports these types so
 * existing mission-authoring imports keep working unchanged.
 */

/** Config for a `thornling_nest` unit — spawns creatures near itself at intervals. */
export interface ThornlingNestMissionConfig {
    /** Hard cap on living children. */
    maxThornlings: number;
    /** Seconds between spawn bursts. */
    spawnIntervalSec: number;
    /** How many units to spawn per interval (default 1). Capped by maxThornlings. */
    spawnCount?: number;
    /** Character ID to spawn (default 'thornling'). */
    spawnCharacterId?: string;
    /** Ability IDs for spawned units (default ['0002']). */
    spawnAbilities?: string[];
    /** AI tree for spawned units (default 'hunt'). */
    spawnAITreeId?: string;
}

/** Config for a `swarm_nest` unit — spawns swarmlings that seek nest POIs and build new nests. */
export interface SwarmNestMissionConfig {
    /** Hard cap on living children. */
    maxSwarmlings: number;
    /** Seconds between spawn bursts. */
    spawnIntervalSec: number;
    /** How many swarmlings to spawn per interval (default 1). Capped by maxSwarmlings. */
    spawnCount?: number;
    /** Seconds for a swarmling to build a new nest after arriving at a POI (default 10). */
    scoutConstructionSec?: number;
    /** `nest` POI id this swarm nest occupies (mission-defined starting nests only). */
    nestPoiId?: string;
}

/** Patrol endpoint for Lanternites spawned from a {@link LanterniteNestMissionConfig} nest. */
export type LanternitePatrolDestination =
    | { kind: 'nestUnit'; unitId: string }
    | { kind: 'world'; x: number; y: number };

/** Optional nest behaviour merged onto a spawned `lanternite_nest` unit after creation. */
export interface LanterniteNestMissionConfig {
    /** Hard cap on living children for this nest. */
    maxLanternites: number;
    /** Seconds between spawn bursts. */
    spawnIntervalSec: number;
    /** How many lanternites to spawn per interval (default 1). Capped by maxLanternites. */
    spawnCount?: number;
    /** Kept for non-networked backward compat; ignored when networked=true. */
    patrolDestination: LanternitePatrolDestination;
    /** Opt into network behavior: scouts, defender roles, and nest construction. Default false. */
    networked?: boolean;
    /** ID of the `nest` POI this nest occupies at mission start. Required when networked=true. */
    nestPoiId?: string;
    /** Seconds for a scout to build a new nest on arrival (default 12). */
    scoutConstructionSec?: number;
}

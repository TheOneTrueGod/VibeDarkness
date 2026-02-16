/**
 * Mission battle configuration types.
 *
 * Each mission defines what enemies to spawn when the battle starts,
 * along with the terrain layout for the battlefield.
 */

import type { TeamId } from '../engine/teams';
import type { AISettings } from '../objects/Unit';
import type { TerrainGrid } from '../terrain/TerrainGrid';

/** Config for a single enemy spawn. */
export interface EnemySpawnDef {
    /** Character archetype for visuals and resources. */
    characterId: string;
    /** Display name for this enemy. */
    name: string;
    /** Hit points. */
    hp: number;
    /** Movement speed in px/s. */
    speed: number;
    /** Starting position in world space. */
    position: { x: number; y: number };
    /** Team this enemy belongs to. */
    teamId: TeamId;
    /** Ability IDs available to this enemy. */
    abilities: string[];
    /** AI behavior settings (range preferences, etc.). */
    aiSettings?: AISettings;
}

/** Full battle configuration for a mission. */
export interface MissionBattleConfig {
    /** Mission ID (matches the id from MissionSelectPhase). */
    missionId: string;
    /** Display name. */
    name: string;
    /** List of enemies to spawn. */
    enemies: EnemySpawnDef[];
    /** Create the terrain grid for this mission's battlefield. */
    createTerrain: () => TerrainGrid;
}

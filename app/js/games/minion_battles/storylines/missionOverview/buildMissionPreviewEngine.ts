/**
 * Builds a read-only engine for a mission at tick 0, for the Mission Overview view.
 *
 * Mirrors the mission setup in `game/sessionLoad.ts` (`loadSession`) without the network, lobby or
 * snapshot: one placeholder player, no research, no darkness strengths. The engine is never ticked.
 */
import { GameEngine } from '../../game/GameEngine';
import { TerrainManager } from '../../terrain/TerrainManager';
import { getMissionSegmentPOIs, getMissionSegmentZones } from '../../terrain/segmentRegistry';
import type { IBaseMissionDef } from '../BaseMissionDef';

/** Player id of the single placeholder hero the preview spawns (gives the map a player light). */
export const MISSION_PREVIEW_PLAYER_ID = 'mission_preview_player';

export interface MissionPreview {
    engine: GameEngine;
    terrainManager: TerrainManager;
}

export function buildMissionPreviewEngine(mission: IBaseMissionDef): MissionPreview {
    const terrainCtx = { researchTrees: {} };
    const composed = mission.composeMap(terrainCtx);
    const terrainManager = new TerrainManager(mission.createTerrain(terrainCtx));

    const engine = new GameEngine();
    engine.prepareForNewGame({
        localPlayerId: MISSION_PREVIEW_PLAYER_ID,
        randomSeed: 1,
        terrainManager,
        aiControllerId: mission.aiController,
    });
    engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
    if (mission.levelEvents && mission.levelEvents.length > 0) engine.setLevelEvents(mission.levelEvents);
    engine.setTriggers(mission.triggers ?? []);
    mission.initializeGameState(engine, {
        playerUnits: [{ playerId: MISSION_PREVIEW_PLAYER_ID, name: 'Preview' }],
        localPlayerId: MISSION_PREVIEW_PLAYER_ID,
        eventBus: engine.eventBus,
        terrainManager,
        terrainSegmentPOIs: composed?.pois ?? getMissionSegmentPOIs(mission.segmentIds),
        terrainSegmentZones: composed?.zones ?? getMissionSegmentZones(mission.segmentIds),
    });
    engine.initNinjutsu(mission.ninjutsuPools);
    engine.applyInstantLightingPass();
    return { engine, terrainManager };
}

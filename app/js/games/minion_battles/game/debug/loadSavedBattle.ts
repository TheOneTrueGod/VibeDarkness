/**
 * Rebuild a battle from a checkpoint the way a resync does: mission terrain, then `fromJSON`.
 * Orders already inside the save stay pending. Add more with {@link playForward}.
 */

import { MISSION_MAP } from '../../storylines';
import { terrainContextFromSnapshot } from '../../storylines/homeBase';
import { TerrainManager } from '../../terrain/TerrainManager';
import { GameEngine } from '../GameEngine';
import type { SerializedGameState } from '../types';
import '../../abilities/AbilityRegistry';

export function unwrapSavedState(raw: unknown): SerializedGameState {
    if (!raw || typeof raw !== 'object') throw new Error('save is not an object');
    const record = raw as Record<string, unknown>;
    const inner = record.state ?? record.game_state ?? record;
    if (!inner || typeof inner !== 'object') throw new Error('save has no game state');
    return inner as SerializedGameState;
}

export function loadSavedBattle(opts: {
    saved: unknown;
    missionId: string;
    localPlayerId: string;
}): GameEngine {
    const mission = MISSION_MAP[opts.missionId];
    if (!mission) throw new Error(`No mission registered for id "${opts.missionId}"`);
    const snapshot = unwrapSavedState(opts.saved);
    const terrainCtx = terrainContextFromSnapshot(snapshot as unknown as Record<string, unknown>);
    const terrain = mission.createTerrain(terrainCtx);
    const terrainManager = new TerrainManager(terrain);
    const composed = mission.composeMap(terrainCtx);
    return GameEngine.fromJSON(
        snapshot,
        opts.localPlayerId,
        terrainManager,
        composed
            ? { segmentPlacements: composed.placements, segmentNetwork: composed.network }
            : { segmentIds: mission.segmentIds },
    );
}

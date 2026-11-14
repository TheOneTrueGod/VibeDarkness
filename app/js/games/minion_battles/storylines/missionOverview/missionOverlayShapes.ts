/**
 * World-space shapes for the Mission Overview map overlays, read from mission data and the preview
 * engine's map POIs / zones. Each shape belongs to one toggleable layer.
 */
import type { TriggerRegion } from '../../game/triggers/triggerTypes';
import type { MapSegmentPOI, MapSegmentZone } from '../../terrain/segmentSchema';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { MissionBattleConfig, SpawnWaveEntry } from '../types';

export type MissionOverlayLayer = 'triggerZones' | 'objectiveAreas' | 'spawnAreas' | 'otherEffects';

export const MISSION_OVERLAY_LAYERS: readonly { id: MissionOverlayLayer; label: string; color: number }[] = [
    { id: 'triggerZones', label: 'Trigger zones', color: 0xf97316 },
    { id: 'objectiveAreas', label: 'Objective areas', color: 0x22c55e },
    { id: 'spawnAreas', label: 'Enemy spawn areas', color: 0xef4444 },
    { id: 'otherEffects', label: 'Other triggered effects', color: 0xa855f7 },
];

export type MissionOverlayGeometry =
    | { type: 'rect'; x: number; y: number; width: number; height: number }
    | { type: 'ellipse'; x: number; y: number; rx: number; ry: number }
    | { type: 'marker'; x: number; y: number };

export interface MissionOverlayShape {
    layer: MissionOverlayLayer;
    label: string;
    geometry: MissionOverlayGeometry;
}

type MissionOverlaySource = Pick<MissionBattleConfig, 'levelEvents' | 'triggers' | 'battleObjectives'>;

function regionGeometry(region: TriggerRegion): MissionOverlayGeometry {
    if (region.type === 'rect') {
        return {
            type: 'rect',
            x: region.col * CELL_SIZE,
            y: region.row * CELL_SIZE,
            width: region.width * CELL_SIZE,
            height: region.height * CELL_SIZE,
        };
    }
    return { type: 'ellipse', x: region.x, y: region.y, rx: region.radiusPx, ry: region.radiusPx };
}

function zoneGeometry(zone: MapSegmentZone): MissionOverlayGeometry {
    const minCol = Math.min(zone.topLeft.col, zone.bottomRight.col);
    const maxCol = Math.max(zone.topLeft.col, zone.bottomRight.col);
    const minRow = Math.min(zone.topLeft.row, zone.bottomRight.row);
    const maxRow = Math.max(zone.topLeft.row, zone.bottomRight.row);
    const x = minCol * CELL_SIZE;
    const y = minRow * CELL_SIZE;
    const width = (maxCol - minCol + 1) * CELL_SIZE;
    const height = (maxRow - minRow + 1) * CELL_SIZE;
    if (zone.shape === 'circle') return { type: 'ellipse', x: x + width / 2, y: y + height / 2, rx: width / 2, ry: height / 2 };
    return { type: 'rect', x, y, width, height };
}

function cellCenter(col: number, row: number): { x: number; y: number } {
    return { x: (col + 0.5) * CELL_SIZE, y: (row + 0.5) * CELL_SIZE };
}

export function collectMissionOverlayShapes(
    mission: MissionOverlaySource,
    map: { pois: readonly MapSegmentPOI[]; zones: readonly MapSegmentZone[] },
): MissionOverlayShape[] {
    const shapes: MissionOverlayShape[] = [];
    const zonesById = new Map(map.zones.map((z) => [z.id, z]));
    const spawnZoneIds = new Set<string>();

    const addSpawnEntryAreas = (entries: readonly SpawnWaveEntry[], source: string) => {
        for (const e of entries) {
            if (e.spawnZoneId) {
                spawnZoneIds.add(e.spawnZoneId);
            } else if (e.spawnTarget) {
                const r = e.spawnTarget.radius * CELL_SIZE;
                shapes.push({
                    layer: 'spawnAreas',
                    label: `${source}: ${e.characterId}`,
                    geometry: { type: 'ellipse', x: e.spawnTarget.x, y: e.spawnTarget.y, rx: r, ry: r },
                });
            }
        }
    };

    for (const trigger of mission.triggers ?? []) {
        for (const event of trigger.events) {
            shapes.push({ layer: 'triggerZones', label: `Trigger "${trigger.id}"`, geometry: regionGeometry(event.region) });
        }
        for (const action of trigger.actions) {
            if (action.type === 'spawnWave') addSpawnEntryAreas(action.spawns, `Trigger "${trigger.id}"`);
        }
    }

    (mission.levelEvents ?? []).forEach((evt, i) => {
        switch (evt.type) {
            case 'proximitySpawn':
                shapes.push({
                    layer: 'triggerZones',
                    label: `Proximity spawn #${i + 1}`,
                    geometry: { type: 'ellipse', x: evt.trigger.centerWorldX, y: evt.trigger.centerWorldY, rx: evt.trigger.radiusPx, ry: evt.trigger.radiusPx },
                });
                addSpawnEntryAreas(evt.spawnWaveEntries ?? [], `Proximity #${i + 1}`);
                for (const d of evt.extraEnemySpawns ?? []) {
                    shapes.push({ layer: 'spawnAreas', label: `Proximity #${i + 1}: ${d.characterId}`, geometry: { type: 'marker', ...d.position } });
                }
                break;
            case 'spawnWave':
                addSpawnEntryAreas(evt.spawns, `Wave #${i + 1}`);
                for (const d of evt.extraEnemySpawns ?? []) {
                    shapes.push({ layer: 'spawnAreas', label: `Wave #${i + 1}: ${d.characterId}`, geometry: { type: 'marker', ...d.position } });
                }
                break;
            case 'continuousSpawn':
                addSpawnEntryAreas(evt.spawns, `Continuous #${i + 1}`);
                break;
            case 'convertSpecialTile':
                shapes.push({
                    layer: 'otherEffects',
                    label: `Round ${Math.max(1, evt.trigger.atRound)}: becomes ${evt.replacementDefId}`,
                    geometry: { type: 'marker', ...cellCenter(evt.col, evt.row) },
                });
                break;
            default:
                break;
        }
    });

    for (const objective of mission.battleObjectives ?? []) {
        const c = objective.toComplete;
        if (c.type !== 'allUnitsNearPosition') continue;
        const geometry: MissionOverlayGeometry =
            c.width != null || c.height != null
                ? { type: 'rect', x: c.col * CELL_SIZE, y: c.row * CELL_SIZE, width: (c.width ?? 1) * CELL_SIZE, height: (c.height ?? 1) * CELL_SIZE }
                : (() => {
                      const d = c.maxDistance ?? 1;
                      return { type: 'rect', x: (c.col - d) * CELL_SIZE, y: (c.row - d) * CELL_SIZE, width: (2 * d + 1) * CELL_SIZE, height: (2 * d + 1) * CELL_SIZE };
                  })();
        shapes.push({ layer: 'objectiveAreas', label: objective.label, geometry });
    }

    for (const id of spawnZoneIds) {
        const zone = zonesById.get(id);
        if (zone) shapes.push({ layer: 'spawnAreas', label: `Spawn zone "${id}"`, geometry: zoneGeometry(zone) });
    }
    for (const poi of map.pois) {
        if (poi.type !== 'enemySpawn') continue;
        shapes.push({ layer: 'spawnAreas', label: `Enemy spawn point "${poi.label}"`, geometry: { type: 'marker', ...cellCenter(poi.col, poi.row) } });
    }

    return mergeIdenticalShapes(shapes);
}

const MAX_MERGED_LABELS = 3;

/** One shape per layer + geometry (e.g. several spawn entries sharing a target), with the labels joined. */
function mergeIdenticalShapes(shapes: MissionOverlayShape[]): MissionOverlayShape[] {
    const byKey = new Map<string, { shape: MissionOverlayShape; labels: string[] }>();
    for (const shape of shapes) {
        const key = `${shape.layer}|${JSON.stringify(shape.geometry)}`;
        const existing = byKey.get(key);
        if (!existing) byKey.set(key, { shape, labels: [shape.label] });
        else if (!existing.labels.includes(shape.label)) existing.labels.push(shape.label);
    }
    return [...byKey.values()].map(({ shape, labels }) => {
        const shown = labels.slice(0, MAX_MERGED_LABELS).join(', ');
        const more = labels.length > MAX_MERGED_LABELS ? ` +${labels.length - MAX_MERGED_LABELS} more` : '';
        return { ...shape, label: shown + more };
    });
}

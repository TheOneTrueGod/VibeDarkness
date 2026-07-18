import { TerrainType, TERRAIN_PROPERTIES } from '../../../games/minion_battles/terrain/TerrainType';
import { POIType } from '../../../games/minion_battles/terrain/segmentSchema';

/**
 * Hex color for each terrain type, sourced from TERRAIN_PROPERTIES.
 */
export const TERRAIN_COLORS: Record<TerrainType, string> = {
    [TerrainType.Dirt]: TERRAIN_PROPERTIES[TerrainType.Dirt].color,
    [TerrainType.Grass]: TERRAIN_PROPERTIES[TerrainType.Grass].color,
    [TerrainType.ThickGrass]: TERRAIN_PROPERTIES[TerrainType.ThickGrass].color,
    [TerrainType.Rock]: TERRAIN_PROPERTIES[TerrainType.Rock].color,
    [TerrainType.Rubble]: TERRAIN_PROPERTIES[TerrainType.Rubble].color,
    [TerrainType.Impassable]: TERRAIN_PROPERTIES[TerrainType.Impassable].color,
};

export interface POIStyle {
    color: string;
    shape: 'circle' | 'diamond' | 'square' | 'triangle';
    label: string;
}

/**
 * Visual style metadata for each POI type.
 */
export const POI_STYLES: Record<POIType, POIStyle> = {
    generic: { color: '#9E9E9E', shape: 'circle', label: 'Point' },
    campfire: { color: '#FF9800', shape: 'circle', label: 'Campfire' },
    crystal: { color: '#00BCD4', shape: 'diamond', label: 'Crystal' },
    nest: { color: '#4CAF50', shape: 'square', label: 'Nest' },
    patrol_point: { color: '#2196F3', shape: 'triangle', label: 'Patrol' },
    enemySpawn: { color: '#FFEB3B', shape: 'circle', label: 'Enemy Spawn Point' },
};

/** Pixels per grid cell in the editor canvas. */
export const EDITOR_CELL_SIZE = 24;

/** Alpha for the cell hover highlight overlay. */
export const HOVER_OVERLAY_ALPHA = 0.35;

/** Fill alpha for POI radius circles. */
export const POI_RADIUS_ALPHA = 0.15;

/** Border alpha for POI radius circles. */
export const POI_RADIUS_BORDER_ALPHA = 0.6;

/** Fill color for zone overlays (box/circle). */
export const ZONE_FILL_COLOR = '#8e44ad';

/** Fill alpha for zone overlays. */
export const ZONE_FILL_ALPHA = 0.18;

/** Border alpha for zone overlays. */
export const ZONE_BORDER_ALPHA = 0.9;

/** Border color for the currently selected zone. */
export const ZONE_SELECTED_BORDER_COLOR = '#ffffff';

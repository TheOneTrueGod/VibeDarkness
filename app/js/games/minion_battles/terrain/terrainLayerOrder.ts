import { TerrainType } from './TerrainType';

/**
 * Render order: layers are drawn bottom to top so higher-priority
 * terrain types paint over lower ones.
 * Rock and its variants last so grass/thick grass edges do not paint over stone.
 * Also the tie-break for corner owners (`cornerOwner.ts`): a later layer wins.
 */
export const LAYER_ORDER: readonly TerrainType[] = [
    TerrainType.Grass,
    TerrainType.ThickGrass,
    TerrainType.Tangle,
    TerrainType.Dirt,
    TerrainType.ShallowWater,
    TerrainType.Water,
    TerrainType.DeepWater,
    TerrainType.Gravel,
    TerrainType.Rock,
    TerrainType.Brick,
    TerrainType.Briar,
];

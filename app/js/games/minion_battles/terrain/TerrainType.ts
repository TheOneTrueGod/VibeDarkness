/**
 * TerrainType - Enum and properties for each terrain type.
 *
 * Each terrain type has a display name, color for rendering,
 * passability flag, speed multiplier, and pathfinding weight.
 */

export enum TerrainType {
    Dirt = 0,
    Grass = 1,
    ThickGrass = 2,
    Rock = 3,
    /**
     * Loose stone floor: passable but slightly slow. Authored in segments to mark ground off the main
     * paths, and left behind at runtime by destroyed rock and Earth abilities (`createRubble`).
     */
    Gravel = 4,
    /**
     * Synthetic filler for gaps in a stitched mission map (e.g. the unused corner of an L-shaped
     * layout) — see `stitchTerrain`. Renders as void (fully transparent, no fog/darkness overlay)
     * and is impassable to units, identical to the area outside the map bounds. Not in terrain
     * editor bedrock palette; never authored directly into a segment.
     */
    Impassable = 5,
    /**
     * Water level 2. Blocks walking and pathfinding but not projectiles. Forced movement (knockback,
     * lift) can carry a unit onto it, which triggers its `forcedEntryHazard` (drowning).
     */
    Water = 6,
    /** Water level 1. Walkable at half speed; projectiles pass over it. */
    ShallowWater = 7,
    /** Water level 3. Like Water, but drowning in it hurts twice as much. */
    DeepWater = 8,
    /**
     * Laid stone (castle walls): a variant of Rock (`variantOf`). Blocks exactly like Rock, but only
     * units with `'brick'` terrain access may damage it, shape it or use it as stone. See
     * "Terrain variants" in `terrain/AGENTS.md`.
     */
    Brick = 9,
    /**
     * Garden vine wall (runtime only, never authored): blocks movement and projectiles, has health
     * (`durability`) and becomes Tangle when destroyed. Placed with `TerrainManager.placeBriar`.
     */
    Briar = 10,
    /**
     * Torn-down Briar (runtime only): a Thick Grass variant (`variantOf`) that is very slow to cross and
     * stops projectiles, each stopped projectile wearing it (`projectileWear`) until it becomes Grass.
     */
    Tangle = 11,
    // Append new types only; checkpoints store these numbers, so never renumber.
}

/**
 * Capability a unit needs to mutate or draw on gated terrain (`TerrainProperties.access`). Granted
 * per unit through `Unit.terrainAccess`; checked with `canUnitAffectTerrain`.
 */
export type TerrainAccessId = 'brick';

/** Terrain hazard a unit suffers when forced onto a tile it cannot walk on. Rules: `game/terrainHazards/`. */
export type TerrainHazardId = 'drown' | 'drown_deep';

export type TerrainRenderStrategy = 'marching-squares' | 'hard-edge';

/**
 * Surface pattern a `hard-edge` layer draws over its fill, inside the cell core (drawn by
 * `HardEdgeLayerRenderer`). `running-bond`: brick courses with joints offset half a brick. `speckle`: stone
 * chips and a faint per-cell tint, varied by world cell so the tile grid does not repeat (`gravelSpeckle.ts`).
 */
export type HardEdgePatternId = 'running-bond' | 'speckle';

/** Health of one Briar tile. */
export const BRIAR_HEALTH = 30;
/** Tangle speed multiplier (Thick Grass is 0.75). */
export const TANGLE_SPEED_MULTIPLIER = 0.3;
/** Projectiles a Tangle tile stops before it wears away to Grass. */
export const TANGLE_PROJECTILE_HITS = 3;

export interface TerrainProperties {
    /** Display name. */
    name: string;
    /** Hex color string for rendering. */
    color: string;
    /** Whether units can walk on this terrain. */
    passable: boolean;
    /**
     * Whether forced movement (knockback, lift) can carry a unit onto this terrain. True for every
     * walkable type; Water and Deep Water are the non-walkable types that allow it.
     */
    forcedMovementPassable: boolean;
    /** Hazard triggered when a grounded unit ends up on this terrain (forced there). */
    forcedEntryHazard?: TerrainHazardId;
    /**
     * Depth for water types (1 shallow, 2 water, 3 deep). Rock and gravel placed on water raise the
     * ground instead of sitting on top; see `raiseGround`.
     */
    waterLevel?: number;
    /** Speed multiplier (1.0 = normal, 0.75 = 25% slower, 0 = impassable). */
    speedMultiplier: number;
    /** A* pathfinding cost weight (1.0 = normal, higher = less preferred). */
    pathfindingWeight: number;
    /** Whether ranged attacks (projectiles) can pass over this terrain. */
    projectilePassable: boolean;
    /**
     * Whether a projectile is stopped by this terrain unless a travel modifier traverses it
     * (e.g. stonephase). Rock and Impassable block, mirroring `TerrainGrid.hasLineOfSight`.
     * Read through `TerrainManager.isProjectileObstructedAt`, which uses effective terrain.
     */
    blocksProjectiles: boolean;
    /**
     * Whether this terrain stops sight lines (team vision, glimpses). Rock and Impassable block,
     * the same set as `blocksProjectiles` / `TerrainGrid.hasLineOfSight`. The blocking tile itself
     * stays visible (its face can be seen); only tiles behind it are hidden. Read through
     * `TerrainManager.blocksVisionAt` (effective terrain) and trace with `terrain/tileLine.ts`.
     */
    blocksVision: boolean;
    /**
     * Whether this terrain stops light from a source reaching tiles behind it. Same set as
     * `blocksVision`. The blocking tile itself still receives light, so a wall's face is lit.
     * Read through `TerrainManager.blocksLightAt` (effective terrain).
     */
    blocksLight: boolean;
    /** Which layer renderer to use for this terrain type. */
    renderStrategy: TerrainRenderStrategy;
    /** If true, soft-terrain (marching-squares) layers must not bleed into cells of this type. */
    blocksBleed: boolean;
    /** Other hard-edge terrain types treated as same material (no bleed/chamfer/border at shared edges). */
    hardEdgeFamily: TerrainType[];
    /** Optional pattern a `hard-edge` layer draws over its fill (Brick's mortar). Omit for a plain fill. */
    hardEdgePattern?: HardEdgePatternId;
    /**
     * Base type this terrain is a variant of (Brick -> Rock). Gameplay "what is it" checks read
     * `baseTerrainOf`, so a variant matches every list, rule and render path of its base. Omitted on
     * base types.
     */
    variantOf?: TerrainType;
    /**
     * Capability a unit needs to mutate (damage, shape) or draw on (count as stone) this terrain.
     * Omitted when there is no gate. Checked with `canUnitAffectTerrain`.
     */
    access?: TerrainAccessId;
    /**
     * Terrain with health that is not rock (Briar). A floor tile of this type carries a
     * `DestructibleState` of `kind` at `maxHealth`; at 0 it becomes `becomes`. Damage it with
     * `TerrainManager.damageDurableTerrain`.
     */
    durability?: DurabilityDef;
    /**
     * Terrain worn down by projectiles it stops (Tangle). Each stopped projectile removes one of
     * `hits` from the tile's wear counter (a `DestructibleState` of kind `WEAR_DESTRUCTIBLE_KIND`);
     * at 0 it becomes `becomes`. Needs `blocksProjectiles`. See `TerrainManager.wearTerrainByProjectile`.
     */
    projectileWear?: ProjectileWearDef;
}

/** See `TerrainProperties.durability`. */
export interface DurabilityDef {
    maxHealth: number;
    /** `DestructibleState.kind` written on the floor tile. */
    kind: string;
    /** Terrain left behind when health reaches 0. */
    becomes: TerrainType;
}

/** See `TerrainProperties.projectileWear`. */
export interface ProjectileWearDef {
    hits: number;
    becomes: TerrainType;
}

/** `DestructibleState.kind` of a worn terrain tile's remaining projectile hits (Tangle). */
export const WEAR_DESTRUCTIBLE_KIND = 'wear';

export const TERRAIN_PROPERTIES: Record<TerrainType, TerrainProperties> = {
    [TerrainType.Dirt]: {
        name: 'Dirt',
        color: '#8B6914',
        passable: true,
        forcedMovementPassable: true,
        speedMultiplier: 1.0,
        pathfindingWeight: 1.0,
        projectilePassable: true,
        blocksProjectiles: false,
        blocksVision: false,
        blocksLight: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.Grass]: {
        name: 'Grass',
        color: '#4CAF50',
        passable: true,
        forcedMovementPassable: true,
        speedMultiplier: 1.0,
        pathfindingWeight: 1.0,
        projectilePassable: true,
        blocksProjectiles: false,
        blocksVision: false,
        blocksLight: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.ThickGrass]: {
        name: 'Thick Grass',
        color: '#2E7D32',
        passable: true,
        forcedMovementPassable: true,
        speedMultiplier: 0.75,
        pathfindingWeight: 1.5,
        projectilePassable: true,
        blocksProjectiles: false,
        blocksVision: false,
        blocksLight: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.Rock]: {
        name: 'Rock',
        color: '#757575',
        passable: false,
        forcedMovementPassable: false,
        speedMultiplier: 0,
        pathfindingWeight: Infinity,
        projectilePassable: true,
        blocksProjectiles: true,
        blocksVision: true,
        blocksLight: true,
        renderStrategy: 'hard-edge',
        blocksBleed: true,
        hardEdgeFamily: [TerrainType.Brick],
    },
    [TerrainType.Gravel]: {
        name: 'Gravel',
        // Pale limestone: a warm sandy base, with the speckle pattern below adding lighter and darker chips.
        color: '#9a8c72',
        passable: true,
        forcedMovementPassable: true,
        speedMultiplier: 0.85,
        pathfindingWeight: 1.2,
        projectilePassable: true,
        blocksProjectiles: false,
        blocksVision: false,
        blocksLight: false,
        renderStrategy: 'hard-edge',
        blocksBleed: true,
        hardEdgeFamily: [TerrainType.Rock, TerrainType.Brick],
        hardEdgePattern: 'speckle',
    },
    [TerrainType.Impassable]: {
        name: 'Impassable',
        // Never actually painted — TerrainRenderer skips this type entirely (renders as void).
        color: '#1a1a2e',
        // Matches TerrainGrid.get()'s out-of-bounds fallback (Rock) exactly, so this behaves
        // identically to standing just past the edge of the map.
        passable: false,
        forcedMovementPassable: false,
        speedMultiplier: 0,
        pathfindingWeight: Infinity,
        projectilePassable: true,
        blocksProjectiles: true,
        blocksVision: true,
        blocksLight: true,
        // Unused: excluded from TerrainRenderer's LAYER_ORDER, so no layer renderer ever runs for it.
        renderStrategy: 'hard-edge',
        blocksBleed: true,
        hardEdgeFamily: [],
    },
    [TerrainType.Water]: {
        name: 'Water',
        color: '#2F7FD6',
        passable: false,
        forcedMovementPassable: true,
        forcedEntryHazard: 'drown',
        waterLevel: 2,
        speedMultiplier: 0,
        pathfindingWeight: Infinity,
        projectilePassable: true,
        blocksProjectiles: false,
        blocksVision: false,
        blocksLight: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.ShallowWater]: {
        name: 'Shallow Water',
        color: '#7DBDF0',
        passable: true,
        forcedMovementPassable: true,
        waterLevel: 1,
        speedMultiplier: 0.5,
        pathfindingWeight: 2.0,
        projectilePassable: true,
        blocksProjectiles: false,
        blocksVision: false,
        blocksLight: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.DeepWater]: {
        name: 'Deep Water',
        color: '#1B4A94',
        passable: false,
        forcedMovementPassable: true,
        forcedEntryHazard: 'drown_deep',
        waterLevel: 3,
        speedMultiplier: 0,
        pathfindingWeight: Infinity,
        projectilePassable: true,
        blocksProjectiles: false,
        blocksVision: false,
        blocksLight: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.Brick]: {
        // Rock copy (see `variantOf`); only the name, colour, mortar pattern and access gate differ.
        name: 'Brick',
        // Brick-red grey: reads as stone next to Rock (#757575) but warmer.
        color: '#86675e',
        passable: false,
        forcedMovementPassable: false,
        speedMultiplier: 0,
        pathfindingWeight: Infinity,
        projectilePassable: true,
        blocksProjectiles: true,
        blocksVision: true,
        blocksLight: true,
        renderStrategy: 'hard-edge',
        blocksBleed: true,
        // Mirrors Rock's relations: joins Rock both ways, and Gravel lists Brick as it lists Rock.
        hardEdgeFamily: [TerrainType.Rock],
        hardEdgePattern: 'running-bond',
        variantOf: TerrainType.Rock,
        access: 'brick',
    },
    [TerrainType.Briar]: {
        name: 'Briar',
        color: '#1f4d3f',
        passable: false,
        forcedMovementPassable: false,
        speedMultiplier: 0,
        pathfindingWeight: Infinity,
        projectilePassable: true,
        blocksProjectiles: true,
        // A tangle of vines: you can see and light through it.
        blocksVision: false,
        blocksLight: false,
        renderStrategy: 'hard-edge',
        blocksBleed: true,
        hardEdgeFamily: [],
        durability: { maxHealth: BRIAR_HEALTH, kind: 'briar', becomes: TerrainType.Tangle },
    },
    [TerrainType.Tangle]: {
        name: 'Tangle',
        color: '#24663f',
        passable: true,
        forcedMovementPassable: true,
        // Much slower than Thick Grass (0.75).
        speedMultiplier: TANGLE_SPEED_MULTIPLIER,
        pathfindingWeight: 4.0,
        projectilePassable: true,
        blocksProjectiles: true,
        blocksVision: false,
        blocksLight: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
        variantOf: TerrainType.ThickGrass,
        projectileWear: { hits: TANGLE_PROJECTILE_HITS, becomes: TerrainType.Grass },
    },
};

/**
 * The base type a terrain behaves as: `variantOf`, or the type itself for base types. Use for
 * "what is this terrain" questions (collision lists, blocking lists, rock-like render paths).
 */
export function baseTerrainOf(type: TerrainType): TerrainType {
    return TERRAIN_PROPERTIES[type]?.variantOf ?? type;
}

/** True when `list` names `type` itself or its base type (`baseTerrainOf`). */
export function terrainListIncludes(list: readonly TerrainType[], type: TerrainType): boolean {
    return list.includes(type) || list.includes(baseTerrainOf(type));
}

/**
 * True when an actor holding `access` may mutate or draw on `type`: the type has no `access` gate,
 * or the set holds it. Null (no actor, or an unresolved one) only passes ungated terrain. Use for
 * "may this actor change it" questions (damage, shaping, counting as stone, stonephase).
 */
export function canUnitAffectTerrain(
    type: TerrainType,
    access: ReadonlySet<TerrainAccessId> | null | undefined,
): boolean {
    const gate = TERRAIN_PROPERTIES[type]?.access;
    if (gate === undefined) return true;
    return access?.has(gate) ?? false;
}

/**
 * Actor-aware list match: `type` is named directly, or its base type is named and the actor may
 * affect it (`canUnitAffectTerrain`). E.g. a `[Rock]` condition matches Brick only with access.
 */
export function terrainListIncludesForActor(
    list: readonly TerrainType[],
    type: TerrainType,
    access: ReadonlySet<TerrainAccessId> | null | undefined,
): boolean {
    if (list.includes(type)) return true;
    return list.includes(baseTerrainOf(type)) && canUnitAffectTerrain(type, access);
}

/** How much each kind of placed stone raises the ground on water (lowers its water level). */
export const GROUND_RAISE = {
    rock: 2,
    gravel: 1,
} as const;

/**
 * Terrain for each water level when stone fills water in; level 0 is gravel (the stone is still
 * there). Draining water away (`lowerWaterLevel`) bottoms out at Dirt instead: a dried-up puddle,
 * not filled-in water.
 */
const TERRAIN_FOR_WATER_LEVEL: readonly TerrainType[] = [
    TerrainType.Gravel,
    TerrainType.ShallowWater,
    TerrainType.Water,
    TerrainType.DeepWater,
];

/** Water types (any `waterLevel`), e.g. what a sliding rock sinks into. */
export const WATER_TERRAIN_TYPES: readonly TerrainType[] = (
    Object.keys(TERRAIN_PROPERTIES).map(Number) as TerrainType[]
).filter((type) => (TERRAIN_PROPERTIES[type].waterLevel ?? 0) > 0);

/**
 * What a water tile becomes when stone raises its ground by `amount` levels (rock 2, gravel 1):
 * deep + rock = shallow, water + gravel = shallow, shallow + gravel = gravel. Null for non-water.
 */
export function raiseGround(type: TerrainType, amount: number): TerrainType | null {
    const level = TERRAIN_PROPERTIES[type].waterLevel;
    if (!level) return null;
    return TERRAIN_FOR_WATER_LEVEL[Math.max(0, level - amount)];
}

/** Terrain a drained-dry tile (water level 0) becomes. Unlike `raiseGround`, no stone is left behind. */
const DRAINED_DRY_TERRAIN = TerrainType.Dirt;

/**
 * What a water tile becomes when it is drained by one level: deep -> water -> shallow -> dirt.
 * Null for non-water. See `TerrainManager.drainWater`.
 */
export function lowerWaterLevel(type: TerrainType): TerrainType | null {
    const level = TERRAIN_PROPERTIES[type].waterLevel;
    if (!level) return null;
    return level <= 1 ? DRAINED_DRY_TERRAIN : TERRAIN_FOR_WATER_LEVEL[level - 1];
}

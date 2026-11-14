/**
 * Brick terrain (a gated Rock variant; see "Terrain variants" in `terrain/AGENTS.md`).
 *
 * Two scenarios, because they cover the two halves of the variant rule: what Brick *is* (it blocks
 * like Rock for everyone) and who may *change* it (only units with `'brick'` terrain access).
 */
import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import type { Unit } from '../../../game/units/Unit';
import { Projectile } from '../../../game/projectiles/Projectile';
import { TerrainType } from '../../../terrain/TerrainType';
import { Rock } from '../../../resources/Rock';
import {
    buildTinyBattleEngine,
    MOVE_ONLY_ABILITY_ID,
    placeTargetDummy,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import {
    EARTH_CORE_STONE_HEALTH,
    GATHER_STONE_CAST_TIME,
    GATHER_STONE_ROCK_DAMAGE,
} from '../../../card_defs/05_earth_core/earthCoreConstants';

const CELL = 40;
const cellCentre = (col: number, row: number) => ({ x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 });

function unitOwnedBy(engine: GameEngine, ownerId: string): Unit | undefined {
    return engine.units.find((u) => u.ownerId === ownerId);
}

// ---------------------------------------------------------------------------
// brick_needs_access: two Earth Core units cast Gather Stone on a cracked Brick wall each.
// The novice (no access) leaves its brick exactly as it was; the mason (`terrainAccess: ['brick']`)
// breaks its brick into Gravel. Both bricks start cracked so one Gather Stone hit can finish one off.
// ---------------------------------------------------------------------------

const NOVICE_ID = TINY_BATTLE_PLAYER_ID;
const MASON_ID = 'tiny_mason';
const NOVICE_CELL = { col: 2, row: 4 };
const MASON_CELL = { col: 9, row: 4 };
/** Gather Stone's 3x3 patch is centred one tile east of each caster; the brick sits in its top row. */
const NOVICE_TARGET = { col: 3, row: 4 };
const MASON_TARGET = { col: 10, row: 4 };
const NOVICE_BRICK = { col: 3, row: 3 };
const MASON_BRICK = { col: 10, row: 3 };
/** Health each brick starts at: exactly one Gather Stone hit from breaking. */
const CRACKED_BRICK_HEALTH = GATHER_STONE_ROCK_DAMAGE;

export const brickNeedsAccessScenario: ScenarioDefinition = {
    id: 'brick_needs_access',
    title: 'Brick: Gather Stone breaks cracked Brick into Gravel only for a unit with brick access',
    category: 'general',
    generalSection: 'Terrain',
    maxDurationMs: 3000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 13, gridH: 7, localPlayerId: NOVICE_ID, grass: true });
        const tm = engine.terrainManager!;
        tm.grid.set(NOVICE_BRICK.col, NOVICE_BRICK.row, TerrainType.Brick);
        tm.grid.set(MASON_BRICK.col, MASON_BRICK.row, TerrainType.Brick);

        const novice = spawnTinyPlayerUnit(engine, {
            playerId: NOVICE_ID,
            name: 'Novice',
            ...cellCentre(NOVICE_CELL.col, NOVICE_CELL.row),
            abilities: ['0536'],
        });
        const mason = spawnTinyPlayerUnit(engine, {
            playerId: MASON_ID,
            name: 'Mason',
            ...cellCentre(MASON_CELL.col, MASON_CELL.row),
            abilities: ['0536'],
            terrainAccess: ['brick'],
        });
        novice.attachResource(new Rock(), engine.eventBus);
        mason.attachResource(new Rock(), engine.eventBus);

        // Crack both bricks (the mason's access is what lets setup chip them at all).
        const crack = EARTH_CORE_STONE_HEALTH - CRACKED_BRICK_HEALTH;
        tm.damageRock(NOVICE_BRICK.col, NOVICE_BRICK.row, crack, mason.id);
        tm.damageRock(MASON_BRICK.col, MASON_BRICK.row, crack, mason.id);
        return engine;
    },
    getInitialOrders(engine) {
        const novice = unitOwnedBy(engine, NOVICE_ID)!;
        const mason = unitOwnedBy(engine, MASON_ID)!;
        return [
            { unitId: novice.id, abilityId: '0536', targets: [{ type: 'pixel' as const, position: cellCentre(NOVICE_TARGET.col, NOVICE_TARGET.row) }] },
            { unitId: mason.id, abilityId: '0536', targets: [{ type: 'pixel' as const, position: cellCentre(MASON_TARGET.col, MASON_TARGET.row) }] },
        ];
    },
    assertPass(e) {
        const tm = e.terrainManager!;
        const novice = unitOwnedBy(e, NOVICE_ID);
        const mason = unitOwnedBy(e, MASON_ID);
        return Boolean(
            novice
            && mason
            // Both casts have finished, so the novice had its full chance to break the brick.
            && e.gameTime >= GATHER_STONE_CAST_TIME
            && tm.getEffectiveTerrainType(NOVICE_BRICK.col, NOVICE_BRICK.row) === TerrainType.Brick
            && tm.getRockHealth(NOVICE_BRICK.col, NOVICE_BRICK.row) === CRACKED_BRICK_HEALTH
            && (novice.getResource('rock')?.current ?? 0) === 0
            && tm.getEffectiveTerrainType(MASON_BRICK.col, MASON_BRICK.row) === TerrainType.Gravel
            && (mason.getResource('rock')?.current ?? 0) > 0,
        );
    },
    failureMessage(e) {
        const tm = e.terrainManager!;
        const novice = unitOwnedBy(e, NOVICE_ID);
        const mason = unitOwnedBy(e, MASON_ID);
        return `t=${e.gameTime.toFixed(2)}s; novice brick=${tm.getEffectiveTerrainType(NOVICE_BRICK.col, NOVICE_BRICK.row)} `
            + `hp=${tm.getRockHealth(NOVICE_BRICK.col, NOVICE_BRICK.row)} (want Brick, ${CRACKED_BRICK_HEALTH}); `
            + `novice rock=${novice?.getResource('rock')?.current ?? '?'} (want 0); `
            + `mason brick=${tm.getEffectiveTerrainType(MASON_BRICK.col, MASON_BRICK.row)} (want Gravel); `
            + `mason rock=${mason?.getResource('rock')?.current ?? '?'} (want > 0)`;
    },
};

// ---------------------------------------------------------------------------
// brick_blocks_like_rock: a Brick wall (col 5, rows 2-7) with a gap at the top.
// A `collidesWithTerrain: [Rock]` shot down row 6 stops at the wall (and, fired by a unit without
// access, leaves the brick intact even with `rockHitsToBreak: 1`); the dummy behind it is untouched.
// The player walks from (1, 4) to (8, 4) round the top of the wall.
// ---------------------------------------------------------------------------

const WALL_COL = 5;
const WALL_ROWS = { from: 2, to: 7 };
const WALK_FROM = { col: 1, row: 4 };
const WALK_TO = { col: 8, row: 4 };
const SHOT_ROW = 6;
const SHOT_FROM_COL = 1;
const SHIELDED_DUMMY_CELL = { col: 8, row: SHOT_ROW };
const SHIELDED_DUMMY_ID = 'brick_shielded_dummy';

/** The shot and the planned path, kept for the assertions (reset in `buildEngine`). */
export const brickBlocksLikeRockScenarioState = {
    shot: null as Projectile | null,
    path: null as { col: number; row: number }[] | null,
};

function isWallCell(col: number, row: number): boolean {
    return col === WALL_COL && row >= WALL_ROWS.from && row <= WALL_ROWS.to;
}

export const brickBlocksLikeRockScenario: ScenarioDefinition = {
    id: 'brick_blocks_like_rock',
    title: 'Brick: a [Rock]-colliding shot stops at a Brick wall, and a unit paths round it',
    category: 'general',
    generalSection: 'Terrain',
    maxDurationMs: 10000,
    buildEngine() {
        brickBlocksLikeRockScenarioState.shot = null;
        brickBlocksLikeRockScenarioState.path = null;

        const engine = buildTinyBattleEngine({ gridW: 11, gridH: 8, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        const tm = engine.terrainManager!;
        for (let row = WALL_ROWS.from; row <= WALL_ROWS.to; row++) tm.grid.set(WALL_COL, row, TerrainType.Brick);

        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            ...cellCentre(WALK_FROM.col, WALK_FROM.row),
            abilities: ['0120'],
        });
        // Scripted move only: no AI tree to overwrite it.
        player.unitAITreeId = 'static_test_no_ai';
        placeTargetDummy(engine, cellCentre(SHIELDED_DUMMY_CELL.col, SHIELDED_DUMMY_CELL.row), SHIELDED_DUMMY_ID);

        const from = cellCentre(SHOT_FROM_COL, SHOT_ROW);
        const shot = new Projectile({
            id: 'brick_lane_shot',
            x: from.x,
            y: from.y,
            velocityX: 300,
            velocityY: 0,
            damage: 10,
            sourceTeamId: 'player',
            sourceUnitId: player.id,
            sourceAbilityId: 'brick_blocks_like_rock',
            maxDistance: 10 * CELL,
            collidesWithTerrain: [TerrainType.Rock],
            rockHitsToBreak: 1,
        });
        engine.addProjectile(shot);
        brickBlocksLikeRockScenarioState.shot = shot;
        return engine;
    },
    getInitialOrders(engine) {
        const tm = engine.terrainManager!;
        const u = engine.getLocalPlayerUnit()!;
        const path = tm.findGridPath(WALK_FROM.col, WALK_FROM.row, WALK_TO.col, WALK_TO.row);
        brickBlocksLikeRockScenarioState.path = path;
        if (!path) return [];
        return [{ unitId: u.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: path }];
    },
    assertPass(e) {
        const tm = e.terrainManager!;
        const u = e.getLocalPlayerUnit();
        const dummy = e.getUnit(SHIELDED_DUMMY_ID);
        const { shot, path } = brickBlocksLikeRockScenarioState;
        if (!u || !dummy || !shot || !path) return false;
        const goal = cellCentre(WALK_TO.col, WALK_TO.row);
        const wallIntact = Array.from({ length: WALL_ROWS.to - WALL_ROWS.from + 1 }, (_, i) => WALL_ROWS.from + i)
            .every((row) => tm.getEffectiveTerrainType(WALL_COL, row) === TerrainType.Brick);
        return !shot.active
            && shot.stoppedAtTerrain?.terrainType === TerrainType.Brick
            && shot.stoppedAtTerrain.col === WALL_COL
            && dummy.hp === dummy.maxHp
            && wallIntact
            // findGridPath returns sparse waypoints: the route goes over the top of the wall.
            && path.every((c) => !isWallCell(c.col, c.row))
            && path.some((c) => c.row < WALL_ROWS.from)
            && u.movement === null
            && Math.hypot(u.x - goal.x, u.y - goal.y) <= CELL * 0.75;
    },
    failureMessage(e) {
        const tm = e.terrainManager!;
        const u = e.getLocalPlayerUnit();
        const dummy = e.getUnit(SHIELDED_DUMMY_ID);
        const { shot, path } = brickBlocksLikeRockScenarioState;
        const stop = shot?.stoppedAtTerrain;
        return `shot active=${shot?.active ?? '?'} stoppedAt=${stop ? `(${stop.col},${stop.row}) type ${stop.terrainType}` : 'none'} (want Brick at col ${WALL_COL}); `
            + `wall cell (${WALL_COL},${SHOT_ROW})=${tm.getEffectiveTerrainType(WALL_COL, SHOT_ROW)} (want Brick); `
            + `dummy lost ${dummy ? dummy.maxHp - dummy.hp : '?'} hp (want 0); `
            + `path=${path ? `${path.length} waypoints, on wall=${path.some((c) => isWallCell(c.col, c.row))}, `
                + `over the top=${path.some((c) => c.row < WALL_ROWS.from)}` : 'none'}; `
            + `player movement=${u?.movement ? 'path' : 'null'} pos=${u ? `${u.x.toFixed(0)},${u.y.toFixed(0)}` : 'none'}`;
    },
};

export const BRICK_TERRAIN_SCENARIOS: ScenarioDefinition[] = [brickNeedsAccessScenario, brickBlocksLikeRockScenario];

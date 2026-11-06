/**
 * AbilityTest: CrowdSpacing **mass** resolver behaviour (see `docs/plans/crowd-spacing-mass-resolver.md`).
 *
 * Each scenario pins `MassResolver` in `buildEngine()` so it passes whatever `CROWD_SPACING_MODE` says.
 * Assertions are high-level (blocked / braced / heavy beats light / capped push speed), not exact numbers.
 * Per-tick measurements are tracked from `assertPass`, which the runner calls once per tick.
 */

import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import type { Unit } from '../../../game/units/Unit';
import {
    buildTinyBattleEngine,
    MOVE_ONLY_ABILITY_ID,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { UnitTag } from '../../../game/units/unitTag';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { TerrainType } from '../../../terrain/TerrainType';
import { MassResolver } from '../../../game/crowdSpacing/mass/MassResolver';
import { CROWD_MASS_PUSH_BUDGET_SPEED_FRACTION } from '../../../game/crowdSpacing/mass/massConstants';
import { getCrowdSpacingRadius } from '../../../game/crowdSpacing/shared/crowdSpacingParticipation';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const SECTION = 'Movement';
/** Runner tick length (60 Hz, world pace 1 in these scenarios). */
const TICK_SEC = 1 / 60;

const centre = (col: number, row: number) => ({ x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 });

function buildMassEngine(gridW: number, gridH: number): GameEngine {
    const engine = buildTinyBattleEngine({ gridW, gridH, localPlayerId: P, grass: true });
    engine.crowdSpacingManager.setResolver(new MassResolver());
    return engine;
}

/** A player that only moves when ordered (no AI). */
function spawnOrderedPlayer(engine: GameEngine, col: number, row: number): Unit {
    const { x, y } = centre(col, row);
    const player = spawnTinyPlayerUnit(engine, { playerId: P, x, y, abilities: [] });
    player.unitAITreeId = 'static_test_no_ai';
    return player;
}

/** A stationary, out-of-the-way player whose queued waits keep the sim from going idle. */
function spawnWaitingPlayer(engine: GameEngine, col: number, row: number, untilTick: number): Unit {
    const player = spawnOrderedPlayer(engine, col, row);
    for (let tick = 90; tick <= untilTick; tick += 90) {
        engine.state.orderMgr.queueOrder(tick, { unitId: player.id, abilityId: 'wait', targets: [] });
    }
    return player;
}

/** An AI-less enemy at a cell centre (or exact world point). */
function spawnEnemy(
    engine: GameEngine,
    opts: {
        id: string;
        characterId: string;
        at: { x: number; y: number };
        abilities?: string[];
        unitTags?: UnitTag[];
    },
): Unit {
    const unit = createUnitFromSpawnConfig(
        {
            id: opts.id,
            characterId: opts.characterId,
            name: opts.id,
            x: opts.at.x,
            y: opts.at.y,
            teamId: 'enemy',
            ownerId: 'ai',
            abilities: opts.abilities ?? [],
            unitAITreeId: 'static_test_no_ai',
            unitTags: opts.unitTags,
        },
        engine.eventBus,
        engine,
    );
    initializeAbilityRuntimeForUnit(unit);
    engine.addUnit(unit, 'initialGameSpawn');
    return unit;
}

function fmt(u: Unit | null | undefined): string {
    return u ? `(${u.x.toFixed(1)},${u.y.toFixed(1)})` : 'missing';
}

function moveOrder(engine: GameEngine, unit: Unit, toCol: number, toRow: number) {
    const tm = engine.terrainManager!;
    const from = tm.grid.worldToGrid(unit.x, unit.y);
    const movePath = tm.findGridPath(from.col, from.row, toCol, toRow) ?? [];
    return { unitId: unit.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath };
}

// ─── 1. Hallway blockade ────────────────────────────────────────────────────

const HALL_ROW = 1;
const HALL_PLAYER_COL = 1;
const HALL_GOAL_COL = 14;
const HALL_ENEMY_COLS = [5, 6, 7, 8];
const HALL_ENEMY_IDS = HALL_ENEMY_COLS.map((c) => `hall_slime_${c}`);
/** The player has had this long (it walks the whole hallway in ~3 s unobstructed). */
const HALL_TIME_SEC = 4;

/**
 * A player orders a move down a 1-cell corridor filled with regular (Medium) enemies. The enemy
 * line yields only at its own resisted budget and hands the rest back to the pusher, so the player
 * is still behind the whole line after {@link HALL_TIME_SEC}.
 */
export const crowdMassHallwayBlockadeScenario: ScenarioDefinition = {
    id: 'crowd_mass_hallway_blockade',
    title: 'CrowdSpacing (mass): player cannot shove through a hallway of enemies',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: (HALL_TIME_SEC + 1) * 1000,

    buildEngine() {
        const engine = buildMassEngine(16, 3);
        const tm = engine.terrainManager!;
        for (let col = 0; col < 16; col++) {
            tm.grid.set(col, 0, TerrainType.Rock);
            tm.grid.set(col, 2, TerrainType.Rock);
        }
        tm.clearPathCache();
        spawnOrderedPlayer(engine, HALL_PLAYER_COL, HALL_ROW);
        HALL_ENEMY_COLS.forEach((col, i) => {
            spawnEnemy(engine, { id: HALL_ENEMY_IDS[i]!, characterId: 'slime', at: centre(col, HALL_ROW) });
        });
        return engine;
    },

    getInitialOrders(engine) {
        return [moveOrder(engine, engine.getLocalPlayerUnit()!, HALL_GOAL_COL, HALL_ROW)];
    },

    assertPass(engine) {
        if (engine.gameTime < HALL_TIME_SEC) return false;
        const player = engine.getLocalPlayerUnit();
        if (!player) return false;
        for (const id of HALL_ENEMY_IDS) {
            const enemy = engine.getUnit(id);
            if (!enemy || player.x >= enemy.x) return false;
        }
        // Not just behind: the line must have held most of the way (no slow bulldoze).
        return player.x < centre(HALL_ENEMY_COLS[HALL_ENEMY_COLS.length - 1]!, HALL_ROW).x;
    },

    failureMessage(engine) {
        const enemies = HALL_ENEMY_IDS.map((id) => `${id}=${fmt(engine.getUnit(id))}`);
        return `t=${engine.gameTime.toFixed(2)} player=${fmt(engine.getLocalPlayerUnit())} ${enemies.join(' ')}`;
    },
};

// ─── 2. Windup brace ────────────────────────────────────────────────────────

const BRACE_WOLF_ID = 'brace_wolf';
const BRACE_ROW = 2;
const BRACE_WOLF_POS = centre(6, BRACE_ROW);
/** Alpha Wolf Charge (ChargeAttack): 1 s windup, then the lunge. */
const BRACE_CHARGE_ID = '0007';
/** Assert inside the windup (cast starts at tick 1; windup ends ~1.02 s). */
const BRACE_ASSERT_FROM_SEC = 0.8;
const BRACE_ASSERT_UNTIL_SEC = 0.95;
const BRACE_STAY_EPSILON = 0.01;
/** Slack on "in contact" (player is pushed back each tick by up to one step of walking). */
const BRACE_CONTACT_SLACK = 3;

/**
 * A light wolf (Extra Small) winds up Alpha Wolf Charge aimed away from the player while the player
 * walks straight into it. Windup braces the wolf, so it does not budge (its charge aim stays true)
 * and the player takes the whole correction.
 */
export const crowdMassWindupBraceScenario: ScenarioDefinition = {
    id: 'crowd_mass_windup_brace',
    title: 'CrowdSpacing (mass): a wolf in charge windup is not pushed by a walking player',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 1500,

    buildEngine() {
        const engine = buildMassEngine(12, 5);
        const player = spawnOrderedPlayer(engine, 4, BRACE_ROW);
        // Start just outside contact so the push begins within a few ticks.
        player.x = BRACE_WOLF_POS.x - 60;
        const wolf = spawnEnemy(engine, {
            id: BRACE_WOLF_ID,
            characterId: 'dark_wolf',
            at: BRACE_WOLF_POS,
            abilities: [BRACE_CHARGE_ID],
        });
        engine.state.orderMgr.queueOrder(1, {
            unitId: wolf.id,
            abilityId: BRACE_CHARGE_ID,
            targets: [{ type: 'pixel', position: { x: BRACE_WOLF_POS.x, y: BRACE_WOLF_POS.y + 100 } }],
        });
        return engine;
    },

    getInitialOrders(engine) {
        return [moveOrder(engine, engine.getLocalPlayerUnit()!, 10, BRACE_ROW)];
    },

    assertPass(engine) {
        if (engine.gameTime < BRACE_ASSERT_FROM_SEC || engine.gameTime > BRACE_ASSERT_UNTIL_SEC) return false;
        const wolf = engine.getUnit(BRACE_WOLF_ID);
        const player = engine.getLocalPlayerUnit();
        if (!wolf || !player) return false;
        if (!wolf.activeAbilities.some((a) => a.abilityId === BRACE_CHARGE_ID)) return false;
        const wolfDrift = Math.hypot(wolf.x - BRACE_WOLF_POS.x, wolf.y - BRACE_WOLF_POS.y);
        if (wolfDrift > BRACE_STAY_EPSILON) return false;
        const contact = getCrowdSpacingRadius(wolf) + getCrowdSpacingRadius(player) + BRACE_CONTACT_SLACK;
        return Math.hypot(wolf.x - player.x, wolf.y - player.y) <= contact;
    },

    failureMessage(engine) {
        const wolf = engine.getUnit(BRACE_WOLF_ID);
        const active = wolf?.activeAbilities.map((a) => a.abilityId).join(',') ?? '-';
        return `t=${engine.gameTime.toFixed(2)} wolf=${fmt(wolf)} (start ${BRACE_WOLF_POS.x},${BRACE_WOLF_POS.y}) ` +
            `active=[${active}] player=${fmt(engine.getLocalPlayerUnit())}`;
    },
};

// ─── 3. Size ────────────────────────────────────────────────────────────────

const SIZE_SMALL_WALKER_ID = 'size_small_walker';
const SIZE_BOSS_ID = 'size_boss';
const SIZE_LARGE_WALKER_ID = 'size_large_walker';
const SIZE_SMALL_TARGET_ID = 'size_small_target';
const SIZE_LANE_A_ROW = 1;
const SIZE_LANE_B_ROW = 4;
const SIZE_WALKER_COL = 2;
const SIZE_TARGET_COL = 5;
const SIZE_WALK_GOAL_COL = 10;
const SIZE_TIME_SEC = 2.5;
/** The boss must move less than this fraction of what the Large unit does to the small one. */
const SIZE_MAX_RATIO = 0.25;
/** The small unit must be pushed at least this far by the Large walker. */
const SIZE_MIN_SMALL_PUSH = CELL * 0.5;

type SizeStarts = { boss: { x: number; y: number }; small: { x: number; y: number } };
const sizeStarts = new WeakMap<GameEngine, SizeStarts>();

function sizeDisplacements(engine: GameEngine): { boss: number; small: number } | null {
    const starts = sizeStarts.get(engine);
    const boss = engine.getUnit(SIZE_BOSS_ID);
    const small = engine.getUnit(SIZE_SMALL_TARGET_ID);
    if (!starts || !boss || !small) return null;
    return {
        boss: Math.hypot(boss.x - starts.boss.x, boss.y - starts.boss.y),
        small: Math.hypot(small.x - starts.small.x, small.y - starts.small.y),
    };
}

/**
 * Two lanes, all one team (no resistance):
 * - Lane A: a Diminutive swarmling walks into a boss-tagged Alpha Wolf; the boss barely moves.
 * - Lane B: a Large boar walks into a Diminutive swarmling; the swarmling is shoved aside.
 */
export const crowdMassSizeScenario: ScenarioDefinition = {
    id: 'crowd_mass_size',
    title: 'CrowdSpacing (mass): small cannot shove a boss; Large shoves small',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: (SIZE_TIME_SEC + 1) * 1000,

    buildEngine() {
        const engine = buildMassEngine(12, 7);
        spawnWaitingPlayer(engine, 0, 6, Math.ceil((SIZE_TIME_SEC + 1) / TICK_SEC));

        const smallWalker = spawnEnemy(engine, {
            id: SIZE_SMALL_WALKER_ID,
            characterId: 'swarmling',
            at: centre(SIZE_WALKER_COL, SIZE_LANE_A_ROW),
        });
        const boss = spawnEnemy(engine, {
            id: SIZE_BOSS_ID,
            characterId: 'alpha_wolf',
            at: centre(SIZE_TARGET_COL, SIZE_LANE_A_ROW),
            unitTags: [UnitTag.Boss],
        });
        const largeWalker = spawnEnemy(engine, {
            id: SIZE_LARGE_WALKER_ID,
            characterId: 'boar',
            at: centre(SIZE_WALKER_COL, SIZE_LANE_B_ROW),
        });
        const small = spawnEnemy(engine, {
            id: SIZE_SMALL_TARGET_ID,
            characterId: 'swarmling',
            at: centre(SIZE_TARGET_COL, SIZE_LANE_B_ROW),
        });
        smallWalker.setWalkGoal({ kind: 'cell', col: SIZE_WALK_GOAL_COL, row: SIZE_LANE_A_ROW });
        largeWalker.setWalkGoal({ kind: 'cell', col: SIZE_WALK_GOAL_COL, row: SIZE_LANE_B_ROW });
        sizeStarts.set(engine, { boss: { x: boss.x, y: boss.y }, small: { x: small.x, y: small.y } });
        return engine;
    },

    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        if (engine.gameTime < SIZE_TIME_SEC) return false;
        const d = sizeDisplacements(engine);
        if (!d) return false;
        return d.small >= SIZE_MIN_SMALL_PUSH && d.boss < d.small * SIZE_MAX_RATIO;
    },

    failureMessage(engine) {
        const d = sizeDisplacements(engine);
        return `t=${engine.gameTime.toFixed(2)} bossMoved=${d?.boss.toFixed(2)} smallMoved=${d?.small.toFixed(2)} ` +
            `smallWalker=${fmt(engine.getUnit(SIZE_SMALL_WALKER_ID))} boss=${fmt(engine.getUnit(SIZE_BOSS_ID))} ` +
            `boar=${fmt(engine.getUnit(SIZE_LARGE_WALKER_ID))} small=${fmt(engine.getUnit(SIZE_SMALL_TARGET_ID))}`;
    },
};

// ─── 4. Push speed cap ──────────────────────────────────────────────────────

const CAP_PUSHER_ID = 'cap_fast_pusher';
const CAP_SLOW_ID = 'cap_slow_target';
const CAP_ROW = 2;
const CAP_TIME_SEC = 2;
/** Float slack on the per-tick budget comparison. */
const CAP_STEP_SLACK = 1e-6;
/**
 * The push must actually have reached the cap on some tick (otherwise the scenario proves nothing).
 * The dog then slides round the swarmling, so total distance is not a stable measure.
 */
const CAP_MIN_REACHED_FRACTION = 0.9;

type CapTrack = {
    lastTick: number;
    lastX: number;
    lastY: number;
    startX: number;
    startY: number;
    maxStep: number;
};
const capTracks = new WeakMap<GameEngine, CapTrack>();

function capBudgetPerTick(slow: Unit): number {
    return CROWD_MASS_PUSH_BUDGET_SPEED_FRACTION * slow.speed * TICK_SEC;
}

function updateCapTrack(engine: GameEngine): { track: CapTrack; slow: Unit } | null {
    const track = capTracks.get(engine);
    const slow = engine.getUnit(CAP_SLOW_ID);
    if (!track || !slow) return null;
    if (engine.gameTick !== track.lastTick) {
        const step = Math.hypot(slow.x - track.lastX, slow.y - track.lastY);
        // Average over ticks in case the runner skipped a call.
        const ticks = Math.max(1, engine.gameTick - track.lastTick);
        track.maxStep = Math.max(track.maxStep, step / ticks);
        track.lastTick = engine.gameTick;
        track.lastX = slow.x;
        track.lastY = slow.y;
    }
    return { track, slow };
}

/**
 * A fast dog walks into a slow, light swarmling (same team). The swarmling is shoved along but
 * never faster per tick than its own push budget (`fraction × its speed × dt`); the dog takes the rest
 * (and eventually slides round it).
 */
export const crowdMassPushSpeedCapScenario: ScenarioDefinition = {
    id: 'crowd_mass_push_speed_cap',
    title: 'CrowdSpacing (mass): a fast pusher cannot move a slow unit faster than its budget',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: (CAP_TIME_SEC + 1) * 1000,

    buildEngine() {
        const engine = buildMassEngine(14, 5);
        spawnWaitingPlayer(engine, 0, 4, Math.ceil((CAP_TIME_SEC + 1) / TICK_SEC));
        const pusher = spawnEnemy(engine, { id: CAP_PUSHER_ID, characterId: 'dog', at: centre(1, CAP_ROW) });
        const slow = spawnEnemy(engine, { id: CAP_SLOW_ID, characterId: 'swarmling', at: centre(4, CAP_ROW) });
        pusher.setWalkGoal({ kind: 'cell', col: 13, row: CAP_ROW });
        capTracks.set(engine, {
            lastTick: engine.gameTick,
            lastX: slow.x,
            lastY: slow.y,
            startX: slow.x,
            startY: slow.y,
            maxStep: 0,
        });
        return engine;
    },

    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const r = updateCapTrack(engine);
        if (!r) return false;
        const { track, slow } = r;
        if (track.maxStep > capBudgetPerTick(slow) + CAP_STEP_SLACK) return false;
        if (engine.gameTime < CAP_TIME_SEC) return false;
        return track.maxStep >= capBudgetPerTick(slow) * CAP_MIN_REACHED_FRACTION;
    },

    failureMessage(engine) {
        const r = updateCapTrack(engine);
        if (!r) return 'missing slow unit';
        const { track, slow } = r;
        const total = Math.hypot(slow.x - track.startX, slow.y - track.startY);
        return `t=${engine.gameTime.toFixed(2)} maxStep=${track.maxStep.toFixed(3)} budget=${capBudgetPerTick(slow).toFixed(3)} ` +
            `total=${total.toFixed(1)} pusher=${fmt(engine.getUnit(CAP_PUSHER_ID))} slow=${fmt(slow)}`;
    },
};

export const CROWD_MASS_SCENARIOS: ScenarioDefinition[] = [
    crowdMassHallwayBlockadeScenario,
    crowdMassWindupBraceScenario,
    crowdMassSizeScenario,
    crowdMassPushSpeedCapScenario,
];

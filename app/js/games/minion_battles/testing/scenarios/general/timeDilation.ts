/**
 * AbilityTest: Time Dilation section (tempo, world pace, Time Stop, step pieces).
 * Plan: docs/plans/time-dilation.md (Step 12). Guide: game/time/AGENTS.md.
 *
 * The scenario contract has no per-tick hook, so each scenario keeps a small observer in a WeakMap keyed by
 * its engine. `assertPass` runs once before every tick and calls `observe` (idempotent per engine tick), which
 * is also where mid-run actions (starting a Time Stop, applying a hit) happen. State is rebuilt by `buildEngine`.
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
import { registerAbilityForTest } from '../../../abilities/AbilityRegistry';
import { defineAbility } from '../../../abilities/defineAbility';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { perpendicularSwingHitbox } from '../../../hitboxes';
import { HIT_STUN_BUFF_TYPE } from '../../../buffs/hitPause';
import { DEFAULT_HIT_STUN_SECONDS } from '../../../game/time/timeConstants';
import { Gravity } from '../../../resources/Gravity';
import { EaseBurdensAbility } from '../../../card_defs/09_gravity_core/0906_EaseBurdens/0906Ability';
import { EASE_BURDENS_GRAVITY_COST } from '../../../card_defs/09_gravity_core/gravityConstants';
import { TIME_DILATION_BUFF_TYPE, TimeDilationBuff } from '../../../buffs/TimeDilationBuff';
import { Projectile } from '../../../game/projectiles/Projectile';
import { getActorTempo } from '../../../game/time/actorClock';
import { MAX_STEP_PIECES_PER_TICK } from '../../../game/time/timeConstants';
import { FIXED_DT } from '../../../game/gameConstants';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import type { BattleOrder } from '../../../game/types';

const P = TINY_BATTLE_PLAYER_ID;
const SECTION = 'Time Dilation';

function cellCenter(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

/** One-second cast with no side effects: a clock probe for "how long does a cast take". */
const PROBE_ID = '__test_time_dilation_probe__';
const probeAbility = defineAbility({
    id: PROBE_ID,
    name: 'Time Dilation Probe',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [{ id: 'active', start: 0, end: 1, abilityPhase: AbilityPhase.Active }],
    getTooltipText: () => ['Test-only cast used to measure cast duration under time dilation.'],
    getRange: () => ({ minRange: 0, maxRange: 100 }),
});
registerAbilityForTest(probeAbility);

function hasProbeCast(unit: Unit): boolean {
    return unit.activeAbilities.some((a) => a.abilityId === PROBE_ID);
}

/** Stationary AI-less unit on `teamId`, used as ally / control / enemy dummy. */
function spawnStaticUnit(
    engine: GameEngine,
    opts: { id: string; col: number; row: number; teamId: 'player' | 'enemy'; abilities?: string[]; hp?: number },
): Unit {
    const pos = cellCenter(opts.col, opts.row);
    const unit = createUnitFromSpawnConfig(
        {
            id: opts.id,
            characterId: 'dog',
            name: opts.id,
            x: pos.x,
            y: pos.y,
            teamId: opts.teamId,
            ownerId: opts.teamId === 'player' ? 'ai' : 'ai',
            hp: opts.hp ?? 500,
            abilities: opts.abilities ?? [],
            unitAITreeId: 'static_test_no_ai',
            unitTags: [UnitTag.CrowdSpacingExempt],
        },
        engine.eventBus,
        engine,
    );
    initializeAbilityRuntimeForUnit(unit);
    engine.addUnit(unit, 'initialGameSpawn');
    return unit;
}

function rowPath(fromCol: number, toCol: number, row: number): { col: number; row: number }[] {
    const path: { col: number; row: number }[] = [];
    for (let c = fromCol + 1; c <= toCol; c++) path.push({ col: c, row });
    return path;
}

// ---------------------------------------------------------------------------
// 1. Ease Burdens haste
// ---------------------------------------------------------------------------

const EB_ALLY = 'td_ally';
const EB_CONTROL = 'td_control';
const EB_WALK_TICK = 40;
const EB_SAMPLE_TICK = 129;
const EB_PROBE_TICK = 130;
const EB_KEEP_ALIVE_TICK = 440;

interface EaseBurdensState {
    allyStartX: number;
    controlStartX: number;
    sampled: boolean;
    paceAtSample: number;
    allyTempoAtSample: number;
    allyDist: number;
    controlDist: number;
    castStart: Record<string, number | undefined>;
    castEnd: Record<string, number | undefined>;
    sawBuff: boolean;
}
const easeBurdensState = new WeakMap<GameEngine, EaseBurdensState>();

function hasDilationBuff(unit: Unit | undefined): boolean {
    return Boolean(unit?.buffs.some((b) => b._type === TIME_DILATION_BUFF_TYPE));
}

function observeEaseBurdens(engine: GameEngine): EaseBurdensState {
    const s = easeBurdensState.get(engine)!;
    const ally = engine.getUnit(EB_ALLY)!;
    const control = engine.getUnit(EB_CONTROL)!;
    if (hasDilationBuff(ally)) s.sawBuff = true;
    if (!s.sampled && engine.gameTick >= EB_SAMPLE_TICK) {
        s.sampled = true;
        s.paceAtSample = engine.worldPace;
        s.allyTempoAtSample = getActorTempo(ally);
        s.allyDist = ally.x - s.allyStartX;
        s.controlDist = control.x - s.controlStartX;
    }
    for (const u of [ally, control]) {
        if (hasProbeCast(u)) {
            if (s.castStart[u.id] === undefined) s.castStart[u.id] = engine.gameTime;
        } else if (s.castStart[u.id] !== undefined && s.castEnd[u.id] === undefined) {
            s.castEnd[u.id] = engine.gameTime;
        }
    }
    return s;
}

function easeBurdensCastSeconds(s: EaseBurdensState, id: string): number {
    const a = s.castStart[id];
    const b = s.castEnd[id];
    return a === undefined || b === undefined ? NaN : b - a;
}

/**
 * Ease Burdens (0906) is the first content user of the time system. One scenario covers the whole loop:
 * an ally and an identical control both walk (hasted ally covers about 2x the control's distance while world
 * pace is 0.5), then both run a 1 s probe cast (hasted: about 0.5 world s, control: about 1 world s), then the
 * 3 s world-time buff expires and pace returns to 1.
 */
export const timeDilationEaseBurdensHasteScenario: ScenarioDefinition = {
    id: 'time_dilation_ease_burdens_haste',
    title: 'Ease Burdens: hasted ally walks 2x as far, casts in half the world time, buff expires and pace returns to 1',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 9000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 20, gridH: 7, localPlayerId: P, grass: true });
        const caster = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: cellCenter(1, 3).x,
            y: cellCenter(1, 3).y,
            abilities: [EaseBurdensAbility.id],
        });
        const gravity = new Gravity();
        caster.attachResource(gravity, engine.eventBus);
        gravity.add(EASE_BURDENS_GRAVITY_COST + 5);

        const ally = spawnStaticUnit(engine, { id: EB_ALLY, col: 2, row: 1, teamId: 'player', abilities: [PROBE_ID], hp: 100 });
        const control = spawnStaticUnit(engine, { id: EB_CONTROL, col: 2, row: 5, teamId: 'player', abilities: [PROBE_ID], hp: 100 });
        easeBurdensState.set(engine, {
            allyStartX: ally.x,
            controlStartX: control.x,
            sampled: false,
            paceAtSample: NaN,
            allyTempoAtSample: NaN,
            allyDist: NaN,
            controlDist: NaN,
            castStart: {},
            castEnd: {},
            sawBuff: false,
        });

        const q = (tick: number, order: BattleOrder) => engine.state.orderMgr.queueOrder(tick, order);
        for (const [id, row] of [[EB_ALLY, 1], [EB_CONTROL, 5]] as const) {
            q(EB_WALK_TICK, { unitId: id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: rowPath(2, 18, row) });
            q(EB_PROBE_TICK, { unitId: id, abilityId: PROBE_ID, targets: [] });
        }
        // Keeps the run alive past the buff expiry (~tick 380) so the pace-returns-to-1 check is reached.
        q(EB_KEEP_ALIVE_TICK, { unitId: caster.id, abilityId: 'wait', targets: [] });
        return engine;
    },
    getInitialOrders(engine) {
        const caster = engine.getLocalPlayerUnit()!;
        return [{ unitId: caster.id, abilityId: EaseBurdensAbility.id, targets: [{ type: 'unit', unitId: EB_ALLY }] }];
    },
    assertPass(engine) {
        const s = observeEaseBurdens(engine);
        if (!s.sampled || !s.sawBuff) return false;
        const ratio = s.allyDist / s.controlDist;
        if (!(s.paceAtSample === 0.5 && s.allyTempoAtSample === 2 && ratio > 1.8 && ratio < 2.2)) return false;
        const allyCast = easeBurdensCastSeconds(s, EB_ALLY);
        const controlCast = easeBurdensCastSeconds(s, EB_CONTROL);
        if (!(allyCast > 0.4 && allyCast < 0.62 && controlCast > 0.9 && controlCast < 1.12)) return false;
        return !hasDilationBuff(engine.getUnit(EB_ALLY)) && engine.worldPace === 1;
    },
    failureMessage(engine) {
        const s = observeEaseBurdens(engine);
        return (
            `sawBuff=${s.sawBuff} paceAtSample=${s.paceAtSample} allyTempo=${s.allyTempoAtSample} ` +
            `dist ally/control=${s.allyDist?.toFixed(1)}/${s.controlDist?.toFixed(1)} ` +
            `castSec ally/control=${easeBurdensCastSeconds(s, EB_ALLY).toFixed(3)}/${easeBurdensCastSeconds(s, EB_CONTROL).toFixed(3)} ` +
            `buffGone=${!hasDilationBuff(engine.getUnit(EB_ALLY))} pace=${engine.worldPace}`
        );
    },
};

// ---------------------------------------------------------------------------
// 2. Projectile tempo
// ---------------------------------------------------------------------------

const PT_START_X = 20;
const PT_MARK_X = PT_START_X + 200;
const PT_SPEED = 300;
const PT_WALL_COL = 8;
const PT_WALL_ROW = 4;

interface ProjectileTempoState {
    normal: Projectile;
    slow: Projectile;
    fast: Projectile;
    normalTick: number | null;
    slowTick: number | null;
}
const projectileTempoState = new WeakMap<GameEngine, ProjectileTempoState>();

function makeLaneProjectile(engine: GameEngine, ownerId: string, row: number, extra?: { tempo?: number; wall?: boolean }): Projectile {
    const proj = new Projectile({
        x: PT_START_X,
        y: cellCenter(0, row).y,
        velocityX: PT_SPEED,
        velocityY: 0,
        damage: 1,
        sourceTeamId: 'player',
        sourceUnitId: ownerId,
        sourceAbilityId: 'throw_knife',
        maxDistance: 400,
        modifiers: extra?.wall ? ['stopsAtWalls'] : [],
    });
    if (extra?.tempo !== undefined) {
        proj.addBuff({
            sourceId: 'td_probe',
            appliedAtTime: engine.gameTime,
            duration: null,
            timeModifier: { sourceId: 'td_probe', tempo: extra.tempo },
        });
    }
    engine.addProjectile(proj);
    return proj;
}

function observeProjectiles(engine: GameEngine): ProjectileTempoState {
    const s = projectileTempoState.get(engine)!;
    if (s.normalTick === null && s.normal.x >= PT_MARK_X) s.normalTick = engine.gameTick;
    if (s.slowTick === null && s.slow.x >= PT_MARK_X) s.slowTick = engine.gameTick;
    return s;
}

/**
 * Projectiles run on their own clock: a 0.5-tempo projectile (projectile buff) takes about twice as many
 * ticks to cover the same distance as a tempo-1 one, and a 50x projectile (cut into travel pieces) still
 * stops at a wall instead of tunnelling through it.
 */
export const timeDilationProjectileTempoScenario: ScenarioDefinition = {
    id: 'time_dilation_projectile_tempo',
    title: 'Projectile tempo: 0.5x reaches the mark later than 1x; a 50x projectile still stops at the wall',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 4000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 14, gridH: 6, localPlayerId: P, grass: true });
        engine.terrainManager!.grid.set(PT_WALL_COL, PT_WALL_ROW, TerrainType.Rock);
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: cellCenter(12, 5).x,
            y: cellCenter(12, 5).y,
            abilities: [],
        });
        engine.state.orderMgr.queueOrder(1, { unitId: player.id, abilityId: 'wait', targets: [] });
        projectileTempoState.set(engine, {
            normal: makeLaneProjectile(engine, player.id, 1),
            slow: makeLaneProjectile(engine, player.id, 2, { tempo: 0.5 }),
            fast: makeLaneProjectile(engine, player.id, PT_WALL_ROW, { tempo: 50, wall: true }),
            normalTick: null,
            slowTick: null,
        });
        return engine;
    },
    getInitialOrders() {
        return [];
    },
    assertPass(engine) {
        const s = observeProjectiles(engine);
        if (s.normalTick === null || s.slowTick === null) return false;
        const ratio = s.slowTick / s.normalTick;
        const wallX = PT_WALL_COL * CELL_SIZE;
        return ratio > 1.8 && ratio < 2.2 && !s.fast.active && s.fast.x < wallX && s.fast.x > PT_START_X;
    },
    failureMessage(engine) {
        const s = observeProjectiles(engine);
        return (
            `markTick normal/slow=${s.normalTick}/${s.slowTick} 50x active=${s.fast.active} x=${s.fast.x.toFixed(1)} ` +
            `(wall at ${PT_WALL_COL * CELL_SIZE})`
        );
    },
};

// ---------------------------------------------------------------------------
// 3. Time Stop
// ---------------------------------------------------------------------------

const TS_DUMMY = 'td_frozen_dummy';
const TS_START_TICK = 5;
const TS_DURATION_TICKS = 90;
const TS_HIT_DAMAGE = 25;
const TS_KNOCKBACK_MIN_TRAVEL = 40;

interface TimeStopState {
    started: boolean;
    startTick: number;
    gameTime0: number;
    roundProgress0: number;
    dummyX0: number;
    dummyHp0: number;
    heroLocal0: number;
    knockApplied: boolean;
    stopDurationTicks: number;
    zeroPaceSamples: number;
    maxGameTimeDrift: number;
    maxRoundDrift: number;
    maxDummyDrift: number;
    knockElapsedMax: number;
    hpDuringStop: number;
    heroLocalAdvance: number;
    heroCastDoneInStop: boolean;
    endedTick: number | null;
    endedReason: string | null;
}
const timeStopState = new WeakMap<GameEngine, TimeStopState>();

function observeTimeStop(engine: GameEngine): TimeStopState {
    const s = timeStopState.get(engine)!;
    const hero = engine.getLocalPlayerUnit()!;
    const dummy = engine.getUnit(TS_DUMMY)!;
    if (!s.started && engine.gameTick >= TS_START_TICK) {
        s.started = true;
        s.startTick = engine.gameTick;
        s.gameTime0 = engine.gameTime;
        s.roundProgress0 = engine.roundProgress;
        s.dummyX0 = dummy.x;
        s.dummyHp0 = dummy.hp;
        s.heroLocal0 = hero.localTime;
        const stop = engine.startTimeStop({
            sourceActorId: hero.id,
            durationTickSeconds: TS_DURATION_TICKS * FIXED_DT,
            exemptActorIds: [hero.id],
        });
        s.stopDurationTicks = stop.durationTicks;
        s.knockApplied = dummy.applyKnockback(
            {
                knockbackVector: { x: 120, y: 0 },
                knockbackAirTime: 0.4,
                knockbackSlideTime: 0.2,
                knockbackSource: { unitId: hero.id, abilityId: PROBE_ID },
            },
            engine.eventBus,
        );
        // Frozen-hit policy defaults to 'immediate': this lands (and would be able to kill) at once.
        dummy.takeDamage(TS_HIT_DAMAGE, hero.id, engine.eventBus);
        return s;
    }
    if (s.started && engine.worldPace === 0) {
        s.zeroPaceSamples++;
        s.maxGameTimeDrift = Math.max(s.maxGameTimeDrift, Math.abs(engine.gameTime - s.gameTime0));
        s.maxRoundDrift = Math.max(s.maxRoundDrift, Math.abs(engine.roundProgress - s.roundProgress0));
        s.maxDummyDrift = Math.max(s.maxDummyDrift, Math.abs(dummy.x - s.dummyX0));
        s.knockElapsedMax = Math.max(s.knockElapsedMax, dummy.knockback?.knockbackElapsed ?? 0);
        s.hpDuringStop = Math.min(s.hpDuringStop, dummy.hp);
        s.heroLocalAdvance = hero.localTime - s.heroLocal0;
        if (!hasProbeCast(hero)) s.heroCastDoneInStop = true;
    }
    return s;
}

/**
 * Time Stop (engine.startTimeStop) with an exempt caster. While the world is stopped: gameTime and the round
 * timer hold, the exempt hero keeps casting, the frozen enemy still takes an immediate hit, and its knockback
 * momentum is stored (no movement, elapsed stays 0) and then released when the stop expires on its tick-time
 * duration.
 */
export const timeDilationTimeStopScenario: ScenarioDefinition = {
    id: 'time_dilation_time_stop',
    title: 'Time Stop: exempt caster keeps casting, world clock holds, frozen enemy takes hits and releases stored knockback',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 6000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 14, gridH: 5, localPlayerId: P, grass: true });
        const hero = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: cellCenter(2, 2).x,
            y: cellCenter(2, 2).y,
            abilities: [PROBE_ID],
        });
        initializeAbilityRuntimeForUnit(hero);
        const dummy = spawnStaticUnit(engine, { id: TS_DUMMY, col: 8, row: 2, teamId: 'enemy' });
        const state: TimeStopState = {
            started: false,
            startTick: -1,
            gameTime0: 0,
            roundProgress0: 0,
            dummyX0: dummy.x,
            dummyHp0: dummy.hp,
            heroLocal0: 0,
            knockApplied: false,
            stopDurationTicks: 0,
            zeroPaceSamples: 0,
            maxGameTimeDrift: 0,
            maxRoundDrift: 0,
            maxDummyDrift: 0,
            knockElapsedMax: 0,
            hpDuringStop: Infinity,
            heroLocalAdvance: 0,
            heroCastDoneInStop: false,
            endedTick: null,
            endedReason: null,
        };
        timeStopState.set(engine, state);
        engine.eventBus.on('time_stop_ended', (e) => {
            state.endedTick = e.gameTick;
            state.endedReason = e.reason;
        });
        return engine;
    },
    getInitialOrders(engine) {
        const hero = engine.getLocalPlayerUnit()!;
        return [{ unitId: hero.id, abilityId: PROBE_ID, targets: [] }];
    },
    assertPass(engine) {
        const s = observeTimeStop(engine);
        const dummy = engine.getUnit(TS_DUMMY)!;
        if (!s.started || s.endedTick === null) return false;
        const stopTicks = s.endedTick - s.startTick;
        return (
            s.knockApplied &&
            s.stopDurationTicks === TS_DURATION_TICKS &&
            s.endedReason === 'expired' &&
            stopTicks >= TS_DURATION_TICKS &&
            stopTicks <= TS_DURATION_TICKS + 2 &&
            s.zeroPaceSamples >= TS_DURATION_TICKS - 1 &&
            s.zeroPaceSamples <= TS_DURATION_TICKS + 1 &&
            s.maxGameTimeDrift === 0 &&
            s.maxRoundDrift === 0 &&
            s.hpDuringStop <= s.dummyHp0 - TS_HIT_DAMAGE &&
            s.maxDummyDrift < 1e-6 &&
            s.knockElapsedMax === 0 &&
            s.heroCastDoneInStop &&
            Math.abs(s.heroLocalAdvance - TS_DURATION_TICKS * FIXED_DT) < 3 * FIXED_DT &&
            dummy.knockback === null &&
            dummy.x - s.dummyX0 >= TS_KNOCKBACK_MIN_TRAVEL
        );
    },
    failureMessage(engine) {
        const s = observeTimeStop(engine);
        const dummy = engine.getUnit(TS_DUMMY)!;
        return (
            `started=${s.started} startTick=${s.startTick} endedTick=${s.endedTick} reason=${s.endedReason} ` +
            `knockApplied=${s.knockApplied} durTicks=${s.stopDurationTicks} zeroPaceSamples=${s.zeroPaceSamples} ` +
            `drift gameTime/round/dummyX=${s.maxGameTimeDrift}/${s.maxRoundDrift}/${s.maxDummyDrift} ` +
            `knockElapsedMax=${s.knockElapsedMax} hp0=${s.dummyHp0} hpDuring=${s.hpDuringStop} ` +
            `heroLocalAdvance=${s.heroLocalAdvance.toFixed(4)} heroCastDone=${s.heroCastDoneInStop} ` +
            `dummy knockback=${dummy.knockback ? 'active' : 'null'} movedX=${(dummy.x - s.dummyX0).toFixed(1)}`
        );
    },
};

// ---------------------------------------------------------------------------
// 4. Extreme tempo
// ---------------------------------------------------------------------------

const XT_ID = 'td_blur';
const XT_WALL_COL = 9;
const XT_SPEED = 3000;
const XT_SETTLE_TICKS = 20;

interface ExtremeTempoState {
    tm: NonNullable<GameEngine['terrainManager']>;
    movementCalls: number;
    maxCallsPerTick: number;
    everInsideWall: boolean;
    maxXSeen: number;
    sawDebt: boolean;
    nearWallTick: number | null;
}
const extremeTempoState = new WeakMap<GameEngine, ExtremeTempoState>();

function observeExtremeTempo(engine: GameEngine): ExtremeTempoState {
    const s = extremeTempoState.get(engine)!;
    const u = engine.getUnit(XT_ID)!;
    s.maxCallsPerTick = Math.max(s.maxCallsPerTick, s.movementCalls);
    s.movementCalls = 0;
    if (!s.tm.isPassable(u.x, u.y) || u.x >= XT_WALL_COL * CELL_SIZE) s.everInsideWall = true;
    s.maxXSeen = Math.max(s.maxXSeen, u.x);
    if (u.timeDebt > 0) s.sawDebt = true;
    if (s.nearWallTick === null && u.x >= (XT_WALL_COL - 1) * CELL_SIZE) s.nearWallTick = engine.gameTick;
    return s;
}

/**
 * A unit at tempo 100 (non-focal, so world pace stays 1) with a huge move speed is the worst case for the
 * step-piece planner: it asks for far more travel per tick than the per-tick piece budget allows. It walks a
 * path straight through a rock wall. It must never end up inside the wall (pieces are cut by travel distance),
 * the per-tick piece budget must hold (leftover local time is carried as timeDebt), and the run must not hang.
 */
export const timeDilationExtremeTempoScenario: ScenarioDefinition = {
    id: 'time_dilation_extreme_tempo',
    title: 'Extreme tempo: a 100x unit walking into a wall never enters it, the piece budget holds and debt is carried',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 3000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 16, gridH: 5, localPlayerId: P, grass: true });
        const tm = engine.terrainManager!;
        for (let row = 0; row < 5; row++) tm.grid.set(XT_WALL_COL, row, TerrainType.Rock);
        // A parked player keeps the battle from ending (no player units = defeat).
        const parked = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: cellCenter(1, 4).x,
            y: cellCenter(1, 4).y,
            abilities: [],
        });
        engine.state.orderMgr.queueOrder(1, { unitId: parked.id, abilityId: 'wait', targets: [] });
        const unit = spawnStaticUnit(engine, { id: XT_ID, col: 1, row: 2, teamId: 'player', hp: 100 });
        unit.speed = XT_SPEED;
        unit.addBuff(
            new TimeDilationBuff({ sourceId: 'td_extreme', tempo: 100, durationSeconds: 1000 }),
            engine.gameTime,
            engine.roundNumber,
        );
        const state: ExtremeTempoState = {
            tm,
            movementCalls: 0,
            maxCallsPerTick: 0,
            everInsideWall: false,
            maxXSeen: unit.x,
            sawDebt: false,
            nearWallTick: null,
        };
        const originalTickMovement = unit.tickMovement.bind(unit);
        unit.tickMovement = ((...args: Parameters<Unit['tickMovement']>) => {
            state.movementCalls++;
            return originalTickMovement(...args);
        }) as Unit['tickMovement'];
        extremeTempoState.set(engine, state);
        return engine;
    },
    getInitialOrders(engine) {
        const unit = engine.getUnit(XT_ID)!;
        return [{ unitId: unit.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: rowPath(1, XT_WALL_COL - 1, 2) }];
    },
    assertPass(engine) {
        const s = observeExtremeTempo(engine);
        if (s.everInsideWall || s.nearWallTick === null) return false;
        if (s.maxCallsPerTick > MAX_STEP_PIECES_PER_TICK || !s.sawDebt) return false;
        return engine.gameTick - s.nearWallTick >= XT_SETTLE_TICKS || engine.isScenarioRunnerBattleIdle();
    },
    failureMessage(engine) {
        const s = observeExtremeTempo(engine);
        const u = engine.getUnit(XT_ID)!;
        return (
            `insideWall=${s.everInsideWall} nearWallTick=${s.nearWallTick} maxX=${s.maxXSeen.toFixed(1)} ` +
            `(wall at ${XT_WALL_COL * CELL_SIZE}) maxMovementCallsPerTick=${s.maxCallsPerTick} (budget ${MAX_STEP_PIECES_PER_TICK}) ` +
            `sawDebt=${s.sawDebt} x=${u.x.toFixed(1)} tick=${engine.gameTick}`
        );
    },
};

// ---------------------------------------------------------------------------
// 5. Hitstun delays the victim's cast
// ---------------------------------------------------------------------------

const HS_VICTIM = 'td_hitstun_victim';
const HS_ATTACKER = 'td_hitstun_attacker';
const HS_STRIKE_ID = '__test_time_dilation_hitstun_strike__';
/** One-cell gap. Inside the swing tether (`swingRange` plus unit radius plus lock-on extra). */
const HS_ATTACKER_COL = 2;
const HS_VICTIM_COL = 3;
const HS_STRIKE_ROW = 2;
const HS_PLAYER_COL = 6;
const HS_PLAYER_ROW = 4;
const HS_GRID_W = 8;
const HS_GRID_H = 5;
/** Swing window. Still open across a tempo-1 hitstop, so the strike is a cast rather than an instant. */
const HS_STRIKE_WINDOW_SECONDS = 1;
const HS_STRIKE_DAMAGE = 10;
const HS_SWING_RANGE = CELL_SIZE;
const HS_SWING_LENGTH = CELL_SIZE * 2;
const HS_SWING_THICKNESS = CELL_SIZE / 2;
/** `MeleeAttack` treats `<= 0` as the first tick of the window. */
const HS_IMPACT_ON_FIRST_TICK = 0;
const HS_NO_SLIDE_DISTANCE = 0;

const hitstunStrikeAbility = defineAbility({
    id: HS_STRIKE_ID,
    name: 'Time Dilation Hitstun Strike',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [{
        id: 'swing',
        start: 0,
        end: HS_STRIKE_WINDOW_SECONDS,
        abilityPhase: AbilityPhase.Active,
        behaviour: CastBehaviours.MeleeAttack()
            .withHitbox(perpendicularSwingHitbox(HS_SWING_RANGE, HS_SWING_LENGTH, HS_SWING_THICKNESS))
            .withImpactAt(HS_IMPACT_ON_FIRST_TICK)
            .withDamage(HS_STRIKE_DAMAGE)
            .withSlide({ forwardDistance: HS_NO_SLIDE_DISTANCE, backwardDistance: HS_NO_SLIDE_DISTANCE }),
    }],
    getTooltipText: () => ['Test-only melee strike used to check that hitstun delays a cast.'],
    getRange: () => ({ minRange: 0, maxRange: HS_SWING_RANGE }),
});
registerAbilityForTest(hitstunStrikeAbility);

interface HitstunCastState {
    /** Active ability ids on the tick the hitstun buff is first seen. */
    idsAtLanding: string[] | null;
    /** A later sample, still during hitstun, still had those ids. */
    heldThroughStun: boolean;
    /** The active set changed while hitstun was up. */
    castDropped: boolean;
}
const hitstunCastState = new WeakMap<GameEngine, HitstunCastState>();

function activeAbilityIds(unit: Unit): string[] {
    return unit.activeAbilities.map((active) => active.abilityId);
}

function sameAbilityIds(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

function observeHitstunCast(engine: GameEngine): HitstunCastState {
    const s = hitstunCastState.get(engine)!;
    const victim = engine.getUnit(HS_VICTIM)!;
    if (!victim.hasBuff(HIT_STUN_BUFF_TYPE)) return s;
    const ids = activeAbilityIds(victim);
    if (s.idsAtLanding === null) {
        s.idsAtLanding = ids;
        return s;
    }
    if (sameAbilityIds(ids, s.idsAtLanding)) s.heldThroughStun = true;
    else s.castDropped = true;
    return s;
}

/**
 * A melee strike connects while the victim is mid-cast. Hitstun freezes that unit, and the cast stays
 * the same ability (delayed, not removed). The run passes only after that mid-stun sample and after
 * the buff has expired. The player's wait keeps the runner from idling out before then.
 */
export const timeDilationHitstunDelaysCastScenario: ScenarioDefinition = {
    id: 'time_dilation_hitstun_delays_cast',
    title: 'Hitstun: a melee hit freezes the victim, and their cast is still that cast after the buff ends',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 3000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: HS_GRID_W, gridH: HS_GRID_H, localPlayerId: P, grass: true });
        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: cellCenter(HS_PLAYER_COL, HS_PLAYER_ROW).x,
            y: cellCenter(HS_PLAYER_COL, HS_PLAYER_ROW).y,
            abilities: [],
        });
        spawnStaticUnit(engine, {
            id: HS_ATTACKER,
            col: HS_ATTACKER_COL,
            row: HS_STRIKE_ROW,
            teamId: 'player',
            abilities: [HS_STRIKE_ID],
        });
        spawnStaticUnit(engine, {
            id: HS_VICTIM,
            col: HS_VICTIM_COL,
            row: HS_STRIKE_ROW,
            teamId: 'enemy',
            abilities: [PROBE_ID],
        });
        hitstunCastState.set(engine, { idsAtLanding: null, heldThroughStun: false, castDropped: false });
        return engine;
    },
    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [
            { unitId: player.id, abilityId: 'wait', targets: [] },
            { unitId: HS_ATTACKER, abilityId: HS_STRIKE_ID, targets: [{ type: 'unit', unitId: HS_VICTIM }] },
            { unitId: HS_VICTIM, abilityId: PROBE_ID, targets: [] },
        ];
    },
    assertPass(engine) {
        const s = observeHitstunCast(engine);
        const victim = engine.getUnit(HS_VICTIM);
        if (!victim || s.idsAtLanding === null || !s.heldThroughStun || s.castDropped) return false;
        if (s.idsAtLanding.length !== 1 || s.idsAtLanding[0] !== PROBE_ID) return false;
        if (victim.hasBuff(HIT_STUN_BUFF_TYPE)) return false;
        return sameAbilityIds(activeAbilityIds(victim), s.idsAtLanding);
    },
    failureMessage(engine) {
        const s = observeHitstunCast(engine);
        const victim = engine.getUnit(HS_VICTIM);
        const ids = victim ? activeAbilityIds(victim).join(',') : 'missing';
        return (
            `landing=${s.idsAtLanding?.join(',') ?? 'none'} held=${s.heldThroughStun} dropped=${s.castDropped} ` +
            `stun=${Boolean(victim?.hasBuff(HIT_STUN_BUFF_TYPE))} active=${ids} hp=${victim?.hp} ` +
            `hitstunSec=${DEFAULT_HIT_STUN_SECONDS}`
        );
    },
};

export const TIME_DILATION_SCENARIOS: ScenarioDefinition[] = [
    timeDilationEaseBurdensHasteScenario,
    timeDilationProjectileTempoScenario,
    timeDilationTimeStopScenario,
    timeDilationExtremeTempoScenario,
    timeDilationHitstunDelaysCastScenario,
];

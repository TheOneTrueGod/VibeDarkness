/**
 * Hitstop and hitstun apply helpers. Tick order matches `GameEngine.fixedUpdate`: world pace, world
 * time, local clocks, unit tick (upkeep expires buffs after the freeze is read), then projectiles
 * (`expireBuffs` before the step). Not a hand-passed `dt`.
 */
import { describe, it, expect, vi } from 'vitest';
import { Unit } from '../game/units/Unit';
import { UnitManager } from '../game/managers/UnitManager';
import { ProjectileManager } from '../game/managers/ProjectileManager';
import { Projectile } from '../game/projectiles/Projectile';
import { EventBus } from '../game/EventBus';
import type { EngineContext } from '../game/EngineContext';
import type { AIContext } from '../game/units/unitAI';
import { TerrainGrid, CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainManager } from '../terrain/TerrainManager';
import { TerrainType } from '../terrain/TerrainType';
import { FIXED_DT } from '../game/gameConstants';
import { TimeManager } from '../game/time/TimeManager';
import { advanceUnitLocalClocks, collectUnitFocalRequests } from '../game/time/actorClock';
import { DEFAULT_HIT_STOP_SECONDS, DEFAULT_HIT_STUN_SECONDS, TEMPO_MAX } from '../game/time/timeConstants';
import { TimeDilationBuff } from './TimeDilationBuff';
import { HitStopBuff, HIT_STOP_BUFF_TYPE, HIT_STOP_DURATION_SECONDS } from './HitStopBuff';
import { buffFromJSON } from './buffRegistry';
import { defineAbility } from '../abilities/defineAbility';
import { AbilityPhase } from '../abilities/abilityTimings';
import { getAbility, registerAbilityForTest } from '../abilities/AbilityRegistry';
import { executeUnitAbility } from '../game/units/unitAbilityLifecycle';
import {
    HIT_STUN_BUFF_TYPE,
    HitPauseBuff,
    PROJECTILE_HIT_STOP_SOURCE_ID,
    applyProjectileHitStop,
    applyUnitHitPause,
    hitPauseTicks,
    resolveHitImpactSeconds,
} from './hitPause';

/** Long enough that a few ticks of hitstun cannot finish it. */
const PROBE_CAST_SECONDS = 1;
const CAST_ID = 'test_hit_pause_cast';
const ProbeCast = defineAbility({
    id: CAST_ID,
    name: 'Hit Pause Probe',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [{ id: 'active', start: 0, end: PROBE_CAST_SECONDS, abilityPhase: AbilityPhase.Active }],
    getTooltipText: () => ['Hit pause probe'],
    getRange: () => ({ minRange: 0, maxRange: 100 }),
});

const HASTE_TEMPO = 2;
const SLOW_TEMPO = 0.5;
const SLOW_WORLD_PACE = 0.5;
/** Outlasts every pause in this file. World seconds. */
const TEMPO_HOLD_SECONDS = 30;
const PROBE_PROJECTILE_SPEED = 60;
const PROBE_PROJECTILE_DISTANCE = 10_000;
/** Bound so a pause that never ends fails the assertion instead of hanging. */
const STALL_SEARCH_TICKS = 40;

function makeUnit(id: string, x: number, y: number): Unit {
    const unit = new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'swarmling',
        name: id,
        abilities: [],
    });
    unit.moveJitter = 0;
    return unit;
}

interface Harness {
    engine: EngineContext & { timeManager: TimeManager; gameTime: number; gameTick: number; roundNumber: number };
    tick: () => void;
    projectiles: ProjectileManager;
}

function makeHarness(units: Unit[]): Harness {
    const terrainManager = new TerrainManager(new TerrainGrid(60, 12, CELL_SIZE, TerrainType.Grass));
    const noop = new Proxy({}, { get: () => () => undefined });
    const engine = {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus: new EventBus(),
        units,
        timeManager: new TimeManager(),
        terrainManager,
        terrainLayers: new Proxy({}, { get: (_target, key) => (key === 'getGroundMovementMultiplier' ? () => 1 : () => undefined) }),
        cellOccupancyManager: null,
        pathfindingManager: { tick: () => {} },
        crowdSpacingManager: { tick: () => {} },
        mapNetworkManager: { updateUnitNode: () => {} },
        getUnit: (id: string) => units.find((unit) => unit.id === id),
        generateRandomInteger: () => 0,
        addEffect: noop,
        addEffectEmitter: noop,
        trackAbilityUse: vi.fn(),
    } as unknown as EngineContext & { timeManager: TimeManager; gameTime: number; gameTick: number; roundNumber: number };
    const manager = new UnitManager(engine);
    manager.units = units;
    const projectiles = new ProjectileManager(engine);
    const aiContext = { ninjutsuManager: undefined } as unknown as AIContext;
    const tick = () => {
        engine.timeManager.resolveWorldPace(collectUnitFocalRequests(units), engine.gameTick + 1);
        const pace = engine.timeManager.worldPace;
        const worldDt = pace === 1 ? FIXED_DT : FIXED_DT * pace;
        const prev = engine.gameTime;
        engine.gameTime += worldDt;
        advanceUnitLocalClocks(units, engine, FIXED_DT, prev);
        engine.gameTick++;
        manager.gameTick(worldDt, engine, () => {}, aiContext);
        projectiles.update(engine.timeManager);
    };
    return { engine, tick, projectiles };
}

function applyTempo(unit: Unit, tempo: number, gameTime: number, roundNumber: number, worldPace?: number): void {
    unit.addBuff(new TimeDilationBuff({
        sourceId: `tempo-${unit.id}`,
        tempo,
        durationSeconds: TEMPO_HOLD_SECONDS,
        ...(worldPace !== undefined ? { focal: { worldPace } } : {}),
    }), gameTime, roundNumber);
}

/** How many following ticks leave `unit.localTime` unchanged. */
function stalledLocalTicks(unit: Unit, tick: () => void): number {
    const start = unit.localTime;
    let stalled = 0;
    for (let i = 0; i < STALL_SEARCH_TICKS; i++) {
        tick();
        if (unit.localTime !== start) break;
        stalled++;
    }
    return stalled;
}

function makeProjectile(y: number): Projectile {
    return new Projectile({
        x: 0,
        y,
        velocityX: PROBE_PROJECTILE_SPEED,
        velocityY: 0,
        damage: 1,
        sourceTeamId: 'player',
        sourceUnitId: 'caster',
        sourceAbilityId: 'throw_knife',
        maxDistance: PROBE_PROJECTILE_DISTANCE,
        passThroughEnemies: true,
    });
}

describe('hitPauseTicks', () => {
    it('rounds authored seconds to tempo-scaled ticks and applies nothing at 0', () => {
        expect(hitPauseTicks(DEFAULT_HIT_STUN_SECONDS, 1)).toBe(Math.round(DEFAULT_HIT_STUN_SECONDS / FIXED_DT));
        expect(hitPauseTicks(DEFAULT_HIT_STOP_SECONDS, 1)).toBe(Math.round(DEFAULT_HIT_STOP_SECONDS / FIXED_DT));
        expect(hitPauseTicks(DEFAULT_HIT_STUN_SECONDS, HASTE_TEMPO)).toBe(
            Math.round(DEFAULT_HIT_STUN_SECONDS / FIXED_DT / HASTE_TEMPO),
        );
        expect(hitPauseTicks(DEFAULT_HIT_STUN_SECONDS, SLOW_TEMPO)).toBe(
            Math.round(DEFAULT_HIT_STUN_SECONDS / FIXED_DT / SLOW_TEMPO),
        );
        expect(hitPauseTicks(0, 1)).toBe(0);
        expect(hitPauseTicks(-DEFAULT_HIT_STOP_SECONDS, 1)).toBe(0);
        expect(hitPauseTicks(FIXED_DT, TEMPO_MAX)).toBe(0);
    });
});

describe('applyUnitHitPause', () => {
    it('puts hitstop and hitstun on the same unit, and refreshing one does not replace the other', () => {
        const unit = makeUnit('both', CELL_SIZE, CELL_SIZE);
        const harness = makeHarness([unit]);
        applyUnitHitPause(unit, { seconds: DEFAULT_HIT_STOP_SECONDS, kind: 'hit_stop' }, harness.engine.gameTime, harness.engine.roundNumber);
        applyUnitHitPause(unit, { seconds: DEFAULT_HIT_STUN_SECONDS, kind: 'hit_stun' }, harness.engine.gameTime, harness.engine.roundNumber);
        const stun = unit.buffs.find((buff) => buff._type === HIT_STUN_BUFF_TYPE);
        const stop = unit.buffs.find((buff) => buff._type === HIT_STOP_BUFF_TYPE);
        expect(stun?.timeModifier).toMatchObject({ freeze: true });
        expect(stun?.timeModifier?.focal).toBeUndefined();
        expect(stop?.timeModifier?.focal).toBeUndefined();

        harness.tick();
        applyUnitHitPause(unit, { seconds: DEFAULT_HIT_STOP_SECONDS, kind: 'hit_stop' }, harness.engine.gameTime, harness.engine.roundNumber);
        expect(unit.buffs.find((buff) => buff._type === HIT_STUN_BUFF_TYPE)).toBe(stun);
        expect(unit.buffs.find((buff) => buff._type === HIT_STOP_BUFF_TYPE)).not.toBe(stop);

        const stalled = 1 + stalledLocalTicks(unit, harness.tick);
        expect(stalled).toBe(hitPauseTicks(DEFAULT_HIT_STUN_SECONDS, 1));
        expect(harness.engine.timeManager.worldPace).toBe(1);
    });

    it('at tempo 1 hitstun holds local time for its tick count and the cast is still that cast afterwards', () => {
        registerAbilityForTest(ProbeCast);
        const unit = makeUnit('victim', CELL_SIZE, CELL_SIZE);
        const bystander = makeUnit('bystander', CELL_SIZE, CELL_SIZE * 4);
        unit.abilities = [CAST_ID];
        unit.abilityRuntime[CAST_ID] = {
            currentUses: 1,
            maxUses: 1,
            recoveryChargesByType: {},
            active: true,
            replacedAbilityId: null,
        };
        const harness = makeHarness([unit, bystander]);
        executeUnitAbility(unit, ProbeCast, [], harness.engine);
        const abilityId = unit.activeAbilities[0]?.abilityId;
        expect(abilityId).toBe(CAST_ID);

        applyUnitHitPause(unit, { seconds: DEFAULT_HIT_STUN_SECONDS, kind: 'hit_stun' }, harness.engine.gameTime, harness.engine.roundNumber);
        const localAtPause = unit.localTime;
        const bystanderAtPause = bystander.localTime;
        const ticks = hitPauseTicks(DEFAULT_HIT_STUN_SECONDS, 1);
        for (let i = 0; i < ticks; i++) {
            harness.tick();
            expect(unit.localTime).toBe(localAtPause);
            expect(unit.activeAbilities.map((active) => active.abilityId)).toEqual([CAST_ID]);
        }
        expect(bystander.localTime).not.toBe(bystanderAtPause);
        expect(harness.engine.timeManager.worldPace).toBe(1);

        harness.tick();
        expect(unit.localTime).toBeGreaterThan(localAtPause);
        expect(unit.activeAbilities.map((active) => active.abilityId)).toEqual([CAST_ID]);
    });

    it('tempo scales the freeze, and world pace 0.5 at tempo 1 does not', () => {
        const hasted = makeUnit('hasted', CELL_SIZE, CELL_SIZE);
        const slowed = makeUnit('slowed', CELL_SIZE, CELL_SIZE * 3);
        const paced = makeUnit('paced', CELL_SIZE, CELL_SIZE * 5);
        const focal = makeUnit('focal', CELL_SIZE, CELL_SIZE * 7);
        const hastedHarness = makeHarness([hasted]);
        const slowedHarness = makeHarness([slowed]);
        const pacedHarness = makeHarness([paced, focal]);
        applyTempo(hasted, HASTE_TEMPO, hastedHarness.engine.gameTime, hastedHarness.engine.roundNumber);
        applyTempo(slowed, SLOW_TEMPO, slowedHarness.engine.gameTime, slowedHarness.engine.roundNumber);
        applyTempo(focal, 1, pacedHarness.engine.gameTime, pacedHarness.engine.roundNumber, SLOW_WORLD_PACE);
        applyUnitHitPause(hasted, { seconds: DEFAULT_HIT_STUN_SECONDS, kind: 'hit_stun' }, hastedHarness.engine.gameTime, hastedHarness.engine.roundNumber);
        applyUnitHitPause(slowed, { seconds: DEFAULT_HIT_STUN_SECONDS, kind: 'hit_stun' }, slowedHarness.engine.gameTime, slowedHarness.engine.roundNumber);
        applyUnitHitPause(paced, { seconds: DEFAULT_HIT_STUN_SECONDS, kind: 'hit_stun' }, pacedHarness.engine.gameTime, pacedHarness.engine.roundNumber);

        expect(stalledLocalTicks(hasted, hastedHarness.tick)).toBe(hitPauseTicks(DEFAULT_HIT_STUN_SECONDS, HASTE_TEMPO));
        expect(hastedHarness.engine.timeManager.worldPace).toBe(1);
        expect(stalledLocalTicks(slowed, slowedHarness.tick)).toBe(hitPauseTicks(DEFAULT_HIT_STUN_SECONDS, SLOW_TEMPO));
        expect(stalledLocalTicks(paced, pacedHarness.tick)).toBe(hitPauseTicks(DEFAULT_HIT_STUN_SECONDS, 1));
        expect(pacedHarness.engine.timeManager.worldPace).toBe(SLOW_WORLD_PACE);
    });

    it('a dead unit or a non-positive duration applies nothing', () => {
        const dead = makeUnit('dead', CELL_SIZE, CELL_SIZE);
        dead.hp = 0;
        applyUnitHitPause(dead, { seconds: DEFAULT_HIT_STUN_SECONDS, kind: 'hit_stun' }, 0, 1);
        expect(dead.buffs).toHaveLength(0);

        const unit = makeUnit('skip', CELL_SIZE, CELL_SIZE);
        applyUnitHitPause(unit, { seconds: DEFAULT_HIT_STUN_SECONDS, kind: 'hit_stun' }, 0, 1);
        applyUnitHitPause(unit, { seconds: 0, kind: 'hit_stun' }, 0, 1);
        expect(unit.buffs).toHaveLength(1);
        expect(unit.hasBuff(HIT_STUN_BUFF_TYPE)).toBe(true);
    });

    it('restores a tick-counted pause, and Force Push hit-stop stays the world-time buff', () => {
        const unit = makeUnit('save', CELL_SIZE, CELL_SIZE);
        const harness = makeHarness([unit]);
        applyUnitHitPause(unit, { seconds: DEFAULT_HIT_STUN_SECONDS, kind: 'hit_stun' }, harness.engine.gameTime, harness.engine.roundNumber);
        harness.tick();
        const live = unit.buffs[0] as HitPauseBuff;
        const restored = buffFromJSON(live.toJSON());
        expect(restored).toBeInstanceOf(HitPauseBuff);
        expect(restored._type).toBe(HIT_STUN_BUFF_TYPE);
        expect((restored as HitPauseBuff).ticksRemaining).toBe(live.ticksRemaining);

        const legacy = new HitStopBuff(HIT_STOP_DURATION_SECONDS);
        legacy.appliedAtTime = harness.engine.gameTime;
        const legacyRestored = buffFromJSON(legacy.toJSON());
        expect(legacyRestored).toBeInstanceOf(HitStopBuff);
        expect(legacyRestored).not.toBeInstanceOf(HitPauseBuff);
        expect(legacyRestored._type).toBe(HIT_STOP_BUFF_TYPE);
    });
});

describe('applyProjectileHitStop', () => {
    it('holds a tempo-1 projectile for hitstop ticks while another keeps flying', () => {
        const harness = makeHarness([]);
        const paused = makeProjectile(CELL_SIZE);
        const flying = makeProjectile(CELL_SIZE * 3);
        harness.projectiles.addProjectile(paused);
        harness.projectiles.addProjectile(flying);
        applyProjectileHitStop(paused, DEFAULT_HIT_STOP_SECONDS, harness.engine.gameTime);
        expect(paused.buffs[0]?.timeModifier).toEqual({
            sourceId: PROJECTILE_HIT_STOP_SOURCE_ID,
            tempo: 1,
            freeze: true,
        });

        const pausedStart = paused.x;
        let flyingX = flying.x;
        const ticks = hitPauseTicks(DEFAULT_HIT_STOP_SECONDS, 1);
        for (let i = 0; i < ticks; i++) {
            harness.tick();
            expect(paused.x).toBe(pausedStart);
            expect(flying.x).toBeGreaterThan(flyingX);
            flyingX = flying.x;
        }
        harness.tick();
        expect(paused.x).toBeGreaterThan(pausedStart);
        expect(flying.x).toBeGreaterThan(flyingX);
        expect(harness.engine.timeManager.worldPace).toBe(1);
    });

    it('world pace 0.5 does not stretch projectile hitstop', () => {
        const focal = makeUnit('focal', CELL_SIZE, CELL_SIZE * 8);
        const harness = makeHarness([focal]);
        applyTempo(focal, 1, harness.engine.gameTime, harness.engine.roundNumber, SLOW_WORLD_PACE);
        const paused = makeProjectile(CELL_SIZE * 2);
        harness.projectiles.addProjectile(paused);
        applyProjectileHitStop(paused, DEFAULT_HIT_STOP_SECONDS, harness.engine.gameTime);
        const start = paused.x;
        const ticks = hitPauseTicks(DEFAULT_HIT_STOP_SECONDS, 1);
        for (let i = 0; i < ticks; i++) {
            harness.tick();
            expect(paused.x).toBe(start);
        }
        expect(harness.engine.timeManager.worldPace).toBe(SLOW_WORLD_PACE);
        harness.tick();
        expect(paused.x).toBeGreaterThan(start);
    });
});

/** Distinct from both defaults so a one-field override is visible. Seconds. */
const OVERRIDE_HIT_STOP_SECONDS = 6 * FIXED_DT;
const OVERRIDE_HIT_STUN_SECONDS = 8 * FIXED_DT;
/** Authored length that turns that side of the pause off. */
const HIT_PAUSE_OFF_SECONDS = 0;
const UNKNOWN_ABILITY_ID = 'not_a_registered_hit_impact_ability';

const HIT_IMPACT_DEFAULTS = {
    hitstopSeconds: DEFAULT_HIT_STOP_SECONDS,
    hitstunSeconds: DEFAULT_HIT_STUN_SECONDS,
};

describe('resolveHitImpactSeconds', () => {
    it('uses the defaults when the ability is unknown or omits hitImpact', () => {
        expect(resolveHitImpactSeconds(undefined)).toEqual(HIT_IMPACT_DEFAULTS);
        expect(resolveHitImpactSeconds(getAbility(UNKNOWN_ABILITY_ID))).toEqual(HIT_IMPACT_DEFAULTS);
        expect(resolveHitImpactSeconds({})).toEqual(HIT_IMPACT_DEFAULTS);
        expect(resolveHitImpactSeconds({ hitImpact: {} })).toEqual(HIT_IMPACT_DEFAULTS);
    });

    it('replaces only the field an override sets', () => {
        expect(resolveHitImpactSeconds({ hitImpact: { hitstopSeconds: OVERRIDE_HIT_STOP_SECONDS } })).toEqual({
            hitstopSeconds: OVERRIDE_HIT_STOP_SECONDS,
            hitstunSeconds: DEFAULT_HIT_STUN_SECONDS,
        });
        expect(resolveHitImpactSeconds({ hitImpact: { hitstunSeconds: OVERRIDE_HIT_STUN_SECONDS } })).toEqual({
            hitstopSeconds: DEFAULT_HIT_STOP_SECONDS,
            hitstunSeconds: OVERRIDE_HIT_STUN_SECONDS,
        });
    });

    it('keeps 0 so that side does not pause', () => {
        expect(resolveHitImpactSeconds({ hitImpact: { hitstopSeconds: HIT_PAUSE_OFF_SECONDS } })).toEqual({
            hitstopSeconds: HIT_PAUSE_OFF_SECONDS,
            hitstunSeconds: DEFAULT_HIT_STUN_SECONDS,
        });
        expect(resolveHitImpactSeconds({ hitImpact: { hitstunSeconds: HIT_PAUSE_OFF_SECONDS } })).toEqual({
            hitstopSeconds: DEFAULT_HIT_STOP_SECONDS,
            hitstunSeconds: HIT_PAUSE_OFF_SECONDS,
        });
        expect(resolveHitImpactSeconds({
            hitImpact: { hitstopSeconds: HIT_PAUSE_OFF_SECONDS, hitstunSeconds: HIT_PAUSE_OFF_SECONDS },
        })).toEqual({
            hitstopSeconds: HIT_PAUSE_OFF_SECONDS,
            hitstunSeconds: HIT_PAUSE_OFF_SECONDS,
        });
    });

    it('reads hitImpact off an ability defined with defineAbility', () => {
        const ability = defineAbility({
            id: 'test_hit_impact_override',
            name: 'Hit Impact Override',
            image: '',
            resourceCost: null,
            rechargeTurns: 0,
            prefireTime: 0,
            targets: [],
            abilityTimings: [{ id: 'active', start: 0, end: PROBE_CAST_SECONDS, abilityPhase: AbilityPhase.Active }],
            hitImpact: { hitstopSeconds: OVERRIDE_HIT_STOP_SECONDS },
            getTooltipText: () => ['Hit impact override'],
            getRange: () => ({ minRange: 0, maxRange: 100 }),
        });
        expect(resolveHitImpactSeconds(ability)).toEqual({
            hitstopSeconds: OVERRIDE_HIT_STOP_SECONDS,
            hitstunSeconds: DEFAULT_HIT_STUN_SECONDS,
        });
    });
});

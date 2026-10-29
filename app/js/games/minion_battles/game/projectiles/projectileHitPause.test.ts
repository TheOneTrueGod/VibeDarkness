/**
 * Projectile strikes on a full engine tick (`stepSimulationFixedTicks` / `fixedUpdate`).
 * Not a hand-passed `dt`. The caster keeps its own tempo; only the projectile and the victim pause.
 */
import { describe, expect, it } from 'vitest';
import { AbilityState, type AbilityStatic } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { registerAbilityForTest } from '../../abilities/AbilityRegistry';
import { defineAbility } from '../../abilities/defineAbility';
import { HIT_STOP_BUFF_TYPE } from '../../buffs/HitStopBuff';
import { HIT_STUN_BUFF_TYPE, PROJECTILE_HIT_STOP_SOURCE_ID, hitPauseTicks } from '../../buffs/hitPause';
import { GameEngine } from '../GameEngine';
import { FIXED_DT } from '../gameConstants';
import type { ProjectileHitPolicy } from './Projectile';
import { Projectile } from './Projectile';
import { Unit } from '../units/Unit';
import { executeUnitAbility } from '../units/unitAbilityLifecycle';
import { DEFAULT_UNIT_RADIUS } from '../units/unit_defs/unitConstants';
import { DEFAULT_HIT_STOP_SECONDS } from '../time/timeConstants';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { buildTinyBattleEngine, TINY_BATTLE_PLAYER_ID } from '../../testing/harness/buildTinyBattleEngine';

/** Outlasts the hitstop window so the caster stays mid-cast and does not owe an order. */
const CASTER_CAST_SECONDS = 1;
/** iFrame window. Covers the strike tick. */
const IFRAME_SECONDS = 1;
const SHOT_DAMAGE = 10;
const VICTIM_MAX_HP = 100;
const BATTLE_GRID_CELLS = 8;
const CASTER_COL = 1;
const CASTER_ROW = 1;
const CASTER_GOAL_COL = 6;
const VICTIM_COL = 5;
const VICTIM_ROW = 4;
/** Starts this far outside the contact radii so the hit is the first tick, not the spawn. */
const APPROACH_SLACK_PX = 1;
/** Travel per tick at tempo 1. Longer than the slack, so the first tick connects. */
const PIXELS_PER_TICK = 8;
const PROJECTILE_SPEED = PIXELS_PER_TICK / FIXED_DT;
/** Farther than the hitch, so the projectile does not expire while it is frozen. */
const FLIGHT_DISTANCE = 10_000;
const NO_AI_TREE = 'none';
/** A damaging hit already spent, so the next overlap is knockback-only overflow. */
const SPENT_DAMAGING_HIT_ID = 'spent_damaging_hit';

const CASTER_CAST_ID = 'test_projectile_hit_pause_caster';
const SHOT_ID = 'test_projectile_hit_pause_shot';
const IFRAME_CAST_ID = 'test_projectile_hit_pause_iframe';

const PASS_THROUGH_HITS: ProjectileHitPolicy = { damagingHits: 1, overflow: 'passThrough' };
const KNOCKBACK_OVERFLOW_HITS: ProjectileHitPolicy = { damagingHits: 1, overflow: 'knockbackOnly' };

const CasterCast = defineAbility({
    id: CASTER_CAST_ID,
    name: 'Caster Cast',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [{ id: 'active', start: 0, end: CASTER_CAST_SECONDS, abilityPhase: AbilityPhase.Active }],
    getTooltipText: () => ['Caster cast'],
    getRange: () => ({ minRange: 0, maxRange: CELL_SIZE }),
});

const Shot = defineAbility({
    id: SHOT_ID,
    name: 'Shot',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [{ id: 'active', start: 0, end: CASTER_CAST_SECONDS, abilityPhase: AbilityPhase.Active }],
    getTooltipText: () => ['Shot'],
    getRange: () => ({ minRange: 0, maxRange: CELL_SIZE }),
});

const IFrameCast = defineAbility({
    id: IFRAME_CAST_ID,
    name: 'IFrame Cast',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [{ id: 'active', start: 0, end: IFRAME_SECONDS, abilityPhase: AbilityPhase.Active }],
    getAbilityStates: () => [{ state: AbilityState.IFRAMES }],
    getTooltipText: () => ['IFrame cast'],
    getRange: () => ({ minRange: 0, maxRange: CELL_SIZE }),
});

registerAbilityForTest(CasterCast);
registerAbilityForTest(Shot);
registerAbilityForTest(IFrameCast);

function cellCenter(index: number): number {
    return index * CELL_SIZE + CELL_SIZE / 2;
}

function makeUnit(
    id: string,
    x: number,
    y: number,
    teamId: 'player' | 'enemy',
    ownerId: string,
    speed: number,
): Unit {
    const unit = new Unit({
        id,
        x,
        y,
        hp: VICTIM_MAX_HP,
        maxHp: VICTIM_MAX_HP,
        speed,
        teamId,
        ownerId,
        characterId: 'test',
        name: id,
        abilities: [],
        unitAITreeId: NO_AI_TREE,
        radius: DEFAULT_UNIT_RADIUS,
    });
    unit.moveJitter = 0;
    return unit;
}

function cast(unit: Unit, ability: AbilityStatic, engine: GameEngine): void {
    unit.abilities = [...unit.abilities, ability.id];
    unit.abilityRuntime[ability.id] = {
        currentUses: 1,
        maxUses: 1,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    executeUnitAbility(unit, ability, [], engine);
}

interface Battle {
    engine: GameEngine;
    caster: Unit;
    victim: Unit;
}

function makeBattle(casterSpeed: number): Battle {
    const engine = buildTinyBattleEngine({
        gridW: BATTLE_GRID_CELLS,
        gridH: BATTLE_GRID_CELLS,
        cellSize: CELL_SIZE,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
    });
    // A living player-controlled hero. With none, defeat fires at the end of tick 1 and later ticks do not run.
    const caster = makeUnit(
        'caster',
        cellCenter(CASTER_COL),
        cellCenter(CASTER_ROW),
        'player',
        TINY_BATTLE_PLAYER_ID,
        casterSpeed,
    );
    const victim = makeUnit('victim', cellCenter(VICTIM_COL), cellCenter(VICTIM_ROW), 'enemy', 'ai', 0);
    engine.addUnit(caster, 'initialGameSpawn');
    engine.addUnit(victim, 'initialGameSpawn');
    return { engine, caster, victim };
}

/** Just outside contact, flying toward the victim. The first tick closes the slack. */
function launchAt(victim: Unit, caster: Unit, engine: GameEngine, hitPolicy: ProjectileHitPolicy): Projectile {
    const projectile = new Projectile({
        x: 0,
        y: victim.y,
        velocityX: PROJECTILE_SPEED,
        velocityY: 0,
        damage: SHOT_DAMAGE,
        sourceTeamId: 'player',
        sourceUnitId: caster.id,
        sourceAbilityId: SHOT_ID,
        maxDistance: FLIGHT_DISTANCE,
        hitPolicy,
    });
    projectile.x = victim.x - (projectile.radius + victim.radius) - APPROACH_SLACK_PX;
    engine.addProjectile(projectile);
    return projectile;
}

function hasProjectileHitStop(projectile: Projectile): boolean {
    return projectile.buffs.some((buff) => buff.sourceId === PROJECTILE_HIT_STOP_SOURCE_ID);
}

describe('projectile strike pauses', () => {
    it('a tempo-1 hit freezes the projectile for hitstop, stuns the victim, and the caster keeps moving', () => {
        expect(PROJECTILE_SPEED * FIXED_DT).toBeGreaterThan(APPROACH_SLACK_PX);
        const { engine, caster, victim } = makeBattle(PROJECTILE_SPEED);
        try {
            cast(caster, CasterCast, engine);
            caster.setMovement([{ col: CASTER_GOAL_COL, row: CASTER_ROW }], undefined, 0);
            const projectile = launchAt(victim, caster, engine, PASS_THROUGH_HITS);

            engine.stepSimulationFixedTicks(1);
            expect(victim.hp).toBe(VICTIM_MAX_HP - SHOT_DAMAGE);
            expect(victim.hasBuff(HIT_STUN_BUFF_TYPE)).toBe(true);
            expect(hasProjectileHitStop(projectile)).toBe(true);
            expect(caster.hasBuff(HIT_STOP_BUFF_TYPE)).toBe(false);
            expect(caster.hasBuff(HIT_STUN_BUFF_TYPE)).toBe(false);
            expect(engine.worldPace).toBe(1);

            const stoppedX = projectile.x;
            let casterX = caster.x;
            const stopTicks = hitPauseTicks(DEFAULT_HIT_STOP_SECONDS, 1);
            for (let i = 0; i < stopTicks; i++) {
                engine.stepSimulationFixedTicks(1);
                expect(projectile.x).toBe(stoppedX);
                expect(caster.x).toBeGreaterThan(casterX);
                casterX = caster.x;
            }
            engine.stepSimulationFixedTicks(1);
            expect(projectile.x).toBeGreaterThan(stoppedX);
            expect(caster.x).toBeGreaterThan(casterX);
            expect(engine.worldPace).toBe(1);
        } finally {
            engine.destroy();
        }
    });

    it('an iFrame miss applies neither pause', () => {
        const { engine, caster, victim } = makeBattle(0);
        try {
            cast(victim, IFrameCast, engine);
            const projectile = launchAt(victim, caster, engine, PASS_THROUGH_HITS);

            engine.stepSimulationFixedTicks(1);
            expect(victim.hp).toBe(VICTIM_MAX_HP);
            expect(victim.hasBuff(HIT_STUN_BUFF_TYPE)).toBe(false);
            expect(hasProjectileHitStop(projectile)).toBe(false);
            expect(caster.hasBuff(HIT_STOP_BUFF_TYPE)).toBe(false);
            expect(caster.hasBuff(HIT_STUN_BUFF_TYPE)).toBe(false);
        } finally {
            engine.destroy();
        }
    });

    it('a knockback-only overflow pauses the projectile and the victim without damage', () => {
        const { engine, caster, victim } = makeBattle(0);
        try {
            cast(caster, CasterCast, engine);
            const projectile = launchAt(victim, caster, engine, KNOCKBACK_OVERFLOW_HITS);
            projectile.hitUnitIds.add(SPENT_DAMAGING_HIT_ID);

            engine.stepSimulationFixedTicks(1);
            expect(victim.hp).toBe(VICTIM_MAX_HP);
            expect(victim.hasBuff(HIT_STUN_BUFF_TYPE)).toBe(true);
            expect(hasProjectileHitStop(projectile)).toBe(true);
            expect(caster.hasBuff(HIT_STOP_BUFF_TYPE)).toBe(false);
            expect(projectile.knockbackOnlyUnitIds.has(victim.id)).toBe(true);

            const stoppedX = projectile.x;
            const stopTicks = hitPauseTicks(DEFAULT_HIT_STOP_SECONDS, 1);
            for (let i = 0; i < stopTicks; i++) {
                engine.stepSimulationFixedTicks(1);
                expect(projectile.x).toBe(stoppedX);
            }
            engine.stepSimulationFixedTicks(1);
            expect(projectile.x).toBeGreaterThan(stoppedX);
        } finally {
            engine.destroy();
        }
    });
});

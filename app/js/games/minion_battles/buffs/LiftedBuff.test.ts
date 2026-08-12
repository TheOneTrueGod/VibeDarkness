import { describe, expect, it, vi } from 'vitest';
import { Unit } from '../game/units/Unit';
import { EventBus } from '../game/EventBus';
import { updateUnit } from '../game/units/unitMovementTick';
import { knockbackCtxFromEngine } from '../crowdControl/knockbackKeywords';
import { tryApplyLift } from '../crowdControl/tryApplyLift';
import { LIFTED_BUFF_TYPE, LIFTED_RENDER_HEIGHT_RADIUS_FACTOR, LIFTED_SLAM_KNOCKBACK_RADIUS_FACTOR, LIFTED_SLAM_KNOCKBACK_TIER, getLiftedMaxRenderHeightPx, getLiftedRenderProgress, getLiftedRenderState } from './LiftedBuff';
import { DEFAULT_UNIT_RADIUS } from '../game/units/unit_defs/unitConstants';
import { getKnockbackTierDef } from '../crowdControl/knockbackKeywords';
import { TerrainGrid, CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainManager } from '../terrain/TerrainManager';
import { TerrainType } from '../terrain/TerrainType';
import { TerrainLayerManager } from '../game/TerrainLayerManager';
import type { KnockbackSource } from '../game/units/unitTypes';
import type { UnitSlamLandedEvent } from '../game/EventBus';

const LIFT_SOURCE: KnockbackSource = { unitId: 'caster', abilityId: '0903' };
const LIFT_ABILITY_ID = LIFT_SOURCE.abilityId;
const LIFT_DURATION_SEC = 0.4;
const SLAM_DAMAGE = 6;

function makeUnit(overrides: Partial<ConstructorParameters<typeof Unit>[0]> = {}): Unit {
    return new Unit({
        id: 'u1',
        x: 100,
        y: 100,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'slime',
        name: 'Slime',
        ...overrides,
    });
}

function makeLiftEngine(gameTime = 0, terrainManager: TerrainManager | null = null, units: Unit[] = []) {
    const eventBus = new EventBus();
    return {
        eventBus,
        gameTime,
        roundNumber: 1,
        terrainManager,
        units,
        interruptUnitAndRefundAbilities: vi.fn(),
        ctx: knockbackCtxFromEngine({
            gameTime,
            roundNumber: 1,
            eventBus,
            interruptUnitAndRefundAbilities: vi.fn(),
        }),
    };
}

function makeTerrainManager(cols: number, rows: number): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(cols, rows, CELL_SIZE, TerrainType.Grass);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

function applyLiftToUnit(
    unit: Unit,
    engine: ReturnType<typeof makeLiftEngine>,
    slamParams: { slamDamage: number; horizontalTarget?: { x: number; y: number }; sourceAbilityId: string },
) {
    unit.ccArmour.hardFloor = 0;
    unit.ccArmour.bonusHard = 0;
    return tryApplyLift(unit, LIFT_DURATION_SEC, slamParams, LIFT_SOURCE, engine.ctx);
}

function tickUntilLiftEnds(unit: Unit, engine: ReturnType<typeof makeLiftEngine>, dt = 0.05): void {
    while (unit.hasBuff(LIFTED_BUFF_TYPE)) {
        engine.gameTime += dt;
        engine.ctx = knockbackCtxFromEngine({
            gameTime: engine.gameTime,
            roundNumber: 1,
            eventBus: engine.eventBus,
            interruptUnitAndRefundAbilities: engine.interruptUnitAndRefundAbilities,
        });
        updateUnit(unit, dt, engine);
    }
}

describe('LiftedBuff', () => {
    it('prevents the unit from acting for the lift duration', () => {
        const unit = makeUnit();
        const engine = makeLiftEngine();

        const result = applyLiftToUnit(unit, engine, {
            slamDamage: SLAM_DAMAGE,
            sourceAbilityId: LIFT_ABILITY_ID,
        });
        expect(result.outcome).toBe('applied');
        expect(unit.canAct()).toBe(false);

        engine.gameTime += LIFT_DURATION_SEC * 0.5;
        updateUnit(unit, 0.05, engine);
        expect(unit.hasBuff(LIFTED_BUFF_TYPE)).toBe(true);
        expect(unit.canAct()).toBe(false);
    });

    it('applies slam damage and emits unit_slam_landed on expiry', () => {
        const unit = makeUnit();
        const engine = makeLiftEngine();
        const slamEvents: UnitSlamLandedEvent[] = [];
        engine.eventBus.on('unit_slam_landed', (data) => slamEvents.push(data));

        applyLiftToUnit(unit, engine, {
            slamDamage: SLAM_DAMAGE,
            sourceAbilityId: LIFT_ABILITY_ID,
        });

        tickUntilLiftEnds(unit, engine);

        expect(unit.hasBuff(LIFTED_BUFF_TYPE)).toBe(false);
        expect(unit.hp).toBe(100 - SLAM_DAMAGE);
        expect(slamEvents).toHaveLength(1);
        expect(slamEvents[0].unitId).toBe(unit.id);
        expect(slamEvents[0].sourceAbilityId).toBe(LIFT_ABILITY_ID);
        expect(slamEvents[0].position.x).toBeCloseTo(unit.x, 5);
        expect(slamEvents[0].position.y).toBeCloseTo(unit.y, 5);
    });

    it('skips slam damage when the unit has iFrames on landing', () => {
        const unit = makeUnit();
        const engine = makeLiftEngine();
        const slamEvents: UnitSlamLandedEvent[] = [];
        engine.eventBus.on('unit_slam_landed', (data) => slamEvents.push(data));

        applyLiftToUnit(unit, engine, {
            slamDamage: SLAM_DAMAGE,
            sourceAbilityId: LIFT_ABILITY_ID,
        });
        expect(unit.hasBuff(LIFTED_BUFF_TYPE)).toBe(true);

        // iFrames after lift applies (tryApplyLift itself resists iframes at cast time).
        vi.spyOn(unit, 'hasIFrames').mockReturnValue(true);

        tickUntilLiftEnds(unit, engine);

        expect(unit.hasBuff(LIFTED_BUFF_TYPE)).toBe(false);
        expect(unit.hp).toBe(100);
        expect(slamEvents).toHaveLength(1);
    });

    it('terrain-clamps horizontalTarget displacement on slam', () => {
        const terrainManager = makeTerrainManager(8, 4);
        terrainManager.grid.set(4, 2, TerrainType.Rock);
        const unit = makeUnit({ x: CELL_SIZE * 1.5, y: CELL_SIZE * 2.5 });
        const engine = makeLiftEngine(0, terrainManager);
        const targetX = CELL_SIZE * 5.5;

        applyLiftToUnit(unit, engine, {
            slamDamage: SLAM_DAMAGE,
            horizontalTarget: { x: targetX, y: unit.y },
            sourceAbilityId: LIFT_ABILITY_ID,
        });

        tickUntilLiftEnds(unit, engine);

        expect(terrainManager.isPassable(unit.x, unit.y)).toBe(true);
        expect(unit.x).toBeLessThan(CELL_SIZE * 4);
    });

    it('is absorbed by CC armour the same as knockback/stun', () => {
        const unit = makeUnit();
        unit.ccArmour.hardFloor = 2;
        unit.ccArmour.bonusHard = 0;
        const engine = makeLiftEngine();

        const result = tryApplyLift(
            unit,
            LIFT_DURATION_SEC,
            { slamDamage: SLAM_DAMAGE, sourceAbilityId: LIFT_ABILITY_ID },
            LIFT_SOURCE,
            engine.ctx,
        );

        expect(result.outcome).toBe('absorbed');
        expect(unit.hasBuff(LIFTED_BUFF_TYPE)).toBe(false);
        expect(unit.ccArmour.hardConsumed).toBe(1);
    });

    it('render height ramps from ground to max over the lift duration', () => {
        const unit = makeUnit({ radius: 20 });
        const engine = makeLiftEngine();
        const maxHeight = getLiftedMaxRenderHeightPx(unit.radius);

        applyLiftToUnit(unit, engine, {
            slamDamage: SLAM_DAMAGE,
            sourceAbilityId: LIFT_ABILITY_ID,
        });

        expect(maxHeight).toBe(unit.radius * LIFTED_RENDER_HEIGHT_RADIUS_FACTOR);
        const atStart = getLiftedRenderState(unit, engine.gameTime);
        expect(atStart?.maxHeight).toBe(maxHeight);
        expect(atStart?.yOffset).toBeCloseTo(0, 5);

        const midTime = engine.gameTime + LIFT_DURATION_SEC * 0.5;
        expect(getLiftedRenderProgress(engine.gameTime, LIFT_DURATION_SEC, midTime)).toBeCloseTo(0.5, 5);
        expect(getLiftedRenderState(unit, midTime)).toEqual({ yOffset: -maxHeight * 0.5, maxHeight });

        const endTime = engine.gameTime + LIFT_DURATION_SEC;
        expect(getLiftedRenderState(unit, endTime)).toEqual({ yOffset: -maxHeight, maxHeight });
    });

    it('applies magnitude-1 knockback to nearby units within 1× slamming unit radius on slam', () => {
        const slamming = makeUnit({ id: 'slamming', x: 100, y: 100, radius: DEFAULT_UNIT_RADIUS });
        const nearby = makeUnit({
            id: 'nearby',
            x: 100 + DEFAULT_UNIT_RADIUS * 0.5,
            y: 100,
            radius: DEFAULT_UNIT_RADIUS,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
        });
        nearby.ccArmour.hardFloor = 0;
        nearby.ccArmour.bonusHard = 0;
        const far = makeUnit({
            id: 'far',
            x: 100 + DEFAULT_UNIT_RADIUS * 2,
            y: 100,
            radius: DEFAULT_UNIT_RADIUS,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
        });
        far.ccArmour.hardFloor = 0;
        far.ccArmour.bonusHard = 0;

        const engine = makeLiftEngine(0, null, [slamming, nearby, far]);
        const farStart = { x: far.x, y: far.y };
        const tier1 = getKnockbackTierDef(LIFTED_SLAM_KNOCKBACK_TIER)!;
        expect(LIFTED_SLAM_KNOCKBACK_RADIUS_FACTOR).toBe(1);

        applyLiftToUnit(slamming, engine, {
            slamDamage: SLAM_DAMAGE,
            sourceAbilityId: LIFT_ABILITY_ID,
        });
        tickUntilLiftEnds(slamming, engine);

        expect(nearby.knockback).not.toBeNull();
        expect(far.knockback).toBeNull();
        expect(far.x).toBe(farStart.x);
        expect(far.y).toBe(farStart.y);
        // Tier-1 air+slide times are what "magnitude 1" means in knockbackKeywords.
        expect(tier1.magnitude).toBeGreaterThan(0);
    });
});

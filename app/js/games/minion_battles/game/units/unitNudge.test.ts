import { describe, expect, it, vi } from 'vitest';
import { Unit } from './Unit';
import { EventBus } from '../EventBus';
import { applyNudgeToUnit, updateUnitNudge } from './unitNudge';
import { updateUnitKnockback } from './unitKnockback';
import { updateUnit } from './unitMovementTick';
import {
    getKnockbackTierDef,
    knockbackCtxFromEngine,
    tryApplyKnockbackByTier,
    tryApplyPullByTier,
} from '../../crowdControl/knockbackKeywords';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { TerrainLayerManager } from '../TerrainLayerManager';
import type { KnockbackSource } from './unitTypes';

const PULL_SOURCE: KnockbackSource = { unitId: 'caster', abilityId: '0903' };

const PULL_TIER = 3;
const PULL_DISTANCE_PX = 60;

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

function makeKnockbackEngine(interrupt = vi.fn()) {
    const eventBus = new EventBus();
    return {
        eventBus,
        interrupt,
        ctx: knockbackCtxFromEngine({
            gameTime: 0,
            roundNumber: 1,
            eventBus,
            interruptUnitAndRefundAbilities: interrupt,
        }),
    };
}

function makeTerrainManager(cols: number, rows: number): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(cols, rows, CELL_SIZE, TerrainType.Grass);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

function tickKnockbackToCompletion(unit: Unit, dt = 0.01): void {
    while (unit.knockback) {
        updateUnitKnockback(unit, dt, null, null);
    }
}

describe('applyNudgeToUnit', () => {
    it('displaces a unit without clearing its move path', () => {
        const unit = makeUnit();
        unit.setMovement([{ col: 5, row: 2 }], undefined, 0);
        const pathBefore = unit.movement!.path.length;

        applyNudgeToUnit(unit, { x: 24, y: 0 }, 0.2);
        expect(unit.movement).not.toBeNull();
        expect(unit.movement!.path.length).toBe(pathBefore);

        updateUnitNudge(unit, 0.2, null, null);
        expect(unit.x).toBeGreaterThan(100);
        expect(unit.movement).not.toBeNull();
        expect(unit.nudge).toBeNull();
    });

    it('does not interrupt an in-progress ability windup', () => {
        const unit = makeUnit();
        unit.activeAbilities = [{
            abilityId: 'windup_test',
            startTime: 0,
            targets: [],
            fired: false,
        }];

        applyNudgeToUnit(unit, { x: 12, y: 0 }, 0.15);
        updateUnitNudge(unit, 0.15, null, null);

        expect(unit.activeAbilities).toHaveLength(1);
        expect(unit.activeAbilities[0].abilityId).toBe('windup_test');
    });

    it('halts at unwalkable terrain and clears nudge state', () => {
        const terrainManager = makeTerrainManager(8, 4);
        terrainManager.grid.set(3, 2, TerrainType.Rock);
        const grid = terrainManager.grid;

        const unit = makeUnit({ x: CELL_SIZE * 1.5, y: CELL_SIZE * 2.5 });
        applyNudgeToUnit(unit, { x: 200, y: 0 }, 0.5);

        while (unit.nudge) {
            updateUnitNudge(unit, 0.02, grid, terrainManager);
        }

        expect(terrainManager.isPassable(unit.x, unit.y)).toBe(true);
        expect(unit.x).toBeLessThan(CELL_SIZE * 3);
    });
});

describe('tryApplyPullByTier', () => {
    it('stops exactly at the pull point after knockback resolves', () => {
        const unit = makeUnit({ x: 100, y: 100 });
        const pullPoint = { x: 100 + PULL_DISTANCE_PX, y: 100 };
        const { ctx } = makeKnockbackEngine();

        unit.ccArmour.hardFloor = 0;
        unit.ccArmour.bonusHard = 0;

        const result = tryApplyPullByTier(unit, PULL_TIER, PULL_SOURCE, pullPoint, ctx);
        expect(result.outcome).toBe('applied');
        expect(unit.knockback).not.toBeNull();

        tickKnockbackToCompletion(unit);

        expect(unit.x).toBeCloseTo(pullPoint.x, 5);
        expect(unit.y).toBeCloseTo(pullPoint.y, 5);
        expect(unit.knockback).toBeNull();
    });

    it('is absorbed by CC armour the same as knockback', () => {
        const unit = makeUnit();
        unit.ccArmour.hardFloor = 2;
        unit.ccArmour.bonusHard = 0;
        unit.ccArmour.chainResist = 0;

        const { ctx } = makeKnockbackEngine();
        const pullPoint = { x: 160, y: 100 };

        const pullResult = tryApplyPullByTier(unit, 2, PULL_SOURCE, pullPoint, ctx);
        expect(pullResult.outcome).toBe('absorbed');
        expect(unit.ccArmour.hardConsumed).toBe(1);
        expect(unit.knockback).toBeNull();

        const knockResult = tryApplyKnockbackByTier(unit, 2, PULL_SOURCE, 0, 0, ctx);
        expect(knockResult.outcome).toBe('absorbed');
        expect(unit.ccArmour.hardConsumed).toBe(2);
        expect(unit.knockback).toBeNull();
    });
});

describe('nudge during unit movement tick', () => {
    it('continues path following while nudge is active', () => {
        const unit = makeUnit({ x: CELL_SIZE * 1.5, y: CELL_SIZE * 1.5, speed: 200 });
        unit.setMovement([{ col: 3, row: 1 }], undefined, 0);
        applyNudgeToUnit(unit, { x: 8, y: 0 }, 0.1);

        const engine = {
            gameTime: 0,
            roundNumber: 1,
            terrainManager: null,
        };

        updateUnit(unit, 0.05, engine);

        expect(unit.movement).not.toBeNull();
        expect(unit.x).toBeGreaterThan(CELL_SIZE * 1.5);
    });
});

describe('pull knockback timing', () => {
    it('uses tier air and slide durations from knockback defs', () => {
        const tierDef = getKnockbackTierDef(PULL_TIER);
        expect(tierDef).not.toBeNull();
        if (!tierDef) throw new Error('expected tier def');

        const unit = makeUnit();
        unit.ccArmour.hardFloor = 0;
        const { ctx } = makeKnockbackEngine();

        tryApplyPullByTier(unit, PULL_TIER, PULL_SOURCE, { x: 160, y: 100 }, ctx);
        expect(unit.knockback?.knockbackAirTime).toBe(tierDef.airTime);
        expect(unit.knockback?.knockbackSlideTime).toBe(tierDef.slideTime);
    });
});

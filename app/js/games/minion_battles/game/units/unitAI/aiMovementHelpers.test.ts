/**
 * applyAIMovementToUnit / applyAIMovementToPosition: range-keeping expressed as walk goals.
 */
import { describe, it, expect } from 'vitest';
import { Unit } from '../Unit';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { MIN_FOLLOW_RADIUS } from '../../gameConstants';
import { createAINav } from './aiNav';
import { applyAIMovementToPosition, applyAIMovementToUnit } from './utils';
import type { AIContext } from './types';

function makeUnit(id: string, col: number, row: number, teamId: 'enemy' | 'player'): Unit {
    return new Unit({
        id,
        x: col * CELL_SIZE + CELL_SIZE / 2,
        y: row * CELL_SIZE + CELL_SIZE / 2,
        hp: 10,
        speed: 90,
        teamId,
        ownerId: teamId === 'enemy' ? 'ai' : 'p1',
        characterId: 'swarmling',
        name: id,
        aiSettings: { minRange: 80, maxRange: 160 },
    });
}

function makeContext(tm: TerrainManager): AIContext {
    return {
        nav: createAINav(() => tm),
        WORLD_WIDTH: tm.grid.worldWidth,
        WORLD_HEIGHT: tm.grid.worldHeight,
    } as unknown as AIContext;
}

const centre = (cell: { col: number; row: number }) => ({
    x: cell.col * CELL_SIZE + CELL_SIZE / 2,
    y: cell.row * CELL_SIZE + CELL_SIZE / 2,
});

describe('applyAIMovementToUnit', () => {
    const tm = new TerrainManager(new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass));
    const context = makeContext(tm);

    it('chases a target beyond maxRange, stopping at the ideal range', () => {
        const unit = makeUnit('u', 2, 5, 'enemy');
        const target = makeUnit('t', 12, 5, 'player');

        applyAIMovementToUnit(unit, target, context);

        const idealRange = (80 + 160) / 2;
        const expectedStop = Math.min(160, Math.max(idealRange, unit.radius + target.radius + MIN_FOLLOW_RADIUS));
        expect(unit.walkIntent).toEqual({
            dest: { col: 12, row: 5 },
            targetUnitId: 't',
            managed: true,
            stopRange: expectedStop,
        });

        // Asking again changes nothing.
        const intent = unit.walkIntent;
        applyAIMovementToUnit(unit, target, context);
        expect(unit.walkIntent).toBe(intent);
    });

    it('never asks to stand closer than touching distance, but stays inside maxRange', () => {
        const unit = makeUnit('u', 2, 5, 'enemy');
        unit.aiSettings = { minRange: 0, maxRange: 20 };
        const target = makeUnit('t', 12, 5, 'player');
        applyAIMovementToUnit(unit, target, context);
        // Touching distance exceeds maxRange here, so maxRange wins.
        expect(unit.radius + target.radius + MIN_FOLLOW_RADIUS).toBeGreaterThan(20);
        expect(unit.walkIntent!.stopRange).toBe(20);
    });

    it('leaves the unit alone when the target is inside the range band', () => {
        const unit = makeUnit('u', 2, 5, 'enemy');
        const target = makeUnit('t', 5, 5, 'player'); // 120px away: between 80 and 160
        applyAIMovementToUnit(unit, target, context);
        expect(unit.walkIntent).toBeNull();
    });

    it('backs away from a target that is too close', () => {
        const unit = makeUnit('u', 10, 5, 'enemy');
        const target = makeUnit('t', 11, 5, 'player'); // 40px away: under minRange 80
        applyAIMovementToUnit(unit, target, context);

        expect(unit.walkIntent).not.toBeNull();
        expect(unit.walkIntent!.targetUnitId).toBeUndefined();
        const goal = centre(unit.walkIntent!.dest);
        // The goal lies on the far side of the unit from the target.
        const dot = (goal.x - unit.x) * (unit.x - target.x) + (goal.y - unit.y) * (unit.y - target.y);
        expect(dot).toBeGreaterThan(0);
    });

    it('does nothing for a unit without aiSettings', () => {
        const unit = makeUnit('u', 2, 5, 'enemy');
        unit.aiSettings = null;
        applyAIMovementToUnit(unit, makeUnit('t', 12, 5, 'player'), context);
        expect(unit.walkIntent).toBeNull();
    });
});

describe('applyAIMovementToPosition', () => {
    const tm = new TerrainManager(new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass));
    const context = makeContext(tm);

    it('approaches to the ideal range and keeps that goal stable as the unit advances', () => {
        const unit = makeUnit('u', 2, 5, 'enemy');
        const target = centre({ col: 20, row: 5 });

        applyAIMovementToPosition(unit, target, context);
        const intent = unit.walkIntent!;
        expect(intent.managed).toBe(true);
        const goal = centre(intent.dest);
        const goalDist = Math.hypot(goal.x - target.x, goal.y - target.y);
        expect(goalDist).toBeLessThanOrEqual(160);
        expect(goalDist).toBeGreaterThanOrEqual(80);

        // Half a cell further on, the approach point would round differently; the goal must not flip.
        unit.x += 3 * CELL_SIZE + 17;
        unit.y += 9;
        applyAIMovementToPosition(unit, target, context);
        expect(unit.walkIntent).toBe(intent);
    });
});

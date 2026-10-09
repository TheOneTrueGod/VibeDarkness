import { describe, expect, it, vi } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { StoneTomb } from './0530Ability';
import { Unit } from '../../../game/units/Unit';
import { EventBus } from '../../../game/EventBus';
import type { ResolvedTarget } from '../../../game/types';
import { plusTileAreaPerimeter, getPlusTileAreaCells } from '../../../abilities/tileAreaHelpers';
import { STONE_TOMB_STAGE1_DAMAGE, STONE_TOMB_STAGE2_DAMAGE } from '../earthCoreConstants';

const CELL = 40;
const center = (col: number, row: number) => ({ x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 });

function makeUnit(id: string, teamId: 'player' | 'enemy', col: number, row: number): Unit {
    const { x, y } = center(col, row);
    const u = new Unit({
        x, y, hp: 100, speed: 100, teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId: teamId === 'player' ? 'player' : 'dark_wolf',
        name: id,
    });
    return u;
}

function setup(units: Unit[]) {
    const createOrMarkRock = vi.fn();
    const engine = {
        units,
        gameTime: 0,
        roundNumber: 1,
        eventBus: new EventBus(),
        getUnit: (id: string) => units.find((u) => u.id === id),
        addEffect: () => {},
        terrainManager: { createOrMarkRock },
    };
    return { engine, createOrMarkRock };
}

const target = (col: number, row: number): ResolvedTarget[] => [
    { type: 'pixel', position: center(col, row) } as ResolvedTarget,
];

describe('Stone Tomb (0530)', () => {
    it('plus geometry: 5 cells and a 12-vertex perimeter', () => {
        expect(getPlusTileAreaCells({ col: 5, row: 5 })).toHaveLength(5);
        expect(plusTileAreaPerimeter({ col: 5, row: 5 })).toHaveLength(12);
    });

    it('stage 1 damages only centre-tile enemies and raises only the centre rock', () => {
        const caster = makeUnit('c', 'player', 5, 9);
        const inCenter = makeUnit('a', 'enemy', 5, 5);
        const inArm = makeUnit('b', 'enemy', 6, 5);
        const { engine, createOrMarkRock } = setup([caster, inCenter, inArm]);
        StoneTomb.doCardEffect!(engine, caster, target(5, 5), 0.49, 0.5);
        expect(inCenter.hp).toBe(100 - STONE_TOMB_STAGE1_DAMAGE);
        expect(inArm.hp).toBe(100);
        expect(createOrMarkRock).toHaveBeenCalledTimes(1);
        expect(createOrMarkRock).toHaveBeenCalledWith(5, 5);
    });

    it('stage 1 knocks back allies in the centre tile without damaging them', () => {
        const caster = makeUnit('c', 'player', 5, 9);
        const ally = makeUnit('al', 'player', 5, 5);
        const enemy = makeUnit('a', 'enemy', 5, 5);
        enemy.x += 10;
        ally.x -= 10;
        const { engine } = setup([caster, ally, enemy]);
        StoneTomb.doCardEffect!(engine, caster, target(5, 5), 0.49, 0.5);
        expect(ally.hp).toBe(100);
        expect(ally.knockback).not.toBeNull();
        expect(enemy.hp).toBe(100 - STONE_TOMB_STAGE1_DAMAGE);
    });

    it('stage 2 damages every plus tile (centre included) and raises the 4 outer rocks only', () => {
        const caster = makeUnit('c', 'player', 5, 9);
        const inCenter = makeUnit('a', 'enemy', 5, 5);
        const inArm = makeUnit('b', 'enemy', 6, 5);
        const outside = makeUnit('d', 'enemy', 6, 6);
        const { engine, createOrMarkRock } = setup([caster, inCenter, inArm, outside]);
        StoneTomb.doCardEffect!(engine, caster, target(5, 5), 0.74, 0.75);
        expect(inCenter.hp).toBe(100 - STONE_TOMB_STAGE2_DAMAGE);
        expect(inArm.hp).toBe(100 - STONE_TOMB_STAGE2_DAMAGE);
        expect(outside.hp).toBe(100);
        const cells = createOrMarkRock.mock.calls.map(([c, r]) => `${c},${r}`).sort();
        expect(cells).toEqual(['4,5', '5,4', '5,6', '6,5']);
    });

    it('does nothing between stages', () => {
        const caster = makeUnit('c', 'player', 5, 9);
        const enemy = makeUnit('a', 'enemy', 5, 5);
        const { engine, createOrMarkRock } = setup([caster, enemy]);
        StoneTomb.doCardEffect!(engine, caster, target(5, 5), 0.5, 0.6);
        expect(enemy.hp).toBe(100);
        expect(createOrMarkRock).not.toHaveBeenCalled();
    });

    it('clamps an out-of-range pick to 4 tiles from the caster', () => {
        const caster = makeUnit('c', 'player', 5, 9);
        const { engine, createOrMarkRock } = setup([caster]);
        StoneTomb.doCardEffect!(engine, caster, target(5, 0), 0.49, 0.5);
        expect(createOrMarkRock).toHaveBeenCalledWith(5, 5);
    });
});

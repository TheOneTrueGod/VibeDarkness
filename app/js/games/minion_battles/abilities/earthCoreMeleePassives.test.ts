import { describe, expect, it } from 'vitest';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainManager } from '../terrain/TerrainManager';
import { TerrainType } from '../terrain/TerrainType';
import { Unit } from '../game/units/Unit';
import {
    countStoneTilesInTremorsense,
    DEEP_RESONANCE_PASSIVE_ID,
    getBedrockScavengerRoundStartArmour,
    getTremorsenseRadiusTilesForUnit,
} from './earthCoreMeleePassives';

function makeUnit(id: string): Unit {
    return new Unit({
        id,
        x: 100,
        y: 100,
        hp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: id,
    });
}

describe('earthCoreMeleePassives', () => {
    it('caps Bedrock Scavenger armour gain at 3', () => {
        expect(getBedrockScavengerRoundStartArmour(0)).toBe(0);
        expect(getBedrockScavengerRoundStartArmour(2)).toBe(2);
        expect(getBedrockScavengerRoundStartArmour(20)).toBe(3);
    });

    it('applies Deep Resonance tremorsense modifier', () => {
        const unit = makeUnit('u');
        const baseRadius = getTremorsenseRadiusTilesForUnit(unit);
        unit.abilities.push(DEEP_RESONANCE_PASSIVE_ID);
        const deepRadius = getTremorsenseRadiusTilesForUnit(unit);
        expect(deepRadius).toBe(baseRadius + 1);
    });

    it('counts only active stone states in tremorsense radius', () => {
        const grid = new TerrainGrid(8, 8, 40, TerrainType.Grass);
        const manager = new TerrainManager(grid);
        const unit = makeUnit('u');
        unit.x = 4 * 40 + 20;
        unit.y = 4 * 40 + 20;
        grid.set(4, 4, TerrainType.Rock); // natural stone
        grid.createOrMarkRock(5, 4); // created rock
        grid.set(6, 4, TerrainType.Rock);
        grid.damageRock(6, 4, 30); // spent rubble

        expect(countStoneTilesInTremorsense(unit, manager)).toBe(2);
    });
});

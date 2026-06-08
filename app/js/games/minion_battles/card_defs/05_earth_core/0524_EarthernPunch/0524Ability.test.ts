import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import { EarthernPunchAbility } from './0524Ability';

function makeUnit(config: { id: string; x: number; y: number; teamId: 'player' | 'enemy' }): Unit {
    return new Unit({
        x: config.x,
        y: config.y,
        hp: 100,
        speed: 100,
        teamId: config.teamId,
        ownerId: config.teamId === 'player' ? 'p1' : 'ai',
        characterId: config.teamId === 'player' ? 'player' : 'dark_wolf',
        name: config.teamId === 'player' ? 'player' : 'dark_wolf',
    });
}

describe('EarthernPunchAbility', () => {
    it('deals bonus damage to enemies standing on stone', () => {
        const caster = makeUnit({ id: 'caster', x: 40, y: 40, teamId: 'player' });
        const target = makeUnit({ id: 'target', x: 95, y: 40, teamId: 'enemy' });
        const engine = {
            units: [caster, target],
            getUnit: (id: string) => [caster, target].find((u) => u.id === id),
            gameTime: 1,
            eventBus: new EventBus(),
            terrainManager: {
                grid: { worldToGrid: () => ({ col: 2, row: 1 }), get: () => 3 /* TerrainType.Rock */ },
                getFloorTile: () => null,
            },
        };

        EarthernPunchAbility.doCardEffect!(
            engine,
            caster,
            [{ type: 'pixel', position: { x: target.x, y: target.y } }],
            0.19,
            0.21,
        );

        expect(target.hp).toBe(84);
    });
});

import { describe, expect, it } from 'vitest';
import { AnchoredTremor } from './0532Ability';
import { Unit } from '../../../game/units/Unit';
import { EventBus } from '../../../game/EventBus';
import { TerrainType } from '../../../terrain/TerrainType';
import type { ResolvedTarget } from '../../../game/types';

function makeUnit(config: { id: string; teamId: 'player' | 'enemy'; x: number; y: number }): Unit {
    return new Unit({
        x: config.x,
        y: config.y,
        hp: 100,
        speed: 100,
        teamId: config.teamId,
        ownerId: config.teamId === 'player' ? 'p1' : 'ai',
        characterId: config.teamId === 'player' ? 'player' : 'dark_wolf',
    });
}

describe('Anchored Tremor', () => {
    it('ramps pulse damage and applies stone bonus', () => {
        const caster = makeUnit({ id: 'caster', teamId: 'player', x: 0, y: 0 });
        const enemyOnStone = makeUnit({ id: 'enemy_a', teamId: 'enemy', x: 5, y: 0 });
        const enemyOnGrass = makeUnit({ id: 'enemy_b', teamId: 'enemy', x: 8, y: 0 });
        const units = [caster, enemyOnStone, enemyOnGrass];

        const engine = {
            getUnits: () => units,
            eventBus: new EventBus(),
            addEffect: () => {},
            terrainManager: {
                getTerrainAt: (x: number) => (x < 7 ? TerrainType.Rock : TerrainType.Grass),
            },
        };
        const targets: ResolvedTarget[] = [{ type: 'pixel', position: { x: 0, y: 0 } }];

        AnchoredTremor.doCardEffect!(engine, caster, targets, 0.2, 0.91);

        // Two pulses (3 + 5) and stone bonus per pulse (+2 each).
        expect(enemyOnStone.hp).toBe(100 - (3 + 2) - (5 + 2));
        expect(enemyOnGrass.hp).toBe(100 - 3 - 5);
    });
});

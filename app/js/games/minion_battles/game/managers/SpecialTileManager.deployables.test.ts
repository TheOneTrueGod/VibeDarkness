import { describe, it, expect } from 'vitest';
import { SpecialTileManager } from './SpecialTileManager';
import { DeployableRegistry } from '../deployables/DeployableRegistry';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { SpecialTile } from '../specialTiles/SpecialTile';
import type { EngineContext } from '../EngineContext';
import type { TeamId } from '../teams';

const TEAMS: TeamId[] = ['player', 'allied', 'enemy', 'nature'];

function tile(id: string, defId: string, col: number, row: number, emits = true): SpecialTile {
    return {
        id,
        defId,
        col,
        row,
        hp: 5,
        maxHp: 5,
        emitsLight: emits ? { lightAmount: 3, radius: 4 } : undefined,
    };
}

function setup() {
    const mgr = new SpecialTileManager({} as unknown as EngineContext);
    mgr.specialTiles.push(tile('fire', 'Campfire', 1, 1), tile('crys', 'Crystal', 2, 1), tile('rock', 'Rock', 3, 1, false));
    const reg = new DeployableRegistry();
    reg.registerProvider(mgr);
    return { mgr, reg };
}

describe('SpecialTileManager deployables', () => {
    it('lists only light-emitting tiles as ownerless lightEmitter deployables at tile centers', () => {
        const { mgr } = setup();
        const list = mgr.listDeployables();
        expect(list.map((d) => d.id)).toEqual(['fire', 'crys']);
        for (const d of list) {
            expect(d.kind).toBe('specialTile');
            expect(d.tags).toContain('lightEmitter');
            expect(d.teamId).toBeUndefined();
            expect(d.ownerUnitId).toBeUndefined();
        }
        expect(list[0]!.x).toBe(CELL_SIZE + CELL_SIZE / 2);
        expect(list[0]!.y).toBe(CELL_SIZE + CELL_SIZE / 2);
    });

    it('are never returned by findDeployables for any team', () => {
        const { reg } = setup();
        for (const castingTeam of TEAMS) {
            expect(
                reg.findDeployables({
                    castingTeam,
                    near: { x: CELL_SIZE * 1.5, y: CELL_SIZE * 1.5 },
                    halfExtent: 100 * CELL_SIZE,
                    tags: ['lightEmitter'],
                    includeInactive: true,
                }),
            ).toEqual([]);
        }
    });

    it('consumeDeployable returns false for them', () => {
        const { mgr, reg } = setup();
        for (const d of mgr.listDeployables()) {
            expect(reg.consumeDeployable(d)).toBe(false);
        }
        expect(mgr.specialTiles).toHaveLength(3);
    });
});

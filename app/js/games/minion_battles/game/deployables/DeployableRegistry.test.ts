import { describe, it, expect } from 'vitest';
import { DeployableRegistry, type DeployableProvider } from './DeployableRegistry';
import { REACH_5X5_HALF_EXTENT, type Deployable } from './Deployable';
import { CELL_SIZE } from '../../terrain/TerrainGrid';

function dep(p: Partial<Deployable> & { id: string }): Deployable {
    return { kind: 'lightSource', x: 0, y: 0, active: true, teamId: 'player', tags: ['lightEmitter'], ...p };
}

function fake(items: Deployable[], consumed: string[] = []): DeployableProvider {
    return {
        listDeployables: () => items,
        consume: (id) => {
            if (!items.some((d) => d.id === id)) return false;
            consumed.push(id);
            return true;
        },
    };
}

function reg(...providers: DeployableProvider[]): DeployableRegistry {
    const r = new DeployableRegistry();
    providers.forEach((p) => r.registerProvider(p));
    return r;
}

const near = { x: 0, y: 0 };

describe('DeployableRegistry', () => {
    it('filters by team and excludes ownerless', () => {
        const r = reg(
            fake([
                dep({ id: 'own' }),
                dep({ id: 'enemy', teamId: 'enemy' }),
                dep({ id: 'story', teamId: undefined }),
            ]),
        );
        expect(r.findDeployables({ castingTeam: 'player', near }).map((d) => d.id)).toEqual(['own']);
        expect(r.findDeployables({ castingTeam: 'enemy', near }).map((d) => d.id)).toEqual(['enemy']);
        expect(r.findDeployables({ castingTeam: 'nature', near })).toEqual([]);
    });

    it('requires all tags', () => {
        const r = reg(
            fake([
                dep({ id: 'a', tags: ['lightEmitter'] }),
                dep({ id: 'b', tags: ['bramble'] }),
                dep({ id: 'c', tags: ['lightEmitter', 'bramble'] }),
            ]),
        );
        expect(r.findDeployables({ castingTeam: 'player', near, tags: ['lightEmitter'] }).map((d) => d.id)).toEqual([
            'a',
            'c',
        ]);
        expect(
            r.findDeployables({ castingTeam: 'player', near, tags: ['lightEmitter', 'bramble'] }).map((d) => d.id),
        ).toEqual(['c']);
    });

    it('includes the 5x5 edge and excludes beyond it', () => {
        const r = reg(
            fake([
                dep({ id: 'edge', x: REACH_5X5_HALF_EXTENT, y: -REACH_5X5_HALF_EXTENT }),
                dep({ id: 'out', x: REACH_5X5_HALF_EXTENT + 1, y: 0 }),
            ]),
        );
        expect(REACH_5X5_HALF_EXTENT).toBe(2 * CELL_SIZE);
        expect(
            r.findDeployables({ castingTeam: 'player', near, halfExtent: REACH_5X5_HALF_EXTENT }).map((d) => d.id),
        ).toEqual(['edge']);
    });

    it('applies radius', () => {
        const r = reg(fake([dep({ id: 'in', x: 10 }), dep({ id: 'out', x: 11 })]));
        expect(r.findDeployables({ castingTeam: 'player', near, radius: 10 }).map((d) => d.id)).toEqual(['in']);
    });

    it('sorts nearest-first with stable id tie-break', () => {
        const r = reg(
            fake([
                dep({ id: 'far', x: 50 }),
                dep({ id: 'b', x: 10 }),
                dep({ id: 'a', x: -10 }),
                dep({ id: 'near', x: 1 }),
            ]),
        );
        expect(r.findDeployables({ castingTeam: 'player', near }).map((d) => d.id)).toEqual(['near', 'a', 'b', 'far']);
    });

    it('skips inactive unless includeInactive', () => {
        const r = reg(fake([dep({ id: 'off', active: false }), dep({ id: 'on' })]));
        expect(r.findDeployables({ castingTeam: 'player', near }).map((d) => d.id)).toEqual(['on']);
        expect(r.findDeployables({ castingTeam: 'player', near, includeInactive: true }).map((d) => d.id)).toEqual([
            'off',
            'on',
        ]);
    });

    it('consumeDeployable routes to the owning provider', () => {
        const c1: string[] = [];
        const c2: string[] = [];
        const light = dep({ id: 'l1' });
        const effect = dep({ id: 't1', kind: 'terrainEffect', tags: ['bramble'] });
        const r = reg(fake([light], c1), fake([effect], c2));
        expect(r.consumeDeployable(effect)).toBe(true);
        expect(c2).toEqual(['t1']);
        expect(c1).toEqual([]);
        expect(r.consumeDeployable(light)).toBe(true);
        expect(c1).toEqual(['l1']);
        expect(r.consumeDeployable(dep({ id: 'nope' }))).toBe(false);
    });
});

import { describe, it, expect } from 'vitest';
import { LightSource } from './LightSource';
import { LightSourceManager } from './LightSourceManager';
import type { EngineContext } from '../EngineContext';

const decay = { roundCreated: 1, initialLightAmount: 4, initialRadius: 2, roundsTotal: 99 };

function make(over: Partial<ConstructorParameters<typeof LightSource>[0]> = {}): LightSource {
    return new LightSource({ id: 'ls_1', x: 10, y: 20, lightAmount: 4, radius: 2, decay, ...over });
}

describe('LightSource owner/team', () => {
    it('round-trips owner and team', () => {
        const ls = make({ ownerUnitId: 'u1', ownerAbilityId: 'a1', teamId: 'player' as never });
        const back = LightSource.fromJSON(ls.toJSON());
        expect(back.ownerUnitId).toBe('u1');
        expect(back.ownerAbilityId).toBe('a1');
        expect(back.teamId).toBe('player');
    });

    it('omits owner fields when absent and loads old JSON ownerless', () => {
        const json = make().toJSON();
        expect('ownerUnitId' in json).toBe(false);
        expect('ownerAbilityId' in json).toBe(false);
        expect('teamId' in json).toBe(false);
        const back = LightSource.fromJSON(json);
        expect(back.ownerUnitId).toBeUndefined();
        expect(back.teamId).toBeUndefined();
    });
});

describe('LightSourceManager deployable provider', () => {
    const mgr = () => new LightSourceManager({} as EngineContext);

    it('tags lightEmitter only for active positive non-base lights', () => {
        const m = mgr();
        m.addLightSource(make({ id: 'a' }));
        m.addLightSource(make({ id: 'b', lightAmount: 0 }));
        m.addLightSource(make({ id: 'c', overlapMethod: { method: 'base' } as never }));
        const inactive = m.addLightSource(make({ id: 'd' }));
        inactive.active = false;
        const byId = Object.fromEntries(m.listDeployables().map((d) => [d.id, d]));
        expect(byId.a.tags).toContain('lightEmitter');
        expect(byId.a.kind).toBe('lightSource');
        expect(byId.b.tags).toEqual([]);
        expect(byId.c.tags).toEqual([]);
        expect(byId.d.tags).toEqual([]);
    });

    it('consume deactivates and reports found', () => {
        const m = mgr();
        const ls = m.addLightSource(make({ id: 'a' }));
        expect(m.consume('a')).toBe(true);
        expect(ls.active).toBe(false);
        expect(m.consume('nope')).toBe(false);
    });
});

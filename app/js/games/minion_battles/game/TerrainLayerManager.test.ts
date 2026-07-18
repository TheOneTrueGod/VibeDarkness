import { describe, expect, it } from 'vitest';
import { TerrainLayerManager, type TerrainEffectRecord } from './TerrainLayerManager';

function record(overrides: Partial<TerrainEffectRecord> & Pick<TerrainEffectRecord, 'id' | 'placedAtGameTime'>): TerrainEffectRecord {
    return {
        layer: 'ground',
        effectType: 'dark_thorn',
        area: { type: 'cell', col: 0, row: 0 },
        params: {},
        ...overrides,
    };
}

describe('TerrainLayerManager cell precedence', () => {
    it('newest effect wins a contested cell on add', () => {
        const mgr = new TerrainLayerManager();
        mgr.add(record({ id: 'old', placedAtGameTime: 0 }));
        mgr.add(record({ id: 'new', placedAtGameTime: 10 }));

        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('new');
    });

    it('does not let an older effect displace an already-claimed cell', () => {
        const mgr = new TerrainLayerManager();
        mgr.add(record({ id: 'new', placedAtGameTime: 10 }));
        mgr.add(record({ id: 'old', placedAtGameTime: 0 }));

        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('new');
    });

    it('reclaims a vacated cell with the newest remaining effect covering it', () => {
        const mgr = new TerrainLayerManager();
        mgr.add(record({ id: 'oldest', placedAtGameTime: 0 }));
        mgr.add(record({ id: 'middle', placedAtGameTime: 5 }));
        mgr.add(record({ id: 'newest', placedAtGameTime: 10 }));

        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('newest');

        mgr.remove('newest');
        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('middle');

        mgr.remove('middle');
        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('oldest');
    });

    it('expires effects independently of any owning unit', () => {
        const mgr = new TerrainLayerManager();
        mgr.add(record({ id: 'a', placedAtGameTime: 0, ownerUnitId: 'unit-1', expiresAtGameTime: 100 }));

        mgr.cleanupExpired(50);
        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('a');

        mgr.cleanupExpired(100);
        expect(mgr.getGroundEffectAt(0, 0)).toBeNull();
    });
});

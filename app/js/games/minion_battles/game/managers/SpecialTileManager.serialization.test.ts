import { describe, it, expect } from 'vitest';
import { SpecialTileManager } from './SpecialTileManager';
import type { SpecialTile } from '../specialTiles/SpecialTile';
import type { EngineContext } from '../EngineContext';
import type { SerializedSpecialTile } from '../types';

function campfire(): SpecialTile {
    return {
        id: 'special_Campfire_41_10',
        defId: 'Campfire',
        col: 41,
        row: 10,
        hp: 3,
        maxHp: 5,
        emitsLight: { lightAmount: 12, radius: 6 },
    };
}

function roundTrip(mgr: SpecialTileManager): Record<string, unknown>[] {
    const restored = new SpecialTileManager({} as unknown as EngineContext);
    restored.restoreFromJSON(JSON.parse(JSON.stringify(mgr.toJSON())) as SerializedSpecialTile[]);
    return JSON.parse(JSON.stringify(restored.toJSON()));
}

describe('SpecialTileManager serialization', () => {
    // Lobby 087E15: a peer that restored from a checkpoint had lightType 'FireLight' while a peer
    // holding the freshly built tile had none, so their user_state diverged until the next resync.
    it('a freshly added tile serializes the same as after a checkpoint round-trip', () => {
        const mgr = new SpecialTileManager({} as unknown as EngineContext);
        mgr.addSpecialTile(campfire());
        const fresh = JSON.parse(JSON.stringify(mgr.toJSON()));
        expect(fresh[0].emitsLight.lightType).toBe('FireLight');
        expect(roundTrip(mgr)).toEqual(fresh);
    });

    it('keeps an explicit lightType and does not mutate the caller emitsLight object', () => {
        const shared = { lightAmount: 5, radius: 5 };
        const mgr = new SpecialTileManager({} as unknown as EngineContext);
        mgr.addSpecialTile({ ...campfire(), emitsLight: shared });
        mgr.addSpecialTile({ ...campfire(), id: 'dark', emitsLight: { lightAmount: 5, radius: 5, lightType: 'DarkLight' } });
        expect(shared).not.toHaveProperty('lightType');
        expect(mgr.specialTiles[1].emitsLight?.lightType).toBe('DarkLight');
    });
});

import { describe, expect, it } from 'vitest';
import { DARKNESS_UPGRADES_PATCH_KEYS, withDarknessUpgradesDefaults } from './campaignFields';
import { EMPTY_DARKNESS_UPGRADES, type DarknessUpgradesState } from '../types';

describe('withDarknessUpgradesDefaults', () => {
    it('applies empty defaults when the key is missing (legacy save)', () => {
        const out = withDarknessUpgradesDefaults({ id: 'c1' } as { id: string; darknessUpgrades?: DarknessUpgradesState });
        expect(out.darknessUpgrades).toEqual(EMPTY_DARKNESS_UPGRADES);
        expect(out.id).toBe('c1');
    });

    it('does not share maps with the shared empty constant', () => {
        const out = withDarknessUpgradesDefaults({});
        expect(out.darknessUpgrades.researchTrees).not.toBe(EMPTY_DARKNESS_UPGRADES.researchTrees);
    });

    it('preserves an existing value', () => {
        const darknessUpgrades = {
            researchTrees: { darkness_upgrades: ['empowered_spirits'] },
            researchNodeLevels: { darkness_upgrades: { empowered_spirits: 1 } },
            researchNodeSources: {},
        };
        const out = withDarknessUpgradesDefaults({ darknessUpgrades });
        expect(out.darknessUpgrades).toEqual(darknessUpgrades);
    });

    it('fills missing sub-maps of a partial value', () => {
        const partial = { researchTrees: { t: ['n'] } } as unknown as DarknessUpgradesState;
        const out = withDarknessUpgradesDefaults({ darknessUpgrades: partial });
        expect(out.darknessUpgrades.researchTrees).toEqual({ t: ['n'] });
        expect(out.darknessUpgrades.researchNodeLevels).toEqual({});
        expect(out.darknessUpgrades.researchNodeSources).toEqual({});
    });

    it('lists the PATCH keys', () => {
        expect([...DARKNESS_UPGRADES_PATCH_KEYS]).toEqual(['darknessUpgrades']);
    });
});

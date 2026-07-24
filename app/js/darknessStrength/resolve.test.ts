import { describe, expect, it } from 'vitest';
import {
    DS_ENEMY_FIERCE_ID,
    DS_ENEMY_HARDENED_ID,
    DS_SWARM_REINFORCEMENTS_ID,
} from './packages/starters';
import {
    passesDarknessStrengthThresholds,
    resolveActiveDarknessStrengths,
} from './resolve';
import { getDarknessStrength } from './registry';

describe('resolveActiveDarknessStrengths', () => {
    it('returns campaign instances that have registry defs', () => {
        const active = resolveActiveDarknessStrengths({
            instances: [
                { packageId: DS_ENEMY_HARDENED_ID, data: { battlesRemaining: 3 } },
                { packageId: 'unknown_package' },
            ],
        });
        expect(active).toHaveLength(1);
        expect(active[0].packageId).toBe(DS_ENEMY_HARDENED_ID);
        expect(active[0].def).toBe(getDarknessStrength(DS_ENEMY_HARDENED_ID));
        expect(active[0].data).toEqual({ battlesRemaining: 3 });
    });

    it('force-enables a package missing from instances', () => {
        const active = resolveActiveDarknessStrengths({
            instances: [],
            overrides: {
                [DS_ENEMY_FIERCE_ID]: { enabled: true },
            },
        });
        expect(active.map((a) => a.packageId)).toEqual([DS_ENEMY_FIERCE_ID]);
        expect(active[0].def.packageId).toBe(DS_ENEMY_FIERCE_ID);
        expect(active[0].data).toBeUndefined();
    });

    it('force-disables an otherwise active package', () => {
        const active = resolveActiveDarknessStrengths({
            instances: [
                { packageId: DS_ENEMY_HARDENED_ID },
                { packageId: DS_SWARM_REINFORCEMENTS_ID },
            ],
            overrides: {
                [DS_ENEMY_HARDENED_ID]: { enabled: false },
            },
        });
        expect(active.map((a) => a.packageId)).toEqual([DS_SWARM_REINFORCEMENTS_ID]);
    });

    it('override data wins for that resolve', () => {
        const active = resolveActiveDarknessStrengths({
            instances: [{ packageId: DS_ENEMY_HARDENED_ID, data: { battlesRemaining: 10 } }],
            overrides: {
                [DS_ENEMY_HARDENED_ID]: {
                    enabled: true,
                    data: { battlesRemaining: 1, testFlag: true },
                },
            },
        });
        expect(active).toHaveLength(1);
        expect(active[0].data).toEqual({ battlesRemaining: 1, testFlag: true });
    });

    it('includes region domain and mission package ids when not already instanced', () => {
        const active = resolveActiveDarknessStrengths({
            instances: [],
            regionId: 'ash_wastes',
            regions: {
                ash_wastes: { activeDomainPackageIds: [DS_ENEMY_HARDENED_ID] },
            },
            missionPackageIds: [DS_SWARM_REINFORCEMENTS_ID],
        });
        expect(active.map((a) => a.packageId).sort()).toEqual(
            [DS_ENEMY_HARDENED_ID, DS_SWARM_REINFORCEMENTS_ID].sort(),
        );
    });

    it('drops packages whose data.battlesRemaining is <= 0 (threshold hook)', () => {
        const active = resolveActiveDarknessStrengths({
            instances: [
                { packageId: DS_ENEMY_HARDENED_ID, data: { battlesRemaining: 0 } },
                { packageId: DS_ENEMY_FIERCE_ID, data: { battlesRemaining: 2 } },
            ],
        });
        expect(active.map((a) => a.packageId)).toEqual([DS_ENEMY_FIERCE_ID]);
    });
});

describe('passesDarknessStrengthThresholds', () => {
    it('passes when no battlesRemaining counter is supplied', () => {
        const def = getDarknessStrength(DS_ENEMY_HARDENED_ID)!;
        expect(passesDarknessStrengthThresholds(def)).toBe(true);
        expect(passesDarknessStrengthThresholds(def, {})).toBe(true);
    });

    it('fails only when battlesRemaining is a number <= 0', () => {
        const def = getDarknessStrength(DS_ENEMY_HARDENED_ID)!;
        expect(passesDarknessStrengthThresholds(def, { battlesRemaining: 1 })).toBe(true);
        expect(passesDarknessStrengthThresholds(def, { battlesRemaining: 0 })).toBe(false);
        expect(passesDarknessStrengthThresholds(def, { battlesRemaining: -1 })).toBe(false);
    });
});

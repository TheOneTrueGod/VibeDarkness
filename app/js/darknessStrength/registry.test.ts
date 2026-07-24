import { describe, expect, it } from 'vitest';
import { DescriptiveValue } from '../researchTrees/descriptiveValue';
import { PassiveStatKey } from '../researchTrees/types';
import { getDarknessStrength, listDarknessStrengths } from './registry';
import {
    DS_ENEMY_FIERCE_ALL_DAMAGE_MULT,
    DS_ENEMY_FIERCE_ID,
    DS_ENEMY_HARDENED_ID,
    DS_ENEMY_HARDENED_MAX_HEALTH_MULT,
    DS_SWARM_REINFORCEMENTS_CHARACTER_ID,
    DS_SWARM_REINFORCEMENTS_COUNT,
    DS_SWARM_REINFORCEMENTS_ID,
    DS_SWARM_REINFORCEMENTS_SPAWN_BEHAVIOUR,
} from './packages/starters';

describe('darknessStrength registry', () => {
    it('lists the three starter packages in registration order', () => {
        const list = listDarknessStrengths();
        expect(list.map((d) => d.packageId)).toEqual([
            DS_ENEMY_HARDENED_ID,
            DS_ENEMY_FIERCE_ID,
            DS_SWARM_REINFORCEMENTS_ID,
        ]);
        expect(list.every((d) => d.lane === 'darkness')).toBe(true);
    });

    it('getDarknessStrength returns def or undefined', () => {
        expect(getDarknessStrength(DS_ENEMY_HARDENED_ID)?.name).toBe('Hardened Foes');
        expect(getDarknessStrength('missing_package')).toBeUndefined();
    });

    it('ds_enemy_hardened compiles enemy maxHealth Medium mult', () => {
        const def = getDarknessStrength(DS_ENEMY_HARDENED_ID)!;
        expect(def.description).toContain(DescriptiveValue.Medium);
        expect(def.compile).toEqual([
            {
                type: 'statBag',
                target: 'enemy',
                bonuses: {
                    [PassiveStatKey.MaxHealth]: { mult: DS_ENEMY_HARDENED_MAX_HEALTH_MULT },
                },
            },
        ]);
        expect(DS_ENEMY_HARDENED_MAX_HEALTH_MULT).toBe(1.3);
    });

    it('ds_enemy_fierce compiles enemy all_damage Small mult', () => {
        const def = getDarknessStrength(DS_ENEMY_FIERCE_ID)!;
        expect(def.description).toContain(DescriptiveValue.Small);
        expect(def.compile).toEqual([
            {
                type: 'statBag',
                target: 'enemy',
                bonuses: {
                    [PassiveStatKey.AllDamage]: { mult: DS_ENEMY_FIERCE_ALL_DAMAGE_MULT },
                },
            },
        ]);
        expect(DS_ENEMY_FIERCE_ALL_DAMAGE_MULT).toBe(1.2);
    });

    it('ds_swarm_reinforcements compiles every-round edgeOfMap swarmling spawn', () => {
        const def = getDarknessStrength(DS_SWARM_REINFORCEMENTS_ID)!;
        expect(def.compile).toEqual([
            {
                type: 'spawnTweak',
                everyRound: true,
                characterId: DS_SWARM_REINFORCEMENTS_CHARACTER_ID,
                count: DS_SWARM_REINFORCEMENTS_COUNT,
                spawnBehaviour: DS_SWARM_REINFORCEMENTS_SPAWN_BEHAVIOUR,
            },
        ]);
        expect(DS_SWARM_REINFORCEMENTS_SPAWN_BEHAVIOUR).toBe('edgeOfMap');
    });
});

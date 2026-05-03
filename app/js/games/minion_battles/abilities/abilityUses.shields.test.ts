import { describe, it, expect } from 'vitest';
import { getAbilityUseConfig } from './abilityUses';

describe('shield ability use configs', () => {
    it.each([
        ['0104', 'Raise Shield'],
        ['0106', 'Laser Shield'],
        ['0110', 'Shining Block'],
        ['0113', 'Absorption Shield'],
    ] as const)('gives %s (%s) three max uses (base + two extra)', (id) => {
        expect(getAbilityUseConfig(id).maxUses).toBe(3);
    });
});

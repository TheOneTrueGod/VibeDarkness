import { describe, expect, it } from 'vitest';
import { MISSION_MAP_DISABLED } from '../../types';
import { CRYSTAL_CORRUPTION } from './004b_crystal_corruption';

describe('CrystalCorruptionMission', () => {
    it('is disabled on the mission map for non-admins', () => {
        expect(CRYSTAL_CORRUPTION.disabled).toBe(MISSION_MAP_DISABLED);
    });
});

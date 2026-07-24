import { describe, expect, it } from 'vitest';
import { UnitTag } from '../games/minion_battles/game/units/unitTag';
import { matchesUnitFilter } from './unitFilter';

describe('matchesUnitFilter', () => {
    it('matches everything when filter is empty or missing', () => {
        const subject = { characterId: 'swarmling', creatureType: 'dark_creature' as const };
        expect(matchesUnitFilter(subject, undefined)).toBe(true);
        expect(matchesUnitFilter(subject, null)).toBe(true);
        expect(matchesUnitFilter(subject, {})).toBe(true);
    });

    it('requires characterId when set', () => {
        const subject = { characterId: 'swarmling' };
        expect(matchesUnitFilter(subject, { characterId: 'swarmling' })).toBe(true);
        expect(matchesUnitFilter(subject, { characterId: 'slime' })).toBe(false);
    });

    it('requires creatureType when set (explicit or def lookup)', () => {
        expect(
            matchesUnitFilter(
                { characterId: 'swarmling', creatureType: 'dark_creature' },
                { creatureType: 'dark_creature' },
            ),
        ).toBe(true);
        expect(
            matchesUnitFilter(
                { characterId: 'swarmling', creatureType: 'dark_creature' },
                { creatureType: 'beast' },
            ),
        ).toBe(false);
        // swarmling is dark_creature in UNIT_DEFS — lookup when creatureType omitted on subject
        expect(matchesUnitFilter({ characterId: 'swarmling' }, { creatureType: 'dark_creature' })).toBe(
            true,
        );
    });

    it('requires all listed tags (AND) from subject or static def tags', () => {
        expect(
            matchesUnitFilter(
                { characterId: 'x', tags: [UnitTag.Boss, UnitTag.Structure] },
                { tags: [UnitTag.Boss] },
            ),
        ).toBe(true);
        expect(
            matchesUnitFilter(
                { characterId: 'x', tags: [UnitTag.Boss] },
                { tags: [UnitTag.Boss, UnitTag.Structure] },
            ),
        ).toBe(false);
        // lanternite_nest / swarm_nest carry Structure on the unit def
        expect(
            matchesUnitFilter({ characterId: 'swarm_nest' }, { tags: [UnitTag.Structure] }),
        ).toBe(true);
    });

    it('ANDs characterId, creatureType, and tags together', () => {
        const subject = {
            characterId: 'swarmling',
            creatureType: 'dark_creature' as const,
            tags: [UnitTag.Boss],
        };
        expect(
            matchesUnitFilter(subject, {
                characterId: 'swarmling',
                creatureType: 'dark_creature',
                tags: [UnitTag.Boss],
            }),
        ).toBe(true);
        expect(
            matchesUnitFilter(subject, {
                characterId: 'swarmling',
                creatureType: 'beast',
                tags: [UnitTag.Boss],
            }),
        ).toBe(false);
    });
});

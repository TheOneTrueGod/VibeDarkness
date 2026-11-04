/**
 * CrowdSpacingManager contacts: each tick's overlapping pairs are recorded as "bumps" (both
 * directions) and reset on the next tick.
 */
import { describe, expect, it } from 'vitest';
import { Unit } from '../units/Unit';
import { CrowdSpacingManager } from './CrowdSpacingManager';

function makeUnit(id: string, x: number, y: number): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        speed: 40,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'alpha_wolf',
        name: id,
        radius: 20,
        abilities: [],
    });
}

describe('CrowdSpacingManager contacts', () => {
    it('records overlapping units as contacts of each other, and nothing for loners', () => {
        const a = makeUnit('a', 100, 100);
        const b = makeUnit('b', 110, 100);
        const loner = makeUnit('loner', 900, 900);
        const manager = new CrowdSpacingManager();
        manager.tick([a, b, loner], null);

        expect(manager.getContacts('a')).toEqual(['b']);
        expect(manager.getContacts('b')).toEqual(['a']);
        expect(manager.getContacts('loner')).toEqual([]);
    });

    it('forgets last tick contacts once the units no longer overlap', () => {
        const a = makeUnit('a', 100, 100);
        const b = makeUnit('b', 110, 100);
        const manager = new CrowdSpacingManager();
        manager.tick([a, b], null);
        b.x = 600;
        manager.tick([a, b], null);
        expect(manager.getContacts('a')).toEqual([]);
    });
});

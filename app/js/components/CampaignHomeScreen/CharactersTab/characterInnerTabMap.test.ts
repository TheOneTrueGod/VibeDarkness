import { describe, expect, it } from 'vitest';
import {
    editorTabFromInner,
    innerTabFromEditor,
    innerTabShowsChangeCharacters,
    innerTabShowsPortrait,
} from './characterInnerTabMap';

describe('characterInnerTabMap', () => {
    it('round-trips editor tabs through URL slugs', () => {
        expect(editorTabFromInner('map')).toBe('missionMap');
        expect(editorTabFromInner('upgrades')).toBe('research');
        expect(editorTabFromInner('bonuses')).toBe('statBonuses');
        expect(editorTabFromInner('equipment')).toBe('equipment');
        expect(innerTabFromEditor('missionMap')).toBe('map');
        expect(innerTabFromEditor('research')).toBe('upgrades');
        expect(innerTabFromEditor('statBonuses')).toBe('bonuses');
        expect(innerTabFromEditor('equipment')).toBe('equipment');
    });

    it('shows Change Characters and portrait on the expected tabs', () => {
        expect(innerTabShowsChangeCharacters('map')).toBe(true);
        expect(innerTabShowsChangeCharacters('upgrades')).toBe(true);
        expect(innerTabShowsChangeCharacters('bonuses')).toBe(true);
        expect(innerTabShowsChangeCharacters('equipment')).toBe(true);
        expect(innerTabShowsPortrait('map')).toBe(true);
        expect(innerTabShowsPortrait('upgrades')).toBe(false);
        expect(innerTabShowsPortrait('bonuses')).toBe(true);
    });
});

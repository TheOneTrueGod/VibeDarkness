import { describe, expect, it } from 'vitest';
import { getLocationCardPillView } from './locationCardPillView';
import type { LocationCardInstance } from '../../storylines/locationCards';

describe('getLocationCardPillView', () => {
    it('returns display data for a known card id', () => {
        const view = getLocationCardPillView(1);
        expect(view).not.toBeNull();
        expect(view?.name).toBe('Found Berries');
        expect(view?.description).toContain('thicket laden with ripe berries');
        expect(view?.flavourText).toContain('Enough to matter');
        expect(view?.modifications).toEqual([]);
    });

    it('includes capitalized tags from the card definition', () => {
        const view = getLocationCardPillView(1);
        expect(view?.tags).toEqual(['Plains', 'Foraging']);
    });

    it('card 2 has Plains and Mining tags', () => {
        const view = getLocationCardPillView(2);
        expect(view?.tags).toEqual(['Plains', 'Mining']);
    });

    it('returns null for an unknown card id', () => {
        const view = getLocationCardPillView(999);
        expect(view).toBeNull();
    });

    it('applies displayNameOverride from instance', () => {
        const instance: LocationCardInstance = {
            instanceId: 'inst-1',
            location_card_id: 1,
            displayNameOverride: 'Premium Berries',
            modifications: [],
        };
        const view = getLocationCardPillView(1, instance);
        expect(view?.name).toBe('Premium Berries');
    });

    it('includes modifications from instance', () => {
        const instance: LocationCardInstance = {
            instanceId: 'inst-1',
            location_card_id: 2,
            modifications: [
                {
                    type: 'add_reward',
                    slot: 1,
                    reward_id: 4,
                },
            ],
        };
        const view = getLocationCardPillView(2, instance);
        expect(view?.modifications).toHaveLength(1);
        expect(view?.modifications[0]).toContain('Option 1');
        expect(view?.modifications[0]).toContain('Healing poultice');
    });

    it('handles multiple modifications', () => {
        const instance: LocationCardInstance = {
            instanceId: 'inst-1',
            location_card_id: 1,
            modifications: [
                { type: 'add_reward', slot: 0, reward_id: 4 },
                { type: 'add_reward', slot: 1, reward_id: 4 },
            ],
        };
        const view = getLocationCardPillView(1, instance);
        expect(view?.modifications).toHaveLength(2);
    });

    it('gracefully handles unknown reward ids in modifications', () => {
        const instance: LocationCardInstance = {
            instanceId: 'inst-1',
            location_card_id: 1,
            modifications: [
                { type: 'add_reward', slot: 0, reward_id: 999 },
            ],
        };
        const view = getLocationCardPillView(1, instance);
        expect(view?.modifications[0]).toContain('Option 0');
        expect(view?.modifications[0]).toContain('Unknown option');
    });
});

import { describe, expect, it } from 'vitest';
import {
    HUNGER_BLACK,
    HUNGER_ORANGE,
    campaignResourceGains,
    hungerPillStyle,
    RESOURCE_PILL_SIZE_CLASS,
    RESOURCE_PILL_SIZE_DEFAULT,
    RESOURCE_PILL_SIZE_MEDIUM,
    RESOURCE_PILL_SIZE_SMALL,
} from './ResourcePill';

describe('RESOURCE_PILL_SIZE_CLASS', () => {
    it('defines a medium size between small and default', () => {
        expect(RESOURCE_PILL_SIZE_MEDIUM).toBe('medium');
        expect(RESOURCE_PILL_SIZE_CLASS[RESOURCE_PILL_SIZE_SMALL].pill).toContain('text-[10px]');
        expect(RESOURCE_PILL_SIZE_CLASS[RESOURCE_PILL_SIZE_MEDIUM].pill).toContain('text-[11px]');
        expect(RESOURCE_PILL_SIZE_CLASS[RESOURCE_PILL_SIZE_DEFAULT].pill).toContain('text-[13px]');
    });
});

describe("hunger pills", () => {
    it("recovery is solid orange with black text, loss is black with orange text", () => {
        expect(hungerPillStyle(20)).toMatchObject({ backgroundColor: HUNGER_ORANGE, textColor: HUNGER_BLACK });
        expect(hungerPillStyle(-12)).toMatchObject({ backgroundColor: HUNGER_BLACK, textColor: HUNGER_ORANGE });
        expect(hungerPillStyle(50, true)).toMatchObject({ backgroundColor: HUNGER_BLACK, textColor: HUNGER_ORANGE });
    });

    it("campaignResourceGains lists negative hunger but not other negatives", () => {
        expect(campaignResourceGains({ hunger: -5, vigor: -2, metal: 3 })).toEqual([
            { resource: "metal", count: 3 },
            { resource: "hunger", count: -5 },
        ]);
    });
});

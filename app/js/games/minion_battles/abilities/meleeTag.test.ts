import { describe, expect, it } from 'vitest';
import { abilityHasTag, getAbilityTagsForId } from './Ability';
import './AbilityRegistry';
import '../card_defs';

/** Player melee weapons eligible as "Combos to melee" follow-ups. */
const MELEE_IDS = [
    '0103', '0105', '0111', '0112', '0115', '0116', '0117', '0118', '0119', '0120', '0524', '0803', '0611',
];
/** Enemy-only strikes and non-weapon melee-like abilities that must NOT carry the tag. */
const NOT_MELEE_IDS = ['0004', '0018', '0526', '0016', '0534', '0121', '0801', '0805', '0806'];

describe('melee AbilityTag', () => {
    it.each(MELEE_IDS)('ability %s carries melee', (id) => {
        expect(getAbilityTagsForId(id)).toContain('melee');
        expect(abilityHasTag(id, 'melee')).toBe(true);
    });

    it.each(NOT_MELEE_IDS)('ability %s does not carry melee', (id) => {
        expect(abilityHasTag(id, 'melee')).toBe(false);
    });
});

import { describe, expect, it } from 'vitest';
import {
    getBestiaryFaction,
    getBestiaryUnitIds,
    getEnemyUnitDefIds,
    getUnitDefEntry,
} from './unitDef';
import { UNIT_SPRITE_URLS } from './unitSprites';
import { getAbility } from '../../../abilities/AbilityRegistry';

describe('unit def registry completeness', () => {
    const ids = getEnemyUnitDefIds();

    it('lists the enemy defs', () => {
        expect(ids.length).toBeGreaterThan(0);
        expect(ids).not.toContain('player');
    });

    it.each(ids)('%s has a sprite and a display name', (id) => {
        const def = getUnitDefEntry(id)!;
        expect(def.sprite, `${id} needs UnitDefEntry.sprite`).toBeTruthy();
        expect(def.displayName, `${id} needs UnitDefEntry.displayName`).toBeTruthy();
    });

    it.each(ids)('%s has a Bestiary entry unless hidden', (id) => {
        const def = getUnitDefEntry(id)!;
        expect(def.bestiary, `${id} needs bestiary: { abilityIds } or { hidden: true }`).toBeDefined();
        if (!def.bestiary!.hidden) expect(getBestiaryUnitIds()).toContain(id);
    });

    it.each(ids)('%s uses a known character sprite key', (id) => {
        const key = getUnitDefEntry(id)!.characterSpriteKey;
        expect(key, `${id} needs characterSpriteKey`).toBeTruthy();
        expect(Object.keys(UNIT_SPRITE_URLS)).toContain(key);
    });

    it('Bestiary ability ids are registered abilities', () => {
        for (const id of getBestiaryUnitIds()) {
            for (const abilityId of getUnitDefEntry(id)!.bestiary!.abilityIds) {
                expect(getAbility(abilityId), `${id}: ability ${abilityId}`).toBeDefined();
            }
        }
    });

    it('derives Bestiary factions from creatureType', () => {
        expect(getBestiaryFaction('slime')).toBe('dark_creature');
        expect(getBestiaryFaction('dog')).toBe('beast');
        expect(getBestiaryFaction('lanternite')).toBe('beast');
        expect(getBestiaryFaction('boar')).toBe('other');
    });
});

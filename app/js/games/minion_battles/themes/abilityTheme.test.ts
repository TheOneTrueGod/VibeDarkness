import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_SHADE_FACTOR, getAbilityTheme, getThemeById } from './abilityTheme';
import { ABILITY_GROUP_THEMES } from './abilityThemes';
import { darkenCssHex } from './colorUtils';
import { AbilityGroupId } from '../card_defs/AbilityGroupId';
import {
    ARMORY_FONT_COLOR,
    ARMORY_PRIMARY_COLOR,
    ARMORY_PRIMARY_COLOR_NUM,
    ARMORY_PRIMARY_SHADE_COLOR,
    ARMORY_PRIMARY_SHADE_COLOR_NUM,
    ARMORY_SECONDARY_COLOR,
    ARMORY_SECONDARY_COLOR_NUM,
} from '../card_defs/10_armory_core/armoryConstants';

describe('ability themes', () => {
    it('resolves an Armory ability to Quench', () => {
        const theme = getAbilityTheme('1008');
        expect(theme.id).toBe('armory');
        expect(theme.primary).toBe('#4f6d8c');
        expect(theme.secondary).toBe('#e7e5e4');
        expect(theme.shade).toBe('#2b3c4d');
        expect(theme.font).toBe('#000000');
        expect(theme.primaryNum).toBe(0x4f6d8c);
        expect(theme.secondaryNum).toBe(0xe7e5e4);
        expect(theme.shadeNum).toBe(0x2b3c4d);
        expect(theme.fontNum).toBe(0x000000);

        expect(ARMORY_PRIMARY_COLOR).toBe(theme.primary);
        expect(ARMORY_SECONDARY_COLOR).toBe(theme.secondary);
        expect(ARMORY_PRIMARY_SHADE_COLOR).toBe(theme.shade);
        expect(ARMORY_FONT_COLOR).toBe(theme.font);
        expect(ARMORY_PRIMARY_COLOR_NUM).toBe(theme.primaryNum);
        expect(ARMORY_SECONDARY_COLOR_NUM).toBe(theme.secondaryNum);
        expect(ARMORY_PRIMARY_SHADE_COLOR_NUM).toBe(theme.shadeNum);
    });

    it('falls back for a primary-only theme', () => {
        const theme = getAbilityTheme('0902');
        expect(theme.id).toBe('gravity');
        expect(theme.primary).toBe('#a855f7');
        expect(theme.secondary).toBe(theme.primary);
        expect(theme.secondaryNum).toBe(theme.primaryNum);
        expect(theme.shade).toBe(darkenCssHex('#a855f7', DEFAULT_THEME_SHADE_FACTOR));
        expect(theme.font).toBeUndefined();
        expect(theme.fontNum).toBeUndefined();
    });

    it('returns generic for groups without a theme and non-numeric ids', () => {
        expect(getAbilityTheme('9999').id).toBe('generic');
        expect(getAbilityTheme('abc').id).toBe('generic');
        expect(getAbilityTheme('0101').id).toBe('generic');
        expect(getThemeById('no_such_theme').id).toBe('generic');
    });

    it('resolves a Water ability to Tidewater', () => {
        const theme = getAbilityTheme('1501');
        expect(theme.id).toBe('water');
        expect(theme.primary).toBe('#1e3a8a');
        expect(theme.secondary).toBe('#5eead4');
        expect(theme.font).toBe('#0b1a3a');
        expect(theme.shade).toBe(darkenCssHex('#1e3a8a', 0.5));
        expect(getThemeById('water')).toBe(theme);
    });

    it('looks up by id the same as by group, and caches', () => {
        expect(getThemeById('armory')).toBe(getAbilityTheme('1008'));
        expect(getThemeById('armory')).toEqual(getAbilityTheme('1001'));
    });

    it('keys group themes by AbilityGroupId values', () => {
        expect(ABILITY_GROUP_THEMES[AbilityGroupId.Armory]?.id).toBe('armory');
        expect(ABILITY_GROUP_THEMES[AbilityGroupId.Earth]?.id).toBe('earth');
        expect(ABILITY_GROUP_THEMES[AbilityGroupId.Light]?.id).toBe('light');
        expect(ABILITY_GROUP_THEMES[AbilityGroupId.Gravity]?.id).toBe('gravity');
        expect(ABILITY_GROUP_THEMES[AbilityGroupId.Command]?.id).toBe('command');
        expect(ABILITY_GROUP_THEMES[AbilityGroupId.Mage]?.id).toBe('blood_mage');
        expect(ABILITY_GROUP_THEMES[AbilityGroupId.Storm]?.id).toBe('storm');
        expect(ABILITY_GROUP_THEMES[AbilityGroupId.EnemyCourtMagician]?.id).toBe('court_magic');
        expect(ABILITY_GROUP_THEMES[AbilityGroupId.Water]?.id).toBe('water');
        for (const g of [AbilityGroupId.Enemy, AbilityGroupId.Warrior, AbilityGroupId.Ranger, AbilityGroupId.Healer, AbilityGroupId.Utility]) {
            expect(ABILITY_GROUP_THEMES[g]).toBeUndefined();
        }
    });
});

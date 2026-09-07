import { describe, expect, it } from 'vitest';
import type { WorldModifierDef } from '../../worldModifiers/types';
import type { NinjutsuUIState } from '../../game/ninjutsu/NinjutsuManager';
import { getVisibleWorldModifierHud, hasVisibleWorldModifierHud } from './WorldModifiersPanel';

const PLAYER_MODIFIER: WorldModifierDef = {
    id: 'player_mod',
    name: 'Player Mod',
    description: 'Visible to everyone',
    icon: '',
};

const ADMIN_MODIFIER: WorldModifierDef = {
    id: 'admin_mod',
    name: 'Admin Mod',
    description: 'Admin only',
    icon: '',
    visible_to_admin_only: true,
};

const ENABLED_NINJUTSU_POOL: NinjutsuUIState = {
    type: 'shadow',
    current: 2,
    max: 5,
    enabled: true,
};

const DISABLED_NINJUTSU_POOL: NinjutsuUIState = {
    type: 'shadow',
    current: 0,
    max: 5,
    enabled: false,
};

describe('getVisibleWorldModifierHud', () => {
    it('shows player modifiers to everyone and hides admin-only modifiers from non-admins', () => {
        const { visibleModifiers, enabledPools } = getVisibleWorldModifierHud(
            [PLAYER_MODIFIER, ADMIN_MODIFIER],
            [ENABLED_NINJUTSU_POOL],
            false,
        );
        expect(visibleModifiers).toEqual([PLAYER_MODIFIER]);
        expect(enabledPools).toEqual([]);
    });

    it('shows admin-only modifiers and enabled ninjutsu pools to admins', () => {
        const { visibleModifiers, enabledPools } = getVisibleWorldModifierHud(
            [PLAYER_MODIFIER, ADMIN_MODIFIER],
            [ENABLED_NINJUTSU_POOL, DISABLED_NINJUTSU_POOL],
            true,
        );
        expect(visibleModifiers).toEqual([PLAYER_MODIFIER, ADMIN_MODIFIER]);
        expect(enabledPools).toEqual([ENABLED_NINJUTSU_POOL]);
    });
});

describe('hasVisibleWorldModifierHud', () => {
    it('is false for non-admins when only admin-only chips exist', () => {
        expect(hasVisibleWorldModifierHud([ADMIN_MODIFIER], [DISABLED_NINJUTSU_POOL], false)).toBe(
            false,
        );
    });

    it('is true when a player-visible modifier exists', () => {
        expect(hasVisibleWorldModifierHud([PLAYER_MODIFIER], null, false)).toBe(true);
    });
});

import { describe, expect, it } from 'vitest';
import './AbilityRegistry';
import { getAbility } from './AbilityRegistry';
import { getAbilityTooltipLines, REQUIRES_FREE_SPIRIT_TOOLTIP_LINE } from './abilityTooltipLines';
import { SicEmAbility } from '../card_defs/07_command_core/0704_SicEm/0704Ability';
import { BramblePatchCommandAbility_0707 } from '../card_defs/07_command_core/0707_BramblePatchCommand/0707Ability';
import { SPIRIT_STORM_ABILITY_ID } from '../card_defs/07_command_core/0713_SpiritStorm/0713Ability';
import { FLING_THORN_COMMAND_ID } from '../card_defs/07_command_core/0714_FlingThornCommand/0714Ability';
import { ORDER_MOVE_ABILITY_ID } from '../card_defs/07_command_core/0709_OrderMove/0709Ability';

describe('getAbilityTooltipLines', () => {
    it.each([SicEmAbility.id, BramblePatchCommandAbility_0707.id, SPIRIT_STORM_ABILITY_ID, FLING_THORN_COMMAND_ID])(
        'appends the free-spirit line for requireFree ability %s',
        (id) => {
            const ability = getAbility(id)!;
            const lines = getAbilityTooltipLines(ability);
            expect(lines.slice(0, -1)).toEqual(ability.getTooltipText());
            expect(lines[lines.length - 1]).toBe(REQUIRES_FREE_SPIRIT_TOOLTIP_LINE);
        },
    );

    it('adds nothing for Order: Move', () => {
        const ability = getAbility(ORDER_MOVE_ABILITY_ID)!;
        expect(getAbilityTooltipLines(ability)).toEqual(ability.getTooltipText());
        expect(getAbilityTooltipLines(ability)).not.toContain(REQUIRES_FREE_SPIRIT_TOOLTIP_LINE);
    });
});

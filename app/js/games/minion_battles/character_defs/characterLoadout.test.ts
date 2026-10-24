import { describe, expect, it } from 'vitest';
import { activeResearchByPlayer, activeResearchNodeLevelsByPlayer, resolveCharacterLoadout } from './characterLoadout';

const BASIC_CORE = '004';
const EARTH_CORE = '019';
const ROCKS = '001';
const STICK = '002';
const CHARGED_ROCKS = '011';
const MACE = '014';
const CHARGED_SHIELD = '016';

describe('resolveCharacterLoadout', () => {
    it("Chip's case: Charged Rocks equipped with stored stick research gives charged rock and no stick", () => {
        const { abilityIds, activeResearchTrees } = resolveCharacterLoadout([BASIC_CORE, CHARGED_ROCKS], {
            weapons: ['swing_stick', 'pipe_bat_damage'],
        });
        expect(abilityIds).toContain('throw_charged_rock');
        expect(abilityIds).not.toContain('throw_rock');
        expect(abilityIds).not.toContain('0103');
        expect(activeResearchTrees.weapons).toEqual(['throw_charged_rock']);
    });

    it('Stick equipped with stored rocks research gives 0103 and no rock throw', () => {
        const { abilityIds } = resolveCharacterLoadout([BASIC_CORE, STICK], {
            weapons: ['throw_rock', 'more_power'],
        });
        expect(abilityIds).toContain('0103');
        expect(abilityIds).not.toContain('throw_rock');
        expect(abilityIds).not.toContain('throw_charged_rock');
    });

    it('Earth Core + Charged Rocks gives throw_charged_rock, not earth_core_throw_rock', () => {
        const { abilityIds } = resolveCharacterLoadout([EARTH_CORE, CHARGED_ROCKS], {
            earth: ['earth_core'],
        });
        expect(abilityIds).toContain('throw_charged_rock');
        expect(abilityIds).not.toContain('earth_core_throw_rock');
        expect(abilityIds).not.toContain('throw_rock');
    });

    it('Earth Core + Stick gives no rock throw', () => {
        const { abilityIds } = resolveCharacterLoadout([EARTH_CORE, STICK], { earth: ['earth_core'] });
        expect(abilityIds).toContain('0103');
        expect(abilityIds).not.toContain('throw_rock');
        expect(abilityIds).not.toContain('earth_core_throw_rock');
    });

    it('Earth Core alone (no weapon) gives no rock throw', () => {
        const { abilityIds } = resolveCharacterLoadout([EARTH_CORE], {});
        expect(abilityIds).not.toContain('throw_rock');
        expect(abilityIds).not.toContain('earth_core_throw_rock');
    });

    it('Earth Core + Rocks with no crystal research gives earth_core_throw_rock', () => {
        const { abilityIds } = resolveCharacterLoadout([EARTH_CORE, ROCKS], { earth: ['earth_core'] });
        expect(abilityIds).toContain('earth_core_throw_rock');
        expect(abilityIds).not.toContain('throw_rock');
    });

    it('Charged Shield item gives 0113 plus 0121 instead of 0104 / 0110', () => {
        const { abilityIds } = resolveCharacterLoadout([BASIC_CORE, CHARGED_SHIELD], {});
        expect(abilityIds).toContain('0113');
        expect(abilityIds).toContain('0121');
        expect(abilityIds).not.toContain('0104');
        expect(abilityIds).not.toContain('0110');
    });

    it('Mace item gives 0115 instead of 0103', () => {
        const { abilityIds } = resolveCharacterLoadout([BASIC_CORE, MACE], {});
        expect(abilityIds).toContain('0115');
        expect(abilityIds).not.toContain('0103');
    });

    it('falls back to the basic abilities when equipment is empty', () => {
        expect(resolveCharacterLoadout([], {}).abilityIds).toEqual(['0101', '0120']);
    });

    it('does not mutate the stored research input', () => {
        const stored = { weapons: ['throw_rock', 'more_power'] };
        resolveCharacterLoadout([BASIC_CORE, STICK], stored);
        expect(stored).toEqual({ weapons: ['throw_rock', 'more_power'] });
    });
});

describe('activeResearchByPlayer', () => {
    const equipment = { p1: [BASIC_CORE, STICK], p2: [BASIC_CORE, CHARGED_ROCKS] };
    const research = {
        p1: { weapons: ['throw_rock', 'more_power'], earth: ['x'] },
        p2: { weapons: ['more_power'] },
    };

    it('drops More Power for a player with the Stick equipped and adds the virtual root', () => {
        const out = activeResearchByPlayer(equipment, research);
        expect(out.p1.weapons).toEqual(['swing_stick']);
        expect(out.p1.earth).toEqual(['x']);
        expect(out.p2.weapons).toEqual(expect.arrayContaining(['more_power', 'throw_charged_rock']));
    });

    it('is idempotent', () => {
        const once = activeResearchByPlayer(equipment, research);
        expect(activeResearchByPlayer(equipment, once)).toEqual(once);
    });

    it('filters node levels of inactive weapon nodes', () => {
        const levels = { p1: { weapons: { more_power: 2 }, earth: { x: 1 } } };
        const out = activeResearchNodeLevelsByPlayer(equipment, levels);
        expect(out.p1.weapons).toEqual({});
        expect(out.p1.earth).toEqual({ x: 1 });
        expect(activeResearchNodeLevelsByPlayer(equipment, out)).toEqual(out);
    });
});

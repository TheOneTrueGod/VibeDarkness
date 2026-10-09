import { describe, expect, it } from 'vitest';
import { activeResearchByPlayer, activeResearchNodeLevelsByPlayer, resolveCharacterLoadout } from './characterLoadout';

const BASIC_CORE = '004';
const EARTH_CORE = '019';
const ROCKS = '001';
const STICK = '002';
const POT_LID = '003';

describe('resolveCharacterLoadout', () => {
    it("Chip's case: Rocks equipped with stored crystal + stick research gives charged rock and no stick", () => {
        const { abilityIds, activeResearchTrees } = resolveCharacterLoadout([BASIC_CORE, ROCKS], {
            crystal_rocks: ['throw_rock', 'charged_rocks'],
            stick_sword: ['swing_stick'],
        });
        expect(abilityIds).toContain('throw_charged_rock');
        expect(abilityIds).not.toContain('throw_rock');
        expect(abilityIds).not.toContain('0103');
        expect(activeResearchTrees.stick_sword).toBeUndefined();
    });

    it('Stick equipped with stored crystal research gives 0103 and no rock throw', () => {
        const { abilityIds } = resolveCharacterLoadout([BASIC_CORE, STICK], {
            crystal_rocks: ['throw_rock', 'charged_rocks'],
        });
        expect(abilityIds).toContain('0103');
        expect(abilityIds).not.toContain('throw_rock');
        expect(abilityIds).not.toContain('throw_charged_rock');
    });

    it('Earth Core + Rocks + charged_rocks gives throw_charged_rock, not earth_core_throw_rock', () => {
        const { abilityIds } = resolveCharacterLoadout([EARTH_CORE, ROCKS], {
            earth: ['earth_core'],
            crystal_rocks: ['throw_rock', 'charged_rocks'],
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

    it('shield chain 0104 -> 0110 -> 0113 plus 0121', () => {
        const { abilityIds } = resolveCharacterLoadout([BASIC_CORE, POT_LID], {
            tech_shield: ['raise_shield', 'crystal_embedded_shield', 'throwing_crystal_shield'],
        });
        expect(abilityIds).toContain('0113');
        expect(abilityIds).toContain('0121');
        expect(abilityIds).not.toContain('0104');
        expect(abilityIds).not.toContain('0110');
    });

    it('Pipe Bat replaces 0103 with 0115', () => {
        const { abilityIds } = resolveCharacterLoadout([BASIC_CORE, STICK], {
            stick_sword: ['swing_stick', 'pipe_bat'],
        });
        expect(abilityIds).toContain('0115');
        expect(abilityIds).not.toContain('0103');
    });

    it('falls back to the basic abilities when equipment is empty', () => {
        expect(resolveCharacterLoadout([], {}).abilityIds).toEqual(['0101', '0120']);
    });

    it('does not mutate the stored research input', () => {
        const stored = { crystal_rocks: ['charged_rocks'], stick_sword: ['swing_stick'] };
        resolveCharacterLoadout([BASIC_CORE, STICK], stored);
        expect(stored).toEqual({ crystal_rocks: ['charged_rocks'], stick_sword: ['swing_stick'] });
    });
});

describe('activeResearchByPlayer', () => {
    const equipment = { p1: [BASIC_CORE, STICK], p2: [BASIC_CORE, ROCKS] };
    const research = {
        p1: { crystal_rocks: ['throw_rock', 'charged_rocks'], earth: ['x'] },
        p2: { crystal_rocks: ['charged_rocks'] },
    };

    it('drops charged_rocks for a player with the Stick equipped and adds the virtual root', () => {
        const out = activeResearchByPlayer(equipment, research);
        expect(out.p1.crystal_rocks).toBeUndefined();
        expect(out.p1.stick_sword).toContain('swing_stick');
        expect(out.p1.earth).toEqual(['x']);
        expect(out.p2.crystal_rocks).toEqual(expect.arrayContaining(['charged_rocks', 'throw_rock']));
    });

    it('is idempotent', () => {
        const once = activeResearchByPlayer(equipment, research);
        expect(activeResearchByPlayer(equipment, once)).toEqual(once);
    });

    it('filters node levels of inactive bound trees', () => {
        const levels = { p1: { crystal_rocks: { charged_rocks: 2 }, earth: { x: 1 } } };
        const out = activeResearchNodeLevelsByPlayer(equipment, levels);
        expect(out.p1.crystal_rocks).toBeUndefined();
        expect(out.p1.earth).toEqual({ x: 1 });
        expect(activeResearchNodeLevelsByPlayer(equipment, out)).toEqual(out);
    });
});

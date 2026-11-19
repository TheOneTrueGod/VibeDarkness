import { describe, it, expect } from 'vitest';
import { getAbility } from '../abilities/AbilityRegistry';
import {
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../abilities/abilityTimings';
import { getAbilityTooltipLines } from '../abilities/abilityTooltipLines';
import { buildTinyBattleEngine, placePlayerAndDummy, TINY_BATTLE_PLAYER_ID } from '../testing/harness/buildTinyBattleEngine';
import type { AbilityModifier } from '../../../researchTrees/types';

const THROW_ROCK_ABILITY_ID = 'throw_rock';
const THROW_CHARGED_ROCK_ABILITY_ID = 'throw_charged_rock';
const THROW_KNIFE_ABILITY_ID = 'throw_knife';
const COOLDOWN_INTERVAL_ID = 'cooldown';

function setup(abilityId: string, modifier?: AbilityModifier) {
    const engine = buildTinyBattleEngine({
        gridW: 12,
        gridH: 8,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
        grass: true,
    });
    const { player } = placePlayerAndDummy(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        playerWorld: { x: 120, y: 160 },
        dummyWorld: { x: 280, y: 160 },
        abilities: [abilityId],
    });
    if (modifier) player.abilityModifiers = { [abilityId]: modifier };
    const ability = getAbility(abilityId)!;
    const intervals = normalizeAbilityTimingsToIntervals(resolveAbilityTimingEntries(ability, player, engine));
    return { engine, player, ability, intervals };
}

type Intervals = ReturnType<typeof normalizeAbilityTimingsToIntervals>;
type Setup = ReturnType<typeof setup>;

/** The cancel point right before the (possibly tail-split) cooldown, if any interval there has one. */
function cancelBeforeCooldown(intervals: Intervals) {
    const cooldownIdx = intervals.findIndex((t) => t.id.startsWith(COOLDOWN_INTERVAL_ID) && !t.id.includes('linger'));
    expect(cooldownIdx).toBeGreaterThan(0);
    return intervals[cooldownIdx - 1]!;
}

/** True when the combo window opens for a cast at its first throw (comboCount 1). */
function comboWindowOpens({ engine, player, intervals }: Setup, abilityId: string): boolean {
    const cancel = cancelBeforeCooldown(intervals).conditionalCancel;
    if (!cancel) return false;
    player.activeAbilities.push({ abilityId, comboCount: 1 } as never);
    try {
        return cancel.condition({ caster: player, engine, targets: [], abilityId } as never);
    } finally {
        player.activeAbilities.pop();
    }
}

describe('throw Combo Cancel timings', () => {
    it('Throw Rock includes a combo conditionalCancel when comboMax > 0', () => {
        const t = setup(THROW_ROCK_ABILITY_ID, { comboMax: 2 });
        const { engine } = t;
        expect(comboWindowOpens(t, THROW_ROCK_ABILITY_ID)).toBe(true);
        engine.destroy();
    });

    it('Throw Charged Rock includes a combo conditionalCancel when comboMax > 0', () => {
        const t = setup(THROW_CHARGED_ROCK_ABILITY_ID, { comboMax: 2 });
        const { engine } = t;
        expect(comboWindowOpens(t, THROW_CHARGED_ROCK_ABILITY_ID)).toBe(true);
        engine.destroy();
    });

    it('omits the combo conditionalCancel when there is no grant', () => {
        const t = setup(THROW_ROCK_ABILITY_ID);
        const { engine } = t;
        expect(comboWindowOpens(t, THROW_ROCK_ABILITY_ID)).toBe(false);
        engine.destroy();
    });

    it('Throw Knife gets a combo window from an unlimited grant (single knife)', () => {
        const t = setup(THROW_KNIFE_ABILITY_ID, { comboUnlimited: true });
        const { engine } = t;
        expect(comboWindowOpens(t, THROW_KNIFE_ABILITY_ID)).toBe(true);
        engine.destroy();
    });

    it('Throw Knife gets a combo window before the shared cooldown with More Rock (two knives)', () => {
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const { player } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 120, y: 160 },
            dummyWorld: { x: 280, y: 160 },
            abilities: [THROW_KNIFE_ABILITY_ID],
        });
        player.abilityModifiers = { [THROW_KNIFE_ABILITY_ID]: { comboUnlimited: true } };
        const ability = getAbility(THROW_KNIFE_ABILITY_ID)!;
        const twoKnifeTimings = ability.getAbilityTimings?.(player, {
            ...engine,
            getPlayerResearchNodes: () => ['more_rock'],
        } as never);
        // Sanity check: the More Rock timeline is the two-throw one (two Active intervals).
        const base = normalizeAbilityTimingsToIntervals(twoKnifeTimings ?? []);
        expect(base.filter((t) => t.id.startsWith('active')).length).toBe(2);
        const moreRockEngine = { ...engine, getPlayerResearchNodes: () => ['more_rock'] } as never;
        const intervals = normalizeAbilityTimingsToIntervals(
            resolveAbilityTimingEntries(ability, player, moreRockEngine),
        );
        expect(comboWindowOpens({ engine, player, intervals } as Setup, THROW_KNIFE_ABILITY_ID)).toBe(true);
        engine.destroy();
    });

    it('Throw Knife has no combo window without a grant', () => {
        const t = setup(THROW_KNIFE_ABILITY_ID);
        const { engine } = t;
        expect(comboWindowOpens(t, THROW_KNIFE_ABILITY_ID)).toBe(false);
        engine.destroy();
    });
});

describe('Combo tooltip line', () => {
    it('unlimited Combo shows the keyword without a number', () => {
        const { engine, ability } = setup(THROW_KNIFE_ABILITY_ID, { comboUnlimited: true });
        const line = getAbilityTooltipLines(ability, engine).find((l) => l.includes('Combo'));
        expect(line).toBeDefined();
        expect(line).toMatch(/^\{Combo:[^}]*\}$/);
        engine.destroy();
    });

    it('bounded Combo shows its magnitude', () => {
        const { engine, ability } = setup(THROW_ROCK_ABILITY_ID, { comboMax: 3 });
        const line = getAbilityTooltipLines(ability, engine).find((l) => l.includes('Combo'));
        expect(line).toContain('{2}');
        engine.destroy();
    });

    it('no grant shows no Combo line', () => {
        const { engine, ability } = setup(THROW_KNIFE_ABILITY_ID);
        expect(getAbilityTooltipLines(ability, engine).some((l) => l.includes('Combo'))).toBe(false);
        engine.destroy();
    });
});

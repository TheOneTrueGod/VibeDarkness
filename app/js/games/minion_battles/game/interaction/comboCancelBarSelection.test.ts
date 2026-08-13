import { describe, it, expect } from 'vitest';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { initializeAbilityRuntimeForUnit, syncNestedCardAbilityState } from '../../abilities/abilityUses';
import {
    resolveComboCancelBarAbilityId,
    resolveComboCancelBarCardIndex,
} from './comboCancelBarSelection';

const THROW_ROCK_ABILITY_ID = 'throw_rock';
const THROW_CHARGED_ROCK_ABILITY_ID = 'throw_charged_rock';

describe('resolveComboCancelBarCardIndex', () => {
    it('finds the cast ability when it is still on the bar', () => {
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
            abilities: [THROW_CHARGED_ROCK_ABILITY_ID],
        });

        expect(resolveComboCancelBarCardIndex(player, player.abilities, THROW_CHARGED_ROCK_ABILITY_ID)).toBe(0);
        expect(resolveComboCancelBarAbilityId(player, player.abilities, THROW_CHARGED_ROCK_ABILITY_ID)).toBe(
            THROW_CHARGED_ROCK_ABILITY_ID,
        );

        engine.destroy();
    });

    it('maps exhausted throw_charged_rock to the throw_rock fallback slot', () => {
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
            abilities: [THROW_CHARGED_ROCK_ABILITY_ID],
        });
        initializeAbilityRuntimeForUnit(player);
        player.abilityRuntime[THROW_CHARGED_ROCK_ABILITY_ID]!.currentUses = 0;
        syncNestedCardAbilityState(player);

        expect(player.abilities[0]).toBe(THROW_ROCK_ABILITY_ID);
        expect(resolveComboCancelBarCardIndex(player, player.abilities, THROW_CHARGED_ROCK_ABILITY_ID)).toBe(0);
        expect(resolveComboCancelBarAbilityId(player, player.abilities, THROW_CHARGED_ROCK_ABILITY_ID)).toBe(
            THROW_ROCK_ABILITY_ID,
        );

        engine.destroy();
    });
});

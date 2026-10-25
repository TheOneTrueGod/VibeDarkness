import { describe, expect, it } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { AnchoredTremor } from './0532Ability';
import { buildTinyBattleEngine, placePlayerAndDummy, TINY_BATTLE_PLAYER_ID } from '../../../testing/harness/buildTinyBattleEngine';
import { castToEnd, timingsFor } from '../earthCoreTestHelpers';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 };
const DUMMY_POS = { x: 5 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 };

function setup() {
    const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
    const { player, dummy } = placePlayerAndDummy(engine, {
        playerId: P,
        playerWorld: PLAYER_POS,
        dummyWorld: DUMMY_POS,
        abilities: [AnchoredTremor.id],
    });
    return { engine, player, dummy };
}

describe('Anchored Tremor', () => {
    it('is declarative: a Pulse behaviour on the active window', () => {
        expect(timingsFor(AnchoredTremor).find((i) => i.id === 'active')?.behaviour).toBeDefined();
    });

    it('lands four pulses that ramp 3, 5, 7, 9 (24 total) on grass', () => {
        const { engine, player, dummy } = setup();
        castToEnd(engine, player, AnchoredTremor.id, [{ type: 'pixel', position: DUMMY_POS }]);
        expect(dummy.maxHp - dummy.hp).toBe(24);
    });

    it('does not reach an enemy outside the pulse radius', () => {
        const { engine, player, dummy } = setup();
        castToEnd(engine, player, AnchoredTremor.id, [{ type: 'pixel', position: { x: DUMMY_POS.x, y: DUMMY_POS.y + 200 } }]);
        expect(dummy.maxHp - dummy.hp).toBe(0);
    });
});

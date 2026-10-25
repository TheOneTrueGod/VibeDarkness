import { describe, expect, it, vi } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { StoneyPunch } from './0533Ability';
import { buildTinyBattleEngine, placePlayerAndDummy, TINY_BATTLE_PLAYER_ID } from '../../../testing/harness/buildTinyBattleEngine';
import { addEarthCoreArmour, getEarthCoreArmour } from '../0527_EarthCoreShared/earthCoreArmour';
import { castToEnd, timingsFor } from '../earthCoreTestHelpers';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';

vi.mock('../../../abilities/blockingHelpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../abilities/blockingHelpers')>();
    return { ...actual, tryDamageOrBlock: vi.fn(actual.tryDamageOrBlock) };
});

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 };
const DUMMY_POS = { x: 5 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 };

function setup(armour: number) {
    const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
    const { player, dummy } = placePlayerAndDummy(engine, {
        playerId: P,
        playerWorld: PLAYER_POS,
        dummyWorld: DUMMY_POS,
        abilities: [StoneyPunch.id],
    });
    addEarthCoreArmour(player, armour);
    return { engine, player, dummy };
}

describe('Stoney Punch', () => {
    it('is declarative', () => {
        expect(timingsFor(StoneyPunch).find((i) => i.id === 'active')?.behaviour).toBeDefined();
    });

    it('spends all armour once for 2 bonus damage each, through tryDamageOrBlock (blockable)', () => {
        const { engine, player, dummy } = setup(3);
        vi.mocked(tryDamageOrBlock).mockClear();
        castToEnd(engine, player, StoneyPunch.id, [{ type: 'unit', unitId: dummy.id }]);
        expect(dummy.maxHp - dummy.hp).toBe(10);
        expect(getEarthCoreArmour(player)).toBe(0);
        const punchCalls = vi.mocked(tryDamageOrBlock).mock.calls.filter(([, p]) => p.abilityId === StoneyPunch.id);
        expect(punchCalls).toHaveLength(1);
    });

    it('keeps the armour when the punch finds nobody', () => {
        const { engine, player, dummy } = setup(3);
        castToEnd(engine, player, StoneyPunch.id, [{ type: 'pixel', position: { x: PLAYER_POS.x, y: PLAYER_POS.y - 250 } }]);
        expect(dummy.maxHp - dummy.hp).toBe(0);
        expect(getEarthCoreArmour(player)).toBe(3);
    });
});

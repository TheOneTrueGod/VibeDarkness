import { describe, expect, it } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { EarthernPunchAbility } from './0524Ability';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { buildTinyBattleEngine, placePlayerAndDummy, TINY_BATTLE_PLAYER_ID } from '../../../testing/harness/buildTinyBattleEngine';
import { TerrainType } from '../../../terrain/TerrainType';
import { castToEnd, enterInterval, timingsFor } from '../earthCoreTestHelpers';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 };
const DUMMY_POS = { x: 5 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 };

function punchDummyInEngine(aim: { x: number; y: number }): number {
    const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
    const { player, dummy } = placePlayerAndDummy(engine, {
        playerId: P,
        playerWorld: PLAYER_POS,
        dummyWorld: DUMMY_POS,
        abilities: [EarthernPunchAbility.id],
    });
    castToEnd(engine, player, EarthernPunchAbility.id, [{ type: 'pixel', position: aim }]);
    return dummy.maxHp - dummy.hp;
}

function makeUnit(id: string, x: number, y: number, teamId: 'player' | 'enemy'): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        speed: 100,
        teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId: teamId === 'player' ? 'player' : 'dark_wolf',
        name: id,
    });
}

/** Punches an enemy standing on the given bedrock, with a hand-built engine stub. */
function punchWithStub(bedrock: TerrainType): number {
    const caster = makeUnit('caster', 40, 40, 'player');
    const target = makeUnit('target', 95, 40, 'enemy');
    const units = [caster, target];
    const engine = {
        units,
        getUnit: (id: string) => units.find((u) => u.id === id),
        gameTime: 1,
        eventBus: new EventBus(),
        addEffect: () => {},
        requestHitPause: () => {},
        terrainManager: {
            grid: { worldToGrid: () => ({ col: 2, row: 1 }), get: () => bedrock },
            getFloorTile: () => null,
        },
    } as unknown as AbilityEngineContext;
    enterInterval(EarthernPunchAbility, 'hit', engine, caster, [{ type: 'pixel', position: { x: target.x, y: target.y } }]);
    return target.maxHp - target.hp;
}

describe('EarthernPunchAbility', () => {
    it('is declarative: one melee behaviour on the hit window', () => {
        const hit = timingsFor(EarthernPunchAbility).find((i) => i.id === 'hit');
        expect(hit?.behaviour).toBeDefined();
    });

    it('deals 12 damage to an enemy on grass (full cast in the engine)', () => {
        expect(punchDummyInEngine(DUMMY_POS)).toBe(12);
    });

    it('misses an enemy outside the punch line (full cast in the engine)', () => {
        expect(punchDummyInEngine({ x: PLAYER_POS.x, y: PLAYER_POS.y - 200 })).toBe(0);
    });

    it('deals 12 damage to an enemy that is not on stone', () => {
        expect(punchWithStub(TerrainType.Grass)).toBe(12);
    });

    it('deals 4 bonus damage to an enemy standing on stone', () => {
        expect(punchWithStub(TerrainType.Rock)).toBe(16);
    });
});

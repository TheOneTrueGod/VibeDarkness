import { describe, expect, it } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { DiggingClawsAbility } from './0534Ability';
import { buildTinyBattleEngine, placePlayerAndDummy, TINY_BATTLE_PLAYER_ID } from '../../../testing/harness/buildTinyBattleEngine';
import { Movement } from '../../../resources/Movement';
import { TerrainType } from '../../../terrain/TerrainType';
import { castToEnd, timingsFor } from '../earthCoreTestHelpers';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

describe('Digging Claws on the Dash behaviour', () => {
    it('is declarative: a Dash on the dash window', () => {
        expect(timingsFor(DiggingClawsAbility).find((i) => i.id === 'dash')?.behaviour).toBeDefined();
    });

    it('dashes through rock, damaging each rock tile it enters', () => {
        const engine = buildTinyBattleEngine({ gridW: 14, gridH: 10, localPlayerId: P, grass: true });
        const tm = engine.terrainManager!;
        for (const col of [4, 5]) tm.grid.set(col, 5, TerrainType.Rock);
        const { player } = placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: { x: 2 * CELL + 20, y: 5 * CELL + 20 },
            dummyWorld: { x: 12 * CELL + 20, y: 1 * CELL + 20 },
            abilities: ['0534'],
        });
        player.attachResource(new Movement(), engine.eventBus);
        const startX = player.x;
        castToEnd(engine, player, '0534', [{ type: 'pixel', position: { x: 7 * CELL + 20, y: 5 * CELL + 20 } }], 25);
        expect(Math.abs(player.x - startX)).toBeGreaterThan(80);
        for (const col of [4, 5]) {
            const floor = tm.getFloorTile(col, 5);
            const intact = floor?.destructible ? floor.destructible.health : undefined;
            const cracked = floor !== null && (floor.terrainType === TerrainType.Rubble || (intact !== undefined && intact < floor.destructible!.maxHealth));
            expect(cracked).toBe(true);
        }
    });
});

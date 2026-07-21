/**
 * Apply `ActiveAbility.movementByLabel` entries onto a unit's movement path.
 */
import { describe, expect, it } from 'vitest';
import {
    applyMovementByLabelEntry,
    flushMovementByLabel,
    movementByLabelDestination,
} from './applyMovementByLabel';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { resetGameObjectIdCounter } from '../GameObject';

describe('applyMovementByLabel', () => {
    it('movementByLabelDestination returns the last path cell', () => {
        expect(
            movementByLabelDestination({
                movePath: [
                    { col: 3, row: 5 },
                    { col: 7, row: 5 },
                ],
            }),
        ).toEqual({ col: 7, row: 5 });
        expect(movementByLabelDestination({ movePath: [] })).toBeNull();
    });

    it('repathFromCurrent rebuilds path from the unit cell to the stored destination', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        // Start at col 2; stored path was from col 5 → col 8 (stale pre-lunge origin).
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 2 * CELL_SIZE + CELL_SIZE / 2,
            y: 4 * CELL_SIZE + CELL_SIZE / 2,
            abilities: [],
        });

        applyMovementByLabelEntry(
            player,
            {
                movePath: [
                    { col: 6, row: 4 },
                    { col: 8, row: 4 },
                ],
            },
            engine,
            { repathFromCurrent: true },
        );

        expect(player.movement).not.toBeNull();
        const path = player.movement!.path;
        expect(path[path.length - 1]).toEqual({ col: 8, row: 4 });
        // Straight grass line → single destination cell from current col 2.
        expect(path).toEqual([{ col: 8, row: 4 }]);
        expect(player.walkIntent?.dest).toEqual({ col: 8, row: 4 });

        engine.destroy();
    });

    it('flushMovementByLabel clears the map after applying', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 2 * CELL_SIZE + CELL_SIZE / 2,
            y: 4 * CELL_SIZE + CELL_SIZE / 2,
            abilities: [],
        });
        const active = {
            movementByLabel: {
                Target: { movePath: [{ col: 9, row: 4 }] },
            },
        };

        flushMovementByLabel(player, active, engine, { repathFromCurrent: true });

        expect(active.movementByLabel).toBeUndefined();
        expect(player.movement?.path[player.movement!.path.length - 1]).toEqual({ col: 9, row: 4 });

        engine.destroy();
    });
});

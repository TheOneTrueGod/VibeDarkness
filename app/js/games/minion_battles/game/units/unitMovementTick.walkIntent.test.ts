/**
 * Unit.walkIntent — durable destination across invalidate / forced displace.
 */
import { describe, expect, it } from 'vitest';
import {
    clearUnitMovement,
    invalidateUnitMovementPath,
    setUnitMovement,
    tryRepathFromWalkIntent,
    updateUnit,
} from './unitMovementTick';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { resetGameObjectIdCounter } from '../GameObject';

const FIXED_DT = 1 / 60;

describe('Unit.walkIntent', () => {
    it('setMovement stores walkIntent; invalidate keeps intent and clears path', () => {
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

        setUnitMovement(
            player,
            [
                { col: 4, row: 4 },
                { col: 8, row: 4 },
            ],
            undefined,
            engine.gameTick,
        );
        expect(player.walkIntent).toEqual({ dest: { col: 8, row: 4 } });
        expect(player.movement).not.toBeNull();

        invalidateUnitMovementPath(player);
        expect(player.movement).toBeNull();
        expect(player.pathInvalidated).toBe(true);
        expect(player.walkIntent).toEqual({ dest: { col: 8, row: 4 } });

        clearUnitMovement(player);
        expect(player.walkIntent).toBeNull();
        expect(player.pathInvalidated).toBe(false);

        engine.destroy();
    });

    it('tryRepathFromWalkIntent rebuilds path from current cell to intent dest', () => {
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

        setUnitMovement(
            player,
            [
                { col: 6, row: 4 },
                { col: 8, row: 4 },
            ],
            undefined,
            engine.gameTick,
        );
        // Simulate post-lunge / knockback: moved east, path wiped, intent kept.
        player.x = 5 * CELL_SIZE + CELL_SIZE / 2;
        invalidateUnitMovementPath(player);

        tryRepathFromWalkIntent(player, engine);

        expect(player.movement).not.toBeNull();
        expect(player.movement!.path[player.movement!.path.length - 1]).toEqual({ col: 8, row: 4 });
        expect(player.pathInvalidated).toBe(false);

        engine.destroy();
    });

    it('after knockback ends, movement tick repaths to walkIntent', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 3 * CELL_SIZE + CELL_SIZE / 2,
            y: 4 * CELL_SIZE + CELL_SIZE / 2,
            abilities: [],
        });

        const destCol = 9;
        const destRow = 4;
        setUnitMovement(
            player,
            [{ col: destCol, row: destRow }],
            undefined,
            engine.gameTick,
        );

        player.applyKnockback(
            {
                knockbackVector: { x: 40, y: 0 },
                knockbackAirTime: FIXED_DT * 2,
                knockbackSlideTime: 0,
                knockbackSource: { unitId: 'src', abilityId: 'test_kb' },
            },
            engine.eventBus,
        );
        expect(player.movement).toBeNull();
        expect(player.walkIntent?.dest).toEqual({ col: destCol, row: destRow });

        // Advance through knockback.
        for (let i = 0; i < 8; i++) {
            updateUnit(player, FIXED_DT, engine);
        }
        expect(player.knockback).toBeNull();
        expect(player.movement).not.toBeNull();
        expect(player.movement!.path[player.movement!.path.length - 1]).toEqual({
            col: destCol,
            row: destRow,
        });

        engine.destroy();
    });

    it('after dash-style invalidate, free movement tick resumes walkIntent', () => {
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

        setUnitMovement(
            player,
            [{ col: 8, row: 4 }],
            undefined,
            engine.gameTick,
        );
        // Dash displaces then invalidates (same as DashBehaviour).
        player.x = 5 * CELL_SIZE + CELL_SIZE / 2;
        player.invalidateMovementPath();

        updateUnit(player, FIXED_DT, engine);

        expect(player.movement).not.toBeNull();
        expect(player.movement!.path[player.movement!.path.length - 1]).toEqual({ col: 8, row: 4 });

        engine.destroy();
    });
});

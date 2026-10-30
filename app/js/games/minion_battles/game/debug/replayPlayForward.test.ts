import { describe, expect, it } from 'vitest';
import '../../abilities/AbilityRegistry';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { playForward } from './replayPlayForward';

const PLAY_FORWARD_TICKS = 3;
const PLAYER_CELL = 5;

describe('playForward', () => {
    it('runs an order past the turn pause and records the tick', () => {
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 12,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
        });
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: PLAYER_CELL * CELL_SIZE,
            y: PLAYER_CELL * CELL_SIZE,
            abilities: [],
        });
        engine.waitingForOrders = {
            atTick: engine.gameTick + 1,
            waiters: [{ unitId: player.id, ownerId: TINY_BATTLE_PLAYER_ID }],
        };
        const untilTick = engine.gameTick + PLAY_FORWARD_TICKS;
        const result = playForward(engine, {
            untilTick,
            orders: [{
                atTick: engine.gameTick + 1,
                order: {
                    unitId: player.id,
                    abilityId: 'wait',
                    targets: [],
                    endTurn: true,
                },
            }],
        });

        expect(result.stalled).toBeNull();
        expect(result.tick).toBe(untilTick);
        expect(result.traces[result.traces.length - 1]?.tick).toBe(untilTick);
        expect(player.waitMinEndTime).not.toBeNull();
        engine.destroy();
    });
});

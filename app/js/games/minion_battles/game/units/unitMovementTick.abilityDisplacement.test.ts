/**
 * Ability self-displacement claims exclusive movement for the tick.
 * Walk orders stay on walkIntent and resume after the slide ends.
 */
import { describe, expect, it } from 'vitest';
import './Unit';
import { setUnitMovement, updateUnit } from './unitMovementTick';
import { getAbility } from '../../abilities/AbilityRegistry';
import { CLAW_DURATION, CLAW_MAX_DISTANCE } from '../../card_defs/0111_Claw/0111Ability';
import { Movement } from '../../resources/Movement';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { resetGameObjectIdCounter } from '../GameObject';

const FIXED_DT = 1 / 60;
const CLAW_DASH_TICKS = Math.ceil(CLAW_DURATION / FIXED_DT);
const WALK_RESUME_TICKS = 8;
const START_COL = 8;
const START_ROW = 4;
const WALK_DEST_COL = 2;
const WALK_DEST_ROW = 4;

function spawnPlayerAtStart() {
    resetGameObjectIdCounter(1);
    const engine = buildTinyBattleEngine({
        gridW: 16,
        gridH: 8,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
        grass: true,
    });
    const startX = START_COL * CELL_SIZE + CELL_SIZE / 2;
    const startY = START_ROW * CELL_SIZE + CELL_SIZE / 2;
    const player = spawnTinyPlayerUnit(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        x: startX,
        y: startY,
        abilities: ['0111'],
    });
    player.attachResource(new Movement(), engine.eventBus);
    return { engine, player, startX, startY };
}

describe('ability displacement vs walkIntent', () => {
    it('moveUnit claims exclusive movement for this tick', () => {
        const { engine, player } = spawnPlayerAtStart();
        expect(player.abilityOwnsMovementThisTick).toBe(false);

        const moved = player.moveUnit(player.x + 20, player.y, 8);
        expect(moved).toBeGreaterThan(0);
        expect(player.abilityOwnsMovementThisTick).toBe(true);

        engine.destroy();
    });

    it('does not repath or walk toward walkIntent while ability owns movement', () => {
        const { engine, player, startX } = spawnPlayerAtStart();
        setUnitMovement(
            player,
            [{ col: WALK_DEST_COL, row: WALK_DEST_ROW }],
            undefined,
            engine.gameTick,
        );
        player.invalidateMovementPath();
        player.claimAbilityMovement();

        updateUnit(player, FIXED_DT, engine);

        expect(player.walkIntent?.dest).toEqual({ col: WALK_DEST_COL, row: WALK_DEST_ROW });
        expect(player.movement).toBeNull();
        expect(player.x).toBe(startX);

        engine.destroy();
    });

    it('claw dash does not add walk displacement; walking resumes after the slide', () => {
        const { engine, player, startX, startY } = spawnPlayerAtStart();
        const claw = getAbility('0111');
        expect(claw).toBeDefined();

        setUnitMovement(
            player,
            [{ col: WALK_DEST_COL, row: WALK_DEST_ROW }],
            undefined,
            engine.gameTick,
        );
        player.executeAbility(claw!, [{ type: 'pixel', position: { x: startX + CLAW_MAX_DISTANCE + 80, y: startY } }], engine);

        let maxXDuringDash = startX;
        for (let i = 0; i < CLAW_DASH_TICKS; i++) {
            engine.gameTime += FIXED_DT;
            player.abilityOwnsMovementThisTick = false;
            player.tickActiveAbilities(FIXED_DT, engine, () => {});
            const xAfterAbility = player.x;
            updateUnit(player, FIXED_DT, engine);
            expect(player.x).toBe(xAfterAbility);
            expect(player.walkIntent?.dest).toEqual({ col: WALK_DEST_COL, row: WALK_DEST_ROW });
            maxXDuringDash = Math.max(maxXDuringDash, player.x);
        }

        expect(maxXDuringDash).toBeGreaterThan(startX);
        expect(player.x).toBeGreaterThan(startX);

        const xAtDashEnd = player.x;
        for (let i = 0; i < WALK_RESUME_TICKS; i++) {
            engine.gameTime += FIXED_DT;
            player.abilityOwnsMovementThisTick = false;
            player.tickActiveAbilities(FIXED_DT, engine, () => {});
            updateUnit(player, FIXED_DT, engine);
        }

        expect(player.walkIntent?.dest).toEqual({ col: WALK_DEST_COL, row: WALK_DEST_ROW });
        expect(player.x).toBeLessThan(xAtDashEnd);

        engine.destroy();
    });
});

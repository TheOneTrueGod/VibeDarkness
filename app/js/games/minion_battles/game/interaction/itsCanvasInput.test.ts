import { describe, expect, it } from 'vitest';
import { resetGameObjectIdCounter } from '../GameObject';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { getAbility } from '../../abilities/AbilityRegistry';
import { getSelectTargetDefsFromTimings, getAbilityMaxRange } from '../../abilities/targeting';
import { SwingBatCard } from '../../card_defs/0115_SwingBat/0115Ability';
import { ForcePushCard } from '../../card_defs/09_gravity_core/0902_ForcePush/0902Ability';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../testing/fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../abilities/abilityUses';
import { resolveItsSelectTargetForClick } from './itsCanvasInput';

const SWING_BAT_ID = SwingBatCard.abilityId;
const FORCE_PUSH_ID = ForcePushCard.abilityId;

describe('resolveItsSelectTargetForClick', () => {
    it('lock-on beats pixel when an enemy is in the hitbox', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({
            gridW: 20,
            gridH: 12,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: [SWING_BAT_ID],
        });
        const enemy = createTargetDummyAtWorld(engine, playerX + 30, playerY, {
            id: 'enemy_in_range',
            hp: 100,
        });
        initializeAbilityRuntimeForUnit(enemy);
        engine.addUnit(enemy, 'initialGameSpawn');

        const ability = getAbility(SWING_BAT_ID)!;
        const selectDef = getSelectTargetDefsFromTimings(ability, player, engine)[0]!;
        const clickWorld = { x: playerX + 200, y: playerY + 200 };

        const resolution = resolveItsSelectTargetForClick(
            ability,
            player,
            selectDef,
            { x: playerX + 30, y: playerY },
            clickWorld,
            {},
            engine,
        );

        expect(resolution).not.toBeNull();
        expect(resolution!.labelTarget).toEqual({ type: 'unit', unitId: enemy.id });
        expect(resolution!.resolved.type).toBe('unit');
        engine.destroy();
    });

    it('falls back to pixel when allowMiss is not false and no lock-on candidates', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({
            gridW: 20,
            gridH: 12,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: [SWING_BAT_ID],
        });

        const ability = getAbility(SWING_BAT_ID)!;
        const selectDef = getSelectTargetDefsFromTimings(ability, player, engine)[0]!;
        const clickWorld = { x: playerX + 40, y: playerY };

        const resolution = resolveItsSelectTargetForClick(
            ability,
            player,
            selectDef,
            clickWorld,
            clickWorld,
            {},
            engine,
        );

        expect(resolution).not.toBeNull();
        expect(resolution!.labelTarget).toEqual({ type: 'pixel', position: clickWorld });
        expect(resolution!.resolved).toEqual({ type: 'pixel', position: clickWorld });
        engine.destroy();
    });

    it('returns null when allowMiss is false and no lock-on candidates', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({
            gridW: 20,
            gridH: 12,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: [FORCE_PUSH_ID],
        });

        const ability = getAbility(FORCE_PUSH_ID)!;
        const selectDef = getSelectTargetDefsFromTimings(ability, player, engine)[0]!;
        expect(selectDef.allowMiss).toBe(false);
        const clickWorld = { x: playerX + 40, y: playerY };

        const resolution = resolveItsSelectTargetForClick(
            ability,
            player,
            selectDef,
            clickWorld,
            clickWorld,
            {},
            engine,
        );

        expect(resolution).toBeNull();
        engine.destroy();
    });

    it('clamps an out-of-range pixel pick to ability max range', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({
            gridW: 40,
            gridH: 20,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: [SWING_BAT_ID],
        });

        const ability = getAbility(SWING_BAT_ID)!;
        const selectDef = getSelectTargetDefsFromTimings(ability, player, engine)[0]!;
        const farClick = { x: playerX + 500, y: playerY };

        const resolution = resolveItsSelectTargetForClick(
            ability,
            player,
            selectDef,
            farClick,
            farClick,
            {},
            engine,
        );

        expect(resolution).not.toBeNull();
        const resolved = resolution!.resolved;
        expect(resolved.type).toBe('pixel');
        if (resolved.type === 'pixel') {
            expect(resolved.position).toBeDefined();
            const pos = resolved.position!;
            const dx = pos.x - playerX;
            const dy = pos.y - playerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxRange = getAbilityMaxRange(ability, player);
            expect(maxRange).not.toBeNull();
            expect(dist).toBeLessThanOrEqual(maxRange! + 1);
            expect(dist).toBeLessThan(500);
        }
        engine.destroy();
    });

    it('builds melee order targets with lock-on unit plus aim pixel', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({
            gridW: 20,
            gridH: 12,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: [SWING_BAT_ID],
        });
        const enemy = createTargetDummyAtWorld(engine, playerX + 30, playerY, {
            id: 'enemy_lock_on',
            hp: 100,
        });
        initializeAbilityRuntimeForUnit(enemy);
        engine.addUnit(enemy, 'initialGameSpawn');

        const ability = getAbility(SWING_BAT_ID)!;
        const selectDef = getSelectTargetDefsFromTimings(ability, player, engine)[0]!;
        const clickWorld = { x: playerX + 35, y: playerY + 2 };

        const resolution = resolveItsSelectTargetForClick(
            ability,
            player,
            selectDef,
            clickWorld,
            clickWorld,
            {},
            engine,
        );

        expect(resolution).not.toBeNull();
        expect(resolution!.orderTargets).toEqual([
            { type: 'unit', unitId: enemy.id, lockRole: 'primary' },
            { type: 'pixel', position: clickWorld },
        ]);
        engine.destroy();
    });
});

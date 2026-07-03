/**
 * Regression: sequential targeting preview highlights lock-ons from the post-lunge
 * virtual caster, but click resolution used the pre-lunge caster — so MeleeAttack
 * received a different lock-on list than the player saw.
 */
import { describe, expect, it } from 'vitest';
import { resetGameObjectIdCounter } from '../game/GameObject';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { getAbility } from './AbilityRegistry';
import {
    filterSelectTargetCandidates,
    getSelectTargetDefsFromTimings,
    resolveSelectTargetLockOnCandidates,
} from './targeting';
import { SwingBatCard } from '../card_defs/0115_SwingBat/0115Ability';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../testing/fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from './abilityUses';

const SWING_BAT_ID = SwingBatCard.abilityId;

describe('resolveSelectTargetLockOnCandidates (lunge-aware)', () => {
    it('includes enemies only reachable after windup lunge (matches targeting preview)', () => {
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

        // Far along +X so a lunge is required. Enemy sits on the post-lunge swing bar
        // (near x = playerX + lunge + maxRange) but outside the pre-lunge bar.
        const aimPoint = { x: playerX + 100, y: playerY };
        const postLungeOnly = createTargetDummyAtWorld(engine, playerX + 80, playerY + 5, {
            id: 'enemy_post_lunge',
            hp: 100,
        });
        initializeAbilityRuntimeForUnit(postLungeOnly);
        engine.addUnit(postLungeOnly, 'initialGameSpawn');

        const ability = getAbility(SWING_BAT_ID)!;
        const selectDef = getSelectTargetDefsFromTimings(ability, player, engine)[0]!;
        expect(selectDef).toBeDefined();

        const preLungeRaw = selectDef.hitbox.resolveTargets(player, aimPoint, engine.units);
        const preLunge = filterSelectTargetCandidates(preLungeRaw, player, selectDef.filter);
        expect(preLunge.map((u) => u.id)).not.toContain(postLungeOnly.id);

        const lockOns = resolveSelectTargetLockOnCandidates(
            ability,
            player,
            selectDef,
            aimPoint,
            engine,
        );
        expect(lockOns.map((u) => u.id)).toContain(postLungeOnly.id);

        engine.destroy();
    });
});

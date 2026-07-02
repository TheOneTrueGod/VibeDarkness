import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;

/**
 * Geometry:
 *   Caster at (235, 260), aiming east at click pixel (280, 260).
 *   Enemy at (280, 295) — south of the aim line, inside the perpendicular swing bar.
 *   After the lunge (needed ≈ 20 px east), caster ends at ~(255, 260).
 *
 *   Correctly-fixed path: caster lunges toward (280, 260) (the click pixel).
 *     dist_to_aim_pixel ≈ 25   dist_to_enemy ≈ 43 → caster closer to aim pixel ✓
 *
 *   Buggy path (lunge toward unit): caster would lunge toward (280, 295).
 *     dist_to_aim_pixel ≈ 28   dist_to_enemy ≈ 27 → caster closer to enemy (assertion fails).
 */
const PLAYER_POS = { x: 235, y: 260 };
const ENEMY_POS  = { x: 280, y: 295 };
const AIM_PIXEL  = { x: 280, y: 260 };
const DUMMY_ID   = 'seq_aim_dummy';

/**
 * End-to-end scenario for sequential melee targeting:
 * - Submits targets = [unit lock-on, aim pixel] (same array upfront path produces).
 * - Asserts enemy takes damage (guaranteed lock-on hit).
 * - Asserts player lunged toward the click pixel, not the lock-on unit.
 */
export const swingBatSequentialAimPixelScenario: ScenarioDefinition = {
    id: 'swing_bat_sequential_aim_pixel',
    title: 'Swing Bat sequential: lock-on enemy takes damage, player lunges toward click pixel',
    category: 'ability',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 18,
            gridH: 14,
            localPlayerId: P,
            grass: true,
        });
        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: ['0115'],
        });
        const dummy = createTargetDummyAtWorld(engine, ENEMY_POS.x, ENEMY_POS.y, {
            id: DUMMY_ID,
            hp: 400,
        });
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{
            unitId: player.id,
            abilityId: '0115',
            targets: [
                { type: 'unit' as const, unitId: DUMMY_ID },
                { type: 'pixel' as const, position: AIM_PIXEL },
            ],
        }];
    },

    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        const dummy = engine.units.find(u => u.id === DUMMY_ID);
        if (!player || !dummy) return false;
        if (dummy.hp >= dummy.maxHp) return false;
        const dToAim   = Math.hypot(player.x - AIM_PIXEL.x,  player.y - AIM_PIXEL.y);
        const dToEnemy = Math.hypot(player.x - ENEMY_POS.x,  player.y - ENEMY_POS.y);
        return dToAim < dToEnemy;
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const dummy  = engine.units.find(u => u.id === DUMMY_ID);
        if (!player || !dummy) return 'player or dummy not found';
        const dToAim   = Math.hypot(player.x - AIM_PIXEL.x,  player.y - AIM_PIXEL.y);
        const dToEnemy = Math.hypot(player.x - ENEMY_POS.x,  player.y - ENEMY_POS.y);
        return (
            `dummy.hp=${dummy.hp}/${dummy.maxHp}; ` +
            `player=(${Math.round(player.x)},${Math.round(player.y)}); ` +
            `d_to_aim=${Math.round(dToAim)} d_to_enemy=${Math.round(dToEnemy)} ` +
            `(need d_to_aim < d_to_enemy)`
        );
    },

    describeState(engine) {
        const player = engine.getLocalPlayerUnit();
        const dummy  = engine.units.find(u => u.id === DUMMY_ID);
        return [
            `player  pos=(${Math.round(player?.x ?? 0)},${Math.round(player?.y ?? 0)})`,
            `dummy   pos=(${Math.round(dummy?.x ?? 0)},${Math.round(dummy?.y ?? 0)}) hp=${dummy?.hp}/${dummy?.maxHp}`,
            `aimPixel=(${AIM_PIXEL.x},${AIM_PIXEL.y})`,
        ].join('\n');
    },
};

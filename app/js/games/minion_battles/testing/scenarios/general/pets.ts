/**
 * Pet system ability-test scenarios.
 * Covers the spirit animal: guarding (anchored on the owner, never auto-engaging), Heel (0703, disabled in
 * research), and Sic 'em / Pounce (0704/0702) locking on into Spirit Flurry (0711).
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    MOVE_ONLY_ABILITY_ID,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import type { PetAITreeContext } from '../../../game/units/unitAI/pet/context';
import type { StunnedBuff } from '../../../buffs/StunnedBuff';
import { petStateOf } from '../../../game/units/components/petComponent';
import { getPetDef } from '../../../game/units/pet_defs/petDef';
import { SPIRIT_FLURRY_ANGLES } from '../../../card_defs/07_command_core/0711_SpiritFlurry/0711Ability';
import { SPIRIT_STRIKE_DAMAGE } from '../../../card_defs/07_command_core/0710_SpiritStrike/0710Ability';

/** Pounce's own hit damage (0702). */
const POUNCE_HIT_DAMAGE = 10;

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

// Helper: spawn a dog linked to an owner.
function spawnDog(
    engine: ReturnType<typeof buildTinyBattleEngine>,
    owner: ReturnType<typeof spawnTinyPlayerUnit>,
    pos: { x: number; y: number },
    opts: { hp?: number } = {},
): ReturnType<typeof createUnitFromSpawnConfig> {
    const dog = createUnitFromSpawnConfig(
        {
            id: 'dog1',
            characterId: 'dog',
            name: 'Dog',
            x: pos.x,
            y: pos.y,
            teamId: 'player',
            ownerId: 'ai',
            abilities: [...getPetDef('dog')!.abilityIds],
            unitAITreeId: 'pet',
            aiSettings: { minRange: 0, maxRange: 50 },
        },
        engine.eventBus,
        engine,
    );
    petStateOf(dog).defId = 'dog';
    petStateOf(dog).ownerUnitId = owner.id;
    if (opts.hp !== undefined) dog.hp = opts.hp;
    petStateOf(owner).unitIds.push(dog.id);
    initializeAbilityRuntimeForUnit(dog);
    engine.addUnit(dog, 'initialGameSpawn');
    return dog;
}

// ---- Scenario 1: Spirit guards its owner ----

/**
 * The spirit is guarding (no ordered point), so its anchor is the owner. An enemy stands close by; the
 * spirit never chases it. The player walks far east; the spirit follows and ends within its anchor
 * radius (50 px, plus a little slack for the last step).
 *
 * Assertions:
 *   1. The enemy is untouched (no auto-engage).
 *   2. The spirit ended within 60 px of the player.
 */
export const petAutoEngageScenario: ScenarioDefinition = {
    id: 'pet_auto_engage',
    title: 'Spirit: guards its owner — follows within 50 px and never chases enemies',
    category: 'general',
    generalSection: 'Pets',
    maxDurationMs: 25000,

    buildEngine() {
        // Wide grid so the player can walk far enough to trigger the return leash (300 px).
        const engine = buildTinyBattleEngine({ gridW: 22, gridH: 12, localPlayerId: P, grass: true });

        const tm = engine.terrainManager!;
        // Player at cell (3, 5) — left-ish, room to walk right.
        const playerPos = tm.grid.gridToWorld(3, 5);
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: playerPos.x,
            y: playerPos.y,
            abilities: [],
        });

        // Dog one cell east of player.
        const dogPos = tm.grid.gridToWorld(4, 5);
        spawnDog(engine, player, dogPos);

        // Enemy three cells east of player — 120 px away, inside engage leash (150 px).
        const enemyPos = tm.grid.gridToWorld(6, 5);
        const enemy = createUnitFromSpawnConfig(
            {
                id: 'enemy1',
                characterId: 'target_dummy',
                name: 'Target',
                x: enemyPos.x,
                y: enemyPos.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitAITreeId: 'default',
                aiSettings: { minRange: 0, maxRange: 30 },
            },
            engine.eventBus,
            engine,
        );
        initializeAbilityRuntimeForUnit(enemy);
        engine.addUnit(enemy, 'initialGameSpawn');

        // Pre-queue wait orders for the player after the move arrives, to prevent idle early-exit.
        const unitId = player.id;
        for (const tick of [480, 600, 720, 840, 960, 1080, 1200, 1320]) {
            engine.state.orderMgr.queueOrder(tick, { unitId, abilityId: 'wait', targets: [] });
        }

        return engine;
    },

    getInitialOrders(engine) {
        const tm = engine.terrainManager!;
        const player = engine.getLocalPlayerUnit()!;
        // Walk east to cell 19 — ~640 px from player start, putting player 440+ px from the enemy.
        // When player arrives, dog (at enemy ~col 6) is 520+ px away → return leash (300 px) fires.
        const from = tm.grid.worldToGrid(player.x, player.y);
        const path = tm.findGridPath(from.col, from.row, 19, from.row);
        if (!path || path.length === 0) return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
        return [{ unitId: player.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: path }];
    },

    assertPass(engine) {
        const enemy = engine.getUnit('enemy1');
        const dog = engine.getUnit('dog1');
        const player = engine.getLocalPlayerUnit()!;
        if (!enemy || !dog) return false;
        const untouched = enemy.hp === enemy.maxHp;
        const dogNearOwner = Math.hypot(dog.x - player.x, dog.y - player.y) <= 60;
        return untouched && dogNearOwner;
    },

    failureMessage(engine) {
        const enemy = engine.getUnit('enemy1');
        const dog = engine.getUnit('dog1');
        const player = engine.getLocalPlayerUnit()!;
        const dist = dog ? Math.hypot(dog.x - player.x, dog.y - player.y).toFixed(0) : '?';
        return (
            `enemy dmg=${enemy ? enemy.maxHp - enemy.hp : '?'} ` +
            `dog-to-owner=${dist} px ` +
            `dog pos=(${dog?.x.toFixed(0)},${dog?.y.toFixed(0)}) ` +
            `player pos=(${player.x.toFixed(0)},${player.y.toFixed(0)})`
        );
    },
};

// ---- Scenario 2: Heel heals and holds ----

/**
 * A dog mid-engage transitions into the heel state when Heel (0703) is cast.
 * The dog heals 30% of max HP and moves within the heel tether range of the player.
 *
 * Also covers Pounce (0702) transitively — the dog has Pounce in its ability list.
 */
export const petHeelScenario: ScenarioDefinition = {
    id: 'pet_heel',
    title: 'Heel (0703): heals 30% max HP and holds dog within tether range',
    category: 'general',
    generalSection: 'Pets',
    maxDurationMs: 10000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 14, gridH: 10, localPlayerId: P, grass: true });

        const PLAYER_POS = { x: 5 * CELL, y: 5 * CELL };

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: ['0703'], // Heel
        });

        // Dog starts 80 px east, HP = 12/24 (50%). Manually in pet_engage targeting enemy1.
        const dogPos = { x: PLAYER_POS.x + 80, y: PLAYER_POS.y };
        const dog = spawnDog(engine, player, dogPos, { hp: 12 });
        dog.aiContext = {
            aiTree: 'pet',
            aiState: 'pet_engage',
            targetUnitId: 'enemy1',
        } as PetAITreeContext;

        // Enemy east of the dog — target for the dog's engage state.
        const enemy = createUnitFromSpawnConfig(
            {
                id: 'enemy1',
                characterId: 'target_dummy',
                name: 'Target',
                x: PLAYER_POS.x + 160,
                y: PLAYER_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitAITreeId: 'default',
                aiSettings: { minRange: 0, maxRange: 30 },
            },
            engine.eventBus,
            engine,
        );
        initializeAbilityRuntimeForUnit(enemy);
        engine.addUnit(enemy, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        // Cast Heel immediately (no targets).
        return [{ unitId: player.id, abilityId: '0703', targets: [] }];
    },

    assertPass(engine) {
        const dog = engine.getUnit('dog1');
        const player = engine.getLocalPlayerUnit()!;
        if (!dog) return false;
        // Should have healed: floor(24 * 0.30) = 7, so 12 + 7 = 19.
        const healed = dog.hp >= 19;
        // Dog should have disengaged and moved within ~ 2× tether range (30 px) of the player.
        const dist = Math.hypot(dog.x - player.x, dog.y - player.y);
        const nearOwner = dist <= 61; // 2× HEEL_TETHER + 1px float slack
        return healed && nearOwner;
    },

    failureMessage(engine) {
        const dog = engine.getUnit('dog1');
        const player = engine.getLocalPlayerUnit()!;
        const dist = dog ? Math.hypot(dog.x - player.x, dog.y - player.y).toFixed(0) : '?';
        return `dog hp=${dog?.hp}/${dog?.maxHp} (expected ≥18), dist-to-owner=${dist} px (expected ≤61)`;
    },
};

// ---- Scenario 3: Sic 'em / Pounce ----

/**
 * Player casts Sic 'em (0704) at a point beyond an enemy in the dog's southward dash lane.
 * The dog pounces via Pounce (0702), stops on the enemy (stopOnHit), deals ~3 damage,
 * stuns the enemy, and displaces it opposite the dash direction (northward).
 *
 * This scenario also covers Pounce (0702) — the pet command ability used by Sic 'em.
 */
export const petSicEmPounceScenario: ScenarioDefinition = {
    id: 'pet_sic_em_pounce',
    title: "Sic 'em (0704) + Pounce (0702): spirit lunges, locks on to the first enemy, then strikes it four times",
    category: 'general',
    generalSection: 'Pets',
    maxDurationMs: 15000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 14, gridH: 14, localPlayerId: P, grass: true });

        const PLAYER_POS = { x: 5 * CELL, y: 5 * CELL };

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: ['0704'], // Sic 'em
        });

        // Dog starts 50 px south of player.
        const DOG_POS = { x: PLAYER_POS.x, y: PLAYER_POS.y + 50 };
        spawnDog(engine, player, DOG_POS);

        // Enemy 130 px south of dog — within Pounce max range (120 px), directly in the dash lane.
        const ENEMY_POS = { x: DOG_POS.x, y: DOG_POS.y + 130 };
        const enemy = createUnitFromSpawnConfig(
            {
                id: 'enemy1',
                characterId: 'target_dummy',
                name: 'Target',
                x: ENEMY_POS.x,
                y: ENEMY_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitAITreeId: 'default',
                aiSettings: { minRange: 0, maxRange: 30 },
            },
            engine.eventBus,
            engine,
        );
        initializeAbilityRuntimeForUnit(enemy);
        engine.addUnit(enemy, 'initialGameSpawn');

        // Keep player non-idle so the simulation does not early-exit while the dog is mid-dash.
        const unitId = player.id;
        for (const tick of [60, 180, 300, 420, 540, 660, 780]) {
            engine.state.orderMgr.queueOrder(tick, { unitId, abilityId: 'wait', targets: [] });
        }

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const dog = engine.getUnit('dog1')!;
        // Target point: 200 px south of dog — beyond the enemy (at +130); dash clamped to Pounce max (120 px).
        const targetY = dog.y + 200;
        return [{
            unitId: player.id,
            abilityId: '0704', // Sic 'em
            targets: [{ type: 'pixel' as const, position: { x: dog.x, y: targetY } }],
        }];
    },

    assertPass(engine) {
        const enemy = engine.getUnit('enemy1');
        const dog = engine.getUnit('dog1');
        if (!enemy || !dog) return false;

        // Pounce's hit, then the lock-on: four Spirit Flurry strikes on the same enemy.
        const expected = POUNCE_HIT_DAMAGE + SPIRIT_FLURRY_ANGLES.length * SPIRIT_STRIKE_DAMAGE;
        return enemy.maxHp - enemy.hp >= expected;
    },

    failureMessage(engine) {
        const enemy = engine.getUnit('enemy1');
        const dog = engine.getUnit('dog1');
        const ENEMY_ORIGINAL_Y = 5 * CELL + 50 + 130;
        const stun = enemy?.buffs.find((b) => b._type === 'stun') as StunnedBuff | undefined;
        return (
            `enemy hp=${enemy?.hp}/${enemy?.maxHp} ` +
            `enemy y=${enemy?.y.toFixed(0)} (orig=${ENEMY_ORIGINAL_Y}) ` +
            `stun=${stun ? stun.duration.value.toFixed(2) : 'none'} ` +
            `dog y=${dog?.y.toFixed(0)} (stop≤${ENEMY_ORIGINAL_Y + 30})`
        );
    },
};

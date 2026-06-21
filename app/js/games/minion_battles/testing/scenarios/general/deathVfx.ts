/**
 * Death VFX E2E scenarios — verify the migrated onDeathVisualEffects system.
 *
 * Scenario A — death_vfx_unit_def_effects_fire:
 *   Kill a slime and a boar (both with hp=1) in the same battle.
 *   Slime death should produce a DarkCreatureIconDeath effect (darkCreatureIconFlash VFX).
 *   Boar death should produce ParticleImage effects (particleRing VFX).
 *
 * Scenario B — death_vfx_alpha_wolf_unchanged:
 *   Kill an alpha wolf (hp=1). The _builtin_alpha_wolf_death world modifier
 *   should fire the story pause (exclusive rule, no onDeathVisualEffects on the unit def).
 *   Assert engine.storyPauseActive === true after the kill.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { installWorldModifiersForTest } from '../../harness/installWorldModifiers';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { UnitTag } from '../../../game/units/unitTag';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

// ============================================================================
// Scenario A — death_vfx_unit_def_effects_fire
// ============================================================================

// Player at col 3 — enemies stacked at col 4 (40 px away, within Strong Punch ~50 px range).
const VFX_PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 }; // (140, 140)
const SLIME_POS      = { x: VFX_PLAYER_POS.x + 40, y: VFX_PLAYER_POS.y };  // (180, 140)
// Boar is slightly to the right so each gets hit by a separate punch.
const BOAR_POS       = { x: VFX_PLAYER_POS.x + 40, y: VFX_PLAYER_POS.y + 1 }; // (180, 141) — same tile, slight offset

// Tick at which the second punch fires (after the slime is dead).
const SECOND_PUNCH_TICK = 80;
// Third wait order to prevent idle exit before the boar dies.
const THIRD_WAIT_TICK = 160;

export const deathVfxUnitDefEffectsFireScenario: ScenarioDefinition = {
    id: 'death_vfx_unit_def_effects_fire',
    title: 'Death VFX: slime produces DarkCreatureIconDeath, boar produces ParticleImage',
    category: 'general',
    generalSection: 'Death VFX',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: P });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: VFX_PLAYER_POS.x,
            y: VFX_PLAYER_POS.y,
            abilities: ['0117'],
        });

        // Slime — darkCreatureIconFlash VFX (DarkCreatureIconDeath + ParticleImage)
        const slime = createUnitFromSpawnConfig(
            {
                id: 'vfx_test_slime',
                characterId: 'slime',
                name: 'Slime',
                x: SLIME_POS.x,
                y: SLIME_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
            },
            engine.eventBus,
            engine,
        );
        slime.hp = 1; // guaranteed one-hit kill
        initializeAbilityRuntimeForUnit(slime);
        engine.addUnit(slime, 'initialGameSpawn');

        // Boar — particleRing VFX (ParticleImage only)
        const boar = createUnitFromSpawnConfig(
            {
                id: 'vfx_test_boar',
                characterId: 'boar',
                name: 'Boar',
                x: BOAR_POS.x,
                y: BOAR_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
            },
            engine.eventBus,
            engine,
        );
        boar.hp = 1; // guaranteed one-hit kill
        initializeAbilityRuntimeForUnit(boar);
        engine.addUnit(boar, 'initialGameSpawn');

        // Second punch kills the boar after the slime is dead.
        engine.state.orderMgr.queueOrder(SECOND_PUNCH_TICK, {
            unitId: player.id,
            abilityId: '0117',
            targets: [{ type: 'pixel', position: BOAR_POS }],
        });
        // Keep runner alive while punches resolve.
        engine.state.orderMgr.queueOrder(THIRD_WAIT_TICK, {
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        // First punch aimed at the slime.
        return [{ unitId: player.id, abilityId: '0117', targets: [{ type: 'pixel', position: SLIME_POS }] }];
    },

    assertPass(engine) {
        const hasDarkCreatureIconDeath = engine.effects.some(
            (e) => e.effectType === 'DarkCreatureIconDeath',
        );
        const hasParticleImage = engine.effects.some(
            (e) => e.effectType === 'ParticleImage',
        );
        return hasDarkCreatureIconDeath && hasParticleImage;
    },

    failureMessage(engine) {
        const effectTypes = [...new Set(engine.effects.map((e) => e.effectType))].join(', ');
        const slime = engine.getUnit('vfx_test_slime');
        const boar = engine.getUnit('vfx_test_boar');
        const hasDark = engine.effects.some((e) => e.effectType === 'DarkCreatureIconDeath');
        const hasParticle = engine.effects.some((e) => e.effectType === 'ParticleImage');
        return (
            `DarkCreatureIconDeath=${hasDark} ParticleImage=${hasParticle}` +
            ` | effectTypes=[${effectTypes}]` +
            ` | slime alive=${slime?.isAlive() ?? false} hp=${slime?.hp ?? 'gone'}` +
            ` | boar alive=${boar?.isAlive() ?? false} hp=${boar?.hp ?? 'gone'}`
        );
    },
};

// ============================================================================
// Scenario B — death_vfx_alpha_wolf_unchanged
// ============================================================================

const WOLF_PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 }; // (140, 140)
// Wolf 40 px to the right — within Strong Punch range.
const WOLF_POS        = { x: WOLF_PLAYER_POS.x + 40, y: WOLF_PLAYER_POS.y }; // (180, 140)

export const deathVfxAlphaWolfUnchangedScenario: ScenarioDefinition = {
    id: 'death_vfx_alpha_wolf_unchanged',
    title: 'Death VFX: alpha wolf death triggers story pause (world modifier path unchanged)',
    category: 'general',
    generalSection: 'Death VFX',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: P });

        // Install builtins so _builtin_alpha_wolf_death fires on unit_died.
        installWorldModifiersForTest(engine);

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: WOLF_PLAYER_POS.x,
            y: WOLF_PLAYER_POS.y,
            abilities: ['0117'],
        });

        const wolf = createUnitFromSpawnConfig(
            {
                id: 'death_vfx_alpha_wolf',
                characterId: 'alpha_wolf',
                name: 'Beast',
                x: WOLF_POS.x,
                y: WOLF_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitTags: [UnitTag.Boss],
            },
            engine.eventBus,
            engine,
        );
        wolf.hp = 1; // guaranteed one-hit kill
        initializeAbilityRuntimeForUnit(wolf);
        engine.addUnit(wolf, 'initialGameSpawn');

        // Keep runner alive while the punch animation resolves.
        engine.state.orderMgr.queueOrder(80, {
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: '0117', targets: [{ type: 'pixel', position: WOLF_POS }] }];
    },

    assertPass(engine) {
        return engine.storyPauseActive === true;
    },

    failureMessage(engine) {
        const wolf = engine.getUnit('death_vfx_alpha_wolf');
        const effectTypes = [...new Set(engine.effects.map((e) => e.effectType))].join(', ');
        return (
            `storyPauseActive=${engine.storyPauseActive}` +
            ` | wolf alive=${wolf?.isAlive() ?? false} hp=${wolf?.hp ?? 'gone'}` +
            ` | effects=[${effectTypes}]`
        );
    },
};

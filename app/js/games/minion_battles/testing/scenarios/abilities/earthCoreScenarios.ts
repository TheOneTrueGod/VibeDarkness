import type { ScenarioDefinition } from '../../types';
import type { EngineContext } from '../../../game/EngineContext';
import { TerrainType } from '../../../terrain/TerrainType';
import { Resonance } from '../../../resources/Resonance';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import {
    grantEarthCoreArmourFromSource,
    getEarthCoreArmour as getEarthCoreArmourBySources,
} from '../../../abilities/earthCoreArmour';
import {
    addEarthCoreArmour,
    getEarthCoreArmour,
} from '../../../card_defs/05_earth_core/0527_EarthCoreShared/earthCoreArmour';
import {
    EARTHERN_PUNCH_ABILITY_ID,
    SHAKING_GROUND_ABILITY_ID,
    SHATTER_ABILITY_ID,
    IMPACT_CONVERSION_PASSIVE_ID,
    BEDROCK_SCAVENGER_PASSIVE_ID,
    DEEP_RESONANCE_PASSIVE_ID,
    getTremorsenseRadiusTilesForUnit,
} from '../../../abilities/earthCoreMeleePassives';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
// Player at grid cell (3,5); dummy at cell (5,5) = 80px apart
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 }; // (140, 220)
const DUMMY_POS  = { x: 5 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 }; // (220, 220)

// ---------------------------------------------------------------------------
// 0524 â€” Earthern Punch
// ---------------------------------------------------------------------------

export const earthCoreEarthernPunchScenario: ScenarioDefinition = {
    id: 'earth_core_0524_earthern_punch',
    title: 'Earthern Punch (0524) deals 12 base damage',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_POS,
            dummyWorld: DUMMY_POS,
            abilities: [EARTHERN_PUNCH_ABILITY_ID],
        });
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        return [{ unitId: u.id, abilityId: EARTHERN_PUNCH_ABILITY_ID, targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }] }];
    },
    assertPass(e) {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.maxHp - d.hp >= 12);
    },
    failureMessage(e) {
        const d = e.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp, expected â‰¥12`;
    },
};

// ---------------------------------------------------------------------------
// 0525 â€” Shaking Ground (requires Resonance â‰¥ 25)
// ---------------------------------------------------------------------------

export const earthCoreShakingGroundScenario: ScenarioDefinition = {
    id: 'earth_core_0525_shaking_ground',
    title: 'Shaking Ground (0525) deals 10 AoE damage',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_POS,
            dummyWorld: DUMMY_POS,
            abilities: [SHAKING_GROUND_ABILITY_ID],
        });
        const player = engine.getLocalPlayerUnit()!;
        const res = new Resonance();
        player.attachResource(res, engine.eventBus);
        res.add(50);
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        return [{ unitId: u.id, abilityId: SHAKING_GROUND_ABILITY_ID, targets: [] }];
    },
    assertPass(e) {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.maxHp - d.hp >= 10);
    },
    failureMessage(e) {
        const d = e.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp, expected â‰¥10`;
    },
};

// ---------------------------------------------------------------------------
// 0526 â€” Shatter (scales with caster armour; requires Resonance â‰¥ 35)
// ---------------------------------------------------------------------------

export const earthCoreShatterScenario: ScenarioDefinition = {
    id: 'earth_core_0526_shatter_armour_bonus',
    title: 'Shatter (0526) deals 6 + 2Ã— armour damage',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_POS,
            dummyWorld: DUMMY_POS,
            abilities: [SHATTER_ABILITY_ID],
        });
        const player = engine.getLocalPlayerUnit()!;
        const res = new Resonance();
        player.attachResource(res, engine.eventBus);
        res.add(50);
        // 5 armour â†’ 6 + 2Ã—5 = 16 damage expected
        grantEarthCoreArmourFromSource(player, 'test', 5, 10);
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        return [{ unitId: u.id, abilityId: SHATTER_ABILITY_ID, targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }] }];
    },
    assertPass(e) {
        const d = e.getUnit('target_dummy');
        // Base 6 + 2Ã—5 armour = 16; assert more than plain base
        return Boolean(d && d.maxHp - d.hp >= 16);
    },
    failureMessage(e) {
        const d = e.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp, expected â‰¥16 (6 + 2Ã—5 armour)`;
    },
    describeState(e) {
        const p = e.getLocalPlayerUnit();
        const d = e.getUnit('target_dummy');
        const res = p?.getResource('resonance');
        const arm = p ? getEarthCoreArmourBySources(p) : '?';
        const rt = p?.abilityRuntime[SHATTER_ABILITY_ID];
        return `res=${res?.current ?? '?'} arm=${arm} rt.uses=${rt?.currentUses ?? '?'} dummy.hp=${d?.hp ?? '?'} ticks=${e.gameTick}`;
    },
};

// ---------------------------------------------------------------------------
// 0530 â€” Stone Tomb (projectile deals 5 damage on hit)
// ---------------------------------------------------------------------------

export const earthCoreStoneTombScenario: ScenarioDefinition = {
    id: 'earth_core_0530_stone_tomb',
    title: 'Stone Tomb (0530) projectile deals 5 damage',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_POS,
            dummyWorld: DUMMY_POS,
            abilities: ['0530'],
        });
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        return [{ unitId: u.id, abilityId: '0530', targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }] }];
    },
    assertPass(e) {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.maxHp - d.hp >= 5);
    },
    failureMessage(e) {
        const d = e.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp, expected â‰¥5`;
    },
};

// ---------------------------------------------------------------------------
// 0531 â€” Knock (stonephase projectile deals 6 damage)
// ---------------------------------------------------------------------------

export const earthCoreKnockScenario: ScenarioDefinition = {
    id: 'earth_core_0531_knock',
    title: 'Knock (0531) projectile deals 6 damage',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_POS,
            dummyWorld: DUMMY_POS,
            abilities: ['0531'],
        });
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        return [{ unitId: u.id, abilityId: '0531', targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }] }];
    },
    assertPass(e) {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.maxHp - d.hp >= 6);
    },
    failureMessage(e) {
        const d = e.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp, expected â‰¥6`;
    },
    describeState(e) {
        const p = e.getLocalPlayerUnit();
        const d = e.getUnit('target_dummy');
        const rt = p?.abilityRuntime['0531'];
        return `rt.uses=${rt?.currentUses ?? '?'} dummy.hp=${d?.hp ?? '?'} projs=${e.projectiles.length} ticks=${e.gameTick}`;
    },
};

// ---------------------------------------------------------------------------
// 0532 â€” Anchored Tremor (ramping pulse damage; 4 pulses = 3+5+7+9 = 24)
// ---------------------------------------------------------------------------

export const earthCoreAnchoredTremorScenario: ScenarioDefinition = {
    id: 'earth_core_0532_anchored_tremor',
    title: 'Anchored Tremor (0532) deals ramping pulse damage',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_POS,
            dummyWorld: DUMMY_POS,
            abilities: ['0532'],
        });
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        // Target the pulse center at the dummy so all pulses hit it
        return [{ unitId: u.id, abilityId: '0532', targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }] }];
    },
    assertPass(e) {
        const d = e.getUnit('target_dummy');
        // 4 pulses: 3+5+7+9 = 24 total; assert at least 2 pulses landed (>= 8)
        return Boolean(d && d.maxHp - d.hp >= 8);
    },
    failureMessage(e) {
        const d = e.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp, expected â‰¥8 (at least 2 ramping pulses)`;
    },
};

// ---------------------------------------------------------------------------
// 0533 â€” Stoney Punch (baseline: 4 damage with no armour)
// ---------------------------------------------------------------------------

export const earthCoreStoneyPunchBaselineScenario: ScenarioDefinition = {
    id: 'earth_core_0533_stoney_punch_baseline',
    title: 'Stoney Punch (0533) baseline 4 damage (no armour)',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_POS,
            dummyWorld: DUMMY_POS,
            abilities: ['0533'],
        });
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        return [{ unitId: u.id, abilityId: '0533', targets: [{ type: 'unit' as const, unitId: d.id }] }];
    },
    assertPass(e) {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.maxHp - d.hp === 4);
    },
    failureMessage(e) {
        const d = e.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp, expected exactly 4 (base, no armour)`;
    },
};

// ---------------------------------------------------------------------------
// 0533 â€” Stoney Punch (with armour: consumes 4 armour for +8 bonus = 12 total)
// ---------------------------------------------------------------------------

export const earthCoreStoneyPunchArmourScenario: ScenarioDefinition = {
    id: 'earth_core_0533_stoney_punch_armour',
    title: 'Stoney Punch (0533) consumes armour for bonus damage',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_POS,
            dummyWorld: DUMMY_POS,
            abilities: ['0533'],
        });
        const player = engine.getLocalPlayerUnit()!;
        addEarthCoreArmour(player, 4); // 4 Ã— 2 = 8 bonus â†’ 4 + 8 = 12 total
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        return [{ unitId: u.id, abilityId: '0533', targets: [{ type: 'unit' as const, unitId: d.id }] }];
    },
    assertPass(e) {
        const player = e.getLocalPlayerUnit();
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.maxHp - d.hp >= 12 && player && getEarthCoreArmour(player) === 0);
    },
    failureMessage(e) {
        const player = e.getLocalPlayerUnit();
        const d = e.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp (expected â‰¥12), armour remaining=${player ? getEarthCoreArmour(player) : '?'} (expected 0)`;
    },
};

// ---------------------------------------------------------------------------
// 0534 â€” Boar Claws (dash through dummy deals 5 damage)
// ---------------------------------------------------------------------------

export const earthCoreBoarClawsScenario: ScenarioDefinition = {
    id: 'earth_core_0534_boar_claws',
    title: 'Boar Claws (0534) dash deals 5 damage',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_POS,
            dummyWorld: DUMMY_POS,
            abilities: ['0534'],
        });
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        // Dash target is past the dummy so the player passes through it
        return [{ unitId: u.id, abilityId: '0534', targets: [{ type: 'pixel' as const, position: { x: DUMMY_POS.x + 80, y: DUMMY_POS.y } }] }];
    },
    assertPass(e) {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.maxHp - d.hp >= 5);
    },
    failureMessage(e) {
        const d = e.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp, expected â‰¥5 from dash contact`;
    },
};

// ---------------------------------------------------------------------------
// 0521 â€” Impact Conversion (resonance gained when armour is removed by damage)
// ---------------------------------------------------------------------------

export const earthCoreImpactConversionScenario: ScenarioDefinition = {
    id: 'earth_core_0521_impact_conversion',
    title: 'Impact Conversion (0521) gains resonance when armour is removed',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: [IMPACT_CONVERSION_PASSIVE_ID],
        });
        // Attach resonance so the listener can add to it
        const res = new Resonance();
        player.attachResource(res, engine.eventBus);
        // Give player 5 armour (sources system â€” consumed by takeDamage)
        grantEarthCoreArmourFromSource(player, 'test', 5, 10);

        // Attacker positioned close enough to punch
        const attacker = createUnitFromSpawnConfig(
            {
                id: 'attacker',
                characterId: 'alpha_wolf',
                name: 'Attacker',
                x: PLAYER_POS.x + 40,
                y: PLAYER_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: ['0120'],
            },
            engine.eventBus,
            engine,
        );
        initializeAbilityRuntimeForUnit(attacker);
        engine.addUnit(attacker, 'initialGameSpawn');

        return engine;
    },
    getInitialOrders(engine) {
        const attacker = engine.getUnit('attacker')!;
        return [{ unitId: attacker.id, abilityId: '0120', targets: [{ type: 'pixel' as const, position: PLAYER_POS }] }];
    },
    assertPass(e) {
        const player = e.getLocalPlayerUnit();
        if (!player) return false;
        const res = player.getResource('resonance');
        return Boolean(res && res.current > 0);
    },
    failureMessage(e) {
        const player = e.getLocalPlayerUnit();
        const res = player?.getResource('resonance');
        const armourLeft = player ? getEarthCoreArmourBySources(player) : '?';
        return `resonance=${res?.current ?? 0} (expected >0), armour remaining=${armourLeft}`;
    },
};

// ---------------------------------------------------------------------------
// 0522 â€” Bedrock Scavenger (armour granted at round start from nearby stone)
// ---------------------------------------------------------------------------

export const earthCoreBedrockScavengerScenario: ScenarioDefinition = {
    id: 'earth_core_0522_bedrock_scavenger',
    title: 'Bedrock Scavenger (0522) grants armour from nearby stone at round start',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_POS,
            dummyWorld: DUMMY_POS,
            abilities: [BEDROCK_SCAVENGER_PASSIVE_ID],
        });
        // Player at grid cell (3,5); set two adjacent cells to Rock (within 1.5-tile tremorsense)
        engine.terrainManager!.grid.set(3, 4, TerrainType.Rock); // dx=0, dy=-1 â†’ dist=1
        engine.terrainManager!.grid.set(4, 4, TerrainType.Rock); // dx=1, dy=-1 â†’ distâ‰ˆ1.41

        // Manually fire round-start on the player to trigger the passive
        const player = engine.getLocalPlayerUnit()!;
        player.onRoundStart(1, engine as unknown as EngineContext);
        return engine;
    },
    getInitialOrders() {
        return [];
    },
    assertPass(e) {
        const player = e.getLocalPlayerUnit();
        return Boolean(player && getEarthCoreArmourBySources(player) >= 1);
    },
    failureMessage(e) {
        const player = e.getLocalPlayerUnit();
        return `armour=${player ? getEarthCoreArmourBySources(player) : '?'}, expected â‰¥1 from bedrock_scavenger`;
    },
};

// ---------------------------------------------------------------------------
// 0523 â€” Deep Resonance (extends tremorsense radius by 1 tile)
// ---------------------------------------------------------------------------

export const earthCoreDeepResonanceScenario: ScenarioDefinition = {
    id: 'earth_core_0523_deep_resonance',
    title: 'Deep Resonance (0523) increases tremorsense radius to 2.5 tiles',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_POS,
            dummyWorld: DUMMY_POS,
            abilities: [DEEP_RESONANCE_PASSIVE_ID],
        });
        return engine;
    },
    getInitialOrders() {
        return [];
    },
    assertPass(e) {
        const player = e.getLocalPlayerUnit();
        if (!player) return false;
        // Base radius = 1.5 tiles; Deep Resonance adds 1 â†’ 2.5
        return getTremorsenseRadiusTilesForUnit(player) === 2.5;
    },
    failureMessage(e) {
        const player = e.getLocalPlayerUnit();
        return `tremorsense radius=${player ? getTremorsenseRadiusTilesForUnit(player) : '?'}, expected 2.5`;
    },
};

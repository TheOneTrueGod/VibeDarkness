import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import type { Unit } from '../../../game/units/Unit';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { CORE_ITEM_IDS } from '../../../character_defs/items';
import { CRYSTAL_ROCKS_TREE_ID, CRYSTAL_ROCKS_NODE_BASE } from '../../../../../researchTrees/trees/crystal_rocks';
import { STICK_SWORD_TREE_ID } from '../../../../../researchTrees/trees/stick_sword';
import { TECH_SHIELD_TREE_ID, TECH_SHIELD_NODE_BASE } from '../../../../../researchTrees/trees/tech_shield';

/**
 * Loadout scenarios: equipment + STORED research are resolved exactly as the battle path does
 * (`placePlayerFromLoadout` -> `resolveCharacterLoadout` / `activeResearchByPlayer`), then the
 * resulting abilities are cast in a tiny battle. Equipment sections are the general "Equipment"
 * group.
 */

const P = TINY_BATTLE_PLAYER_ID;
const SECTION = 'Equipment';

const BASIC_CORE = CORE_ITEM_IDS.BasicCore;
const EARTH_CORE = CORE_ITEM_IDS.EarthCore;
const ROCKS = '001';
const STICK = '002';
const POT_LID = '003';

const PLAYER_POS = { x: 100, y: 120 };
/** Far enough that only a thrown projectile reaches it. */
const FAR_DUMMY_POS = { x: 260, y: 120 };
/** Inside Swing Stick's reach. */
const NEAR_DUMMY_POS = { x: 145, y: 120 };

const ROCK_THROW_IDS = ['throw_rock', 'throw_charged_rock', 'throw_knife', 'earth_core_throw_rock'];

function loadoutEngine(): GameEngine {
    return buildTinyBattleEngine({ gridW: 10, gridH: 6, localPlayerId: P, grass: true });
}

function dummyLoss(e: GameEngine): number {
    const d = e.getUnit('target_dummy');
    return d ? d.maxHp - d.hp : 0;
}

function pixelOrder(e: GameEngine, abilityId: string) {
    const u = e.getLocalPlayerUnit()!;
    const d = e.getUnit('target_dummy')!;
    return [{ unitId: u.id, abilityId, targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }] }];
}

/** Ability ids the loadout resolver produced, recorded per scenario at build time. */
const resolvedAbilityIds: Record<string, string[]> = {};

// ---------------------------------------------------------------------------
// Chip's bug: Rocks + charged_rocks must give a working Throw Charged Rock.
// Also proves the engine's Charged Rocks light pulse reads the active research.
// ---------------------------------------------------------------------------

const ROCKS_ID = 'loadout_rocks_charged_rock_hits';
/** Uses removed before the cast, so the round-start light pulse has something to recover. */
let rocksStartUses = 0;

export const loadoutRocksChargedRockHitsScenario: ScenarioDefinition = {
    id: ROCKS_ID,
    title: 'Loadout: Rocks + Charged Rocks research casts Throw Charged Rock and hits (no Swing Stick)',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 6000,
    buildEngine() {
        const engine = loadoutEngine();
        const { player, abilityIds } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER_POS,
            equipment: [BASIC_CORE, ROCKS],
            researchTrees: { [CRYSTAL_ROCKS_TREE_ID]: [CRYSTAL_ROCKS_NODE_BASE, 'charged_rocks'] },
        });
        resolvedAbilityIds[ROCKS_ID] = abilityIds;
        placeTargetDummy(engine, FAR_DUMMY_POS);
        // Leave one use spent: the Charged Rocks pulse (read from ENGINE research) recovers it at
        // round start, the cast spends another, so the net is one use down from full.
        const rt = player.abilityRuntime['throw_charged_rock'];
        if (rt) {
            rt.currentUses = Math.max(0, rt.maxUses - 1);
            rocksStartUses = rt.currentUses;
        }
        return engine;
    },
    getInitialOrders(e) {
        return pixelOrder(e, 'throw_charged_rock');
    },
    assertPass(e) {
        const ids = resolvedAbilityIds[ROCKS_ID] ?? [];
        const rt = e.getLocalPlayerUnit()?.abilityRuntime['throw_charged_rock'];
        return ids.includes('throw_charged_rock')
            && !ids.includes('throw_rock')
            && !ids.includes('0103')
            && dummyLoss(e) > 0
            // Cast spent one use, pulse recovered one: exactly the pre-cast count.
            && rt?.currentUses === rocksStartUses;
    },
    failureMessage(e) {
        const ids = resolvedAbilityIds[ROCKS_ID] ?? [];
        const rt = e.getLocalPlayerUnit()?.abilityRuntime['throw_charged_rock'];
        return `abilities=[${ids.join(',')}] dummy lost ${dummyLoss(e)} hp (want >0); throw_charged_rock uses=${rt?.currentUses ?? '?'} (want ${rocksStartUses}: cast -1, light pulse +1)`;
    },
};

// ---------------------------------------------------------------------------
// Swapping weapons ignores the old weapon's research (kept in storage, inactive).
// ---------------------------------------------------------------------------

const STICK_ID = 'loadout_swapped_weapon_ignores_old_research';

export const loadoutSwappedWeaponIgnoresOldResearchScenario: ScenarioDefinition = {
    id: STICK_ID,
    title: 'Loadout: Stick equipped with stored Charged Rocks research swings the stick and gets no light pulse',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 6000,
    buildEngine() {
        const engine = loadoutEngine();
        const { player, abilityIds } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER_POS,
            equipment: [BASIC_CORE, STICK],
            // Stale rocks research from before the weapon swap: stored, but inactive.
            researchTrees: {
                [CRYSTAL_ROCKS_TREE_ID]: [CRYSTAL_ROCKS_NODE_BASE, 'charged_rocks'],
                [STICK_SWORD_TREE_ID]: [],
            },
        });
        resolvedAbilityIds[STICK_ID] = abilityIds;
        placeTargetDummy(engine, NEAR_DUMMY_POS);
        // Sentinel for the light pulse: Throw Charged Rock accepts light charges while it is below
        // max uses. It is added AFTER the loadout is recorded (the loadout itself has no rock
        // throw). If the engine still held the stale charged_rocks research, the round-start pulse
        // would recover a use here.
        player.abilities.push('throw_charged_rock');
        initializeAbilityRuntimeForUnit(player);
        const sentinel = player.abilityRuntime['throw_charged_rock'];
        if (sentinel) sentinel.currentUses = 0;
        return engine;
    },
    getInitialOrders(e) {
        return pixelOrder(e, '0103');
    },
    assertPass(e) {
        const ids = resolvedAbilityIds[STICK_ID] ?? [];
        const player = e.getLocalPlayerUnit();
        const sentinel = player?.abilityRuntime['throw_charged_rock'];
        return ids.includes('0103')
            && !ROCK_THROW_IDS.some((id) => ids.includes(id))
            && e.getPlayerResearchNodes(P, CRYSTAL_ROCKS_TREE_ID).every((n) => n !== 'charged_rocks')
            && dummyLoss(e) > 0
            && sentinel?.currentUses === 0
            && (sentinel.recoveryChargesByType['lightCharge'] ?? 0) === 0;
    },
    failureMessage(e) {
        const ids = resolvedAbilityIds[STICK_ID] ?? [];
        const sentinel = e.getLocalPlayerUnit()?.abilityRuntime['throw_charged_rock'];
        return `abilities=[${ids.join(',')}] (want 0103, no rock throw); engine crystal_rocks=[${e.getPlayerResearchNodes(P, CRYSTAL_ROCKS_TREE_ID).join(',')}] (want no charged_rocks); dummy lost ${dummyLoss(e)} hp (want >0); sentinel uses=${sentinel?.currentUses ?? '?'} lightCharge=${sentinel?.recoveryChargesByType['lightCharge'] ?? 0} (want 0/0: no Charged Rocks pulse)`;
    },
};

// ---------------------------------------------------------------------------
// Shield research chain: Crystal Embedded Shield then Charged Shield -> 0113 + 0121.
// ---------------------------------------------------------------------------

const SHIELD_ID = 'loadout_shield_research_chain';

export const loadoutShieldResearchChainScenario: ScenarioDefinition = {
    id: SHIELD_ID,
    title: 'Loadout: Pot lid + shield research chain gives Absorption Shield (0113) and 0121, and 0113 resolves',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 5000,
    buildEngine() {
        const engine = loadoutEngine();
        const { abilityIds } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER_POS,
            equipment: [BASIC_CORE, POT_LID],
            researchTrees: {
                [TECH_SHIELD_TREE_ID]: [
                    TECH_SHIELD_NODE_BASE,
                    'crystal_embedded_shield',
                    'throwing_crystal_shield',
                ],
            },
        });
        resolvedAbilityIds[SHIELD_ID] = abilityIds;
        placeTargetDummy(engine, FAR_DUMMY_POS);
        return engine;
    },
    getInitialOrders(e) {
        return pixelOrder(e, '0113');
    },
    assertPass(e) {
        const ids = resolvedAbilityIds[SHIELD_ID] ?? [];
        const rt = e.getLocalPlayerUnit()?.abilityRuntime['0113'];
        return ids.includes('0113')
            && ids.includes('0121')
            && !ids.includes('0104')
            && !ids.includes('0110')
            // The cast resolved: it spent a use.
            && Boolean(rt && rt.currentUses < rt.maxUses);
    },
    failureMessage(e) {
        const ids = resolvedAbilityIds[SHIELD_ID] ?? [];
        const rt = e.getLocalPlayerUnit()?.abilityRuntime['0113'];
        return `abilities=[${ids.join(',')}] (want 0113 + 0121, no 0104/0110); 0113 uses=${rt?.currentUses ?? '?'}/${rt?.maxUses ?? '?'} (want a spent use after the cast)`;
    },
};

// ---------------------------------------------------------------------------
// Earth Core keeps the Charged Rock throw when Rocks + charged_rocks are present.
// ---------------------------------------------------------------------------

const EARTH_ROCKS_ID = 'loadout_earth_core_keeps_charged_rock';

export const loadoutEarthCoreKeepsChargedRockScenario: ScenarioDefinition = {
    id: EARTH_ROCKS_ID,
    title: 'Loadout: Earth Core + Rocks + Charged Rocks throws a Charged Rock (not the Earth Core rock throw)',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 6000,
    buildEngine() {
        const engine = loadoutEngine();
        const { abilityIds } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER_POS,
            equipment: [EARTH_CORE, ROCKS],
            researchTrees: { [CRYSTAL_ROCKS_TREE_ID]: [CRYSTAL_ROCKS_NODE_BASE, 'charged_rocks'] },
        });
        resolvedAbilityIds[EARTH_ROCKS_ID] = abilityIds;
        placeTargetDummy(engine, FAR_DUMMY_POS);
        return engine;
    },
    getInitialOrders(e) {
        return pixelOrder(e, 'throw_charged_rock');
    },
    assertPass(e) {
        const ids = resolvedAbilityIds[EARTH_ROCKS_ID] ?? [];
        return ids.includes('throw_charged_rock')
            && !ids.includes('throw_rock')
            && !ids.includes('earth_core_throw_rock')
            && dummyLoss(e) > 0;
    },
    failureMessage(e) {
        const ids = resolvedAbilityIds[EARTH_ROCKS_ID] ?? [];
        return `abilities=[${ids.join(',')}] (want throw_charged_rock only); dummy lost ${dummyLoss(e)} hp (want >0)`;
    },
};

// ---------------------------------------------------------------------------
// Earth Core no longer grants a bonus rock throw.
// ---------------------------------------------------------------------------

const EARTH_STICK_ID = 'loadout_earth_core_no_bonus_rock';

export const loadoutEarthCoreNoBonusRockScenario: ScenarioDefinition = {
    id: EARTH_STICK_ID,
    title: 'Loadout: Earth Core + Stick has no rock throw, and Swing Stick still hits',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 6000,
    buildEngine() {
        const engine = loadoutEngine();
        const { abilityIds } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER_POS,
            equipment: [EARTH_CORE, STICK],
            researchTrees: {},
        });
        resolvedAbilityIds[EARTH_STICK_ID] = abilityIds;
        placeTargetDummy(engine, NEAR_DUMMY_POS);
        return engine;
    },
    getInitialOrders(e) {
        return pixelOrder(e, '0103');
    },
    assertPass(e) {
        const ids = resolvedAbilityIds[EARTH_STICK_ID] ?? [];
        const unit: Unit | undefined = e.getLocalPlayerUnit();
        return ids.includes('0103')
            // Earth Core's own cards are still there.
            && ids.includes('0601')
            && !ROCK_THROW_IDS.some((id) => ids.includes(id))
            && Boolean(unit?.getResource('rock'))
            && dummyLoss(e) > 0;
    },
    failureMessage(e) {
        const ids = resolvedAbilityIds[EARTH_STICK_ID] ?? [];
        return `abilities=[${ids.join(',')}] (want 0103 + 0601, no rock throw); rock resource=${e.getLocalPlayerUnit()?.getResource('rock') ? 'yes' : 'no'}; dummy lost ${dummyLoss(e)} hp (want >0)`;
    },
};

export const EQUIPMENT_LOADOUT_SCENARIOS: ScenarioDefinition[] = [
    loadoutRocksChargedRockHitsScenario,
    loadoutSwappedWeaponIgnoresOldResearchScenario,
    loadoutShieldResearchChainScenario,
    loadoutEarthCoreKeepsChargedRockScenario,
    loadoutEarthCoreNoBonusRockScenario,
];

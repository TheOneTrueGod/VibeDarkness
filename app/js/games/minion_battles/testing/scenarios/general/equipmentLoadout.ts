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
import { activeResearchByPlayer, resolveCharacterLoadout } from '../../../character_defs/characterLoadout';
import { getAbility } from '../../../abilities/AbilityRegistry';
import {
    CHARGED_ROCKS_ROOT_NODE_ID,
    WEAPONS_TREE_ID,
    NODE_MORE_POWER,
    NODE_MORE_ROCK,
    STICK_ROOT_NODE_ID,
    WEAPON_ITEM_CHARGED_ROCKS,
    WEAPON_ITEM_CHARGED_SHIELD,
    WEAPON_ITEM_CRYSTAL_SHIELD,
    WEAPON_ITEM_KNIVES,
    WEAPON_ITEM_MACE,
    WEAPON_ITEM_ROCKS,
    WEAPON_ITEM_SWORD,
} from '../../../../../researchTrees/trees/weaponTreeIds';

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
const ROCKS = WEAPON_ITEM_ROCKS;
const STICK = '002';
const CHARGED_ROCKS = WEAPON_ITEM_CHARGED_ROCKS;

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
// Charged Rocks (item 011) gives a working Throw Charged Rock and its round-start Light Charge
// (an item passive, not research).
// ---------------------------------------------------------------------------

const ROCKS_ID = 'loadout_rocks_charged_rock_hits';
/** Uses removed before the cast, so the round-start light pulse has something to recover. */
let rocksStartUses = 0;

export const loadoutRocksChargedRockHitsScenario: ScenarioDefinition = {
    id: ROCKS_ID,
    title: 'Loadout: Charged Rocks item casts Throw Charged Rock and hits (no Swing Stick)',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 6000,
    buildEngine() {
        const engine = loadoutEngine();
        const { player, abilityIds } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER_POS,
            equipment: [BASIC_CORE, CHARGED_ROCKS],
        });
        resolvedAbilityIds[ROCKS_ID] = abilityIds;
        placeTargetDummy(engine, FAR_DUMMY_POS);
        // Leave one use spent: the Charged Rocks item passive recovers it at
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
// Swapping weapons ignores the old weapon's research (kept in storage, inactive) and drops its passive.
// ---------------------------------------------------------------------------

const STICK_ID = 'loadout_swapped_weapon_ignores_old_research';

export const loadoutSwappedWeaponIgnoresOldResearchScenario: ScenarioDefinition = {
    id: STICK_ID,
    title: 'Loadout: Stick equipped with stored Charged Rocks tree research swings the stick and gets no light pulse',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 6000,
    buildEngine() {
        const engine = loadoutEngine();
        const { player, abilityIds } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER_POS,
            equipment: [BASIC_CORE, STICK],
            // Stale Charged Rocks research from before the weapon swap: stored, but inactive.
            researchTrees: {
                [WEAPONS_TREE_ID]: [CHARGED_ROCKS_ROOT_NODE_ID, NODE_MORE_POWER],
            },
        });
        resolvedAbilityIds[STICK_ID] = abilityIds;
        placeTargetDummy(engine, NEAR_DUMMY_POS);
        // Sentinel for the light pulse: Throw Charged Rock accepts light charges while it is below
        // max uses. It is added AFTER the loadout is recorded (the loadout itself has no rock
        // throw). If the unit still carried the Charged Rocks passive, the round-start pulse
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
            && e.getPlayerResearchNodes(P, WEAPONS_TREE_ID).join(',') === STICK_ROOT_NODE_ID
            && player?.roundStartRecoveryCharges.length === 0
            && dummyLoss(e) > 0
            && sentinel?.currentUses === 0
            && (sentinel.recoveryChargesByType['lightCharge'] ?? 0) === 0;
    },
    failureMessage(e) {
        const ids = resolvedAbilityIds[STICK_ID] ?? [];
        const sentinel = e.getLocalPlayerUnit()?.abilityRuntime['throw_charged_rock'];
        return `abilities=[${ids.join(',')}] (want 0103, no rock throw); engine weapons tree=[${e.getPlayerResearchNodes(P, WEAPONS_TREE_ID).join(',')}] (want ${STICK_ROOT_NODE_ID} only); dummy lost ${dummyLoss(e)} hp (want >0); sentinel uses=${sentinel?.currentUses ?? '?'} lightCharge=${sentinel?.recoveryChargesByType['lightCharge'] ?? 0} (want 0/0: no Charged Rocks pulse)`;
    },
};

// ---------------------------------------------------------------------------
// Charged Shield (item 016) -> 0113 + 0121.
// ---------------------------------------------------------------------------

const SHIELD_ID = 'loadout_shield_research_chain';

export const loadoutShieldResearchChainScenario: ScenarioDefinition = {
    id: SHIELD_ID,
    title: 'Loadout: Charged Shield item gives Absorption Shield (0113) and 0121, and 0113 resolves',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 5000,
    buildEngine() {
        const engine = loadoutEngine();
        const { abilityIds } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER_POS,
            equipment: [BASIC_CORE, WEAPON_ITEM_CHARGED_SHIELD],
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
// Earth Core keeps the Charged Rock throw when Charged Rocks is equipped.
// ---------------------------------------------------------------------------

const EARTH_ROCKS_ID = 'loadout_earth_core_keeps_charged_rock';

export const loadoutEarthCoreKeepsChargedRockScenario: ScenarioDefinition = {
    id: EARTH_ROCKS_ID,
    title: 'Loadout: Earth Core + Charged Rocks throws a Charged Rock (not the Earth Core rock throw)',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 6000,
    buildEngine() {
        const engine = loadoutEngine();
        const { abilityIds } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER_POS,
            equipment: [EARTH_CORE, CHARGED_ROCKS],
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

// ---------------------------------------------------------------------------
// Each tier-2 / tier-3 item alone yields its card(s).
// ---------------------------------------------------------------------------

const TIER_CARDS_ID = 'loadout_equipment_items_yield_cards';

const ITEM_CARD_EXPECTATIONS: { itemId: string; has: string[]; hasNot: string[] }[] = [
    { itemId: WEAPON_ITEM_CHARGED_ROCKS, has: ['throw_charged_rock'], hasNot: ['throw_rock'] },
    { itemId: WEAPON_ITEM_KNIVES, has: ['throw_knife'], hasNot: ['throw_rock'] },
    { itemId: WEAPON_ITEM_SWORD, has: ['0112'], hasNot: ['0103'] },
    { itemId: WEAPON_ITEM_MACE, has: ['0115'], hasNot: ['0103'] },
    { itemId: WEAPON_ITEM_CRYSTAL_SHIELD, has: ['0110'], hasNot: ['0104'] },
    { itemId: WEAPON_ITEM_CHARGED_SHIELD, has: ['0113', '0121'], hasNot: ['0104', '0110'] },
];

function tierItemCardProblems(): string[] {
    const problems: string[] = [];
    for (const { itemId, has, hasNot } of ITEM_CARD_EXPECTATIONS) {
        const ids = resolveCharacterLoadout([BASIC_CORE, itemId], undefined).abilityIds;
        for (const id of has) if (!ids.includes(id)) problems.push(`${itemId} missing ${id}`);
        for (const id of hasNot) if (ids.includes(id)) problems.push(`${itemId} unexpectedly has ${id}`);
    }
    return problems;
}

export const loadoutEquipmentItemsYieldCardsScenario: ScenarioDefinition = {
    id: TIER_CARDS_ID,
    title: 'Loadout: each tier-2/3 weapon item alone yields its cards (Mace casts Swing Mace)',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 5000,
    buildEngine() {
        const engine = loadoutEngine();
        const { abilityIds } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER_POS,
            equipment: [BASIC_CORE, WEAPON_ITEM_MACE],
        });
        resolvedAbilityIds[TIER_CARDS_ID] = abilityIds;
        placeTargetDummy(engine, NEAR_DUMMY_POS);
        return engine;
    },
    getInitialOrders(e) {
        return pixelOrder(e, '0115');
    },
    assertPass(e) {
        const ids = resolvedAbilityIds[TIER_CARDS_ID] ?? [];
        return tierItemCardProblems().length === 0 && ids.includes('0115') && dummyLoss(e) > 0;
    },
    failureMessage(e) {
        return `problems=[${tierItemCardProblems().join('; ')}]; dummy lost ${dummyLoss(e)} hp (want >0 from Swing Mace)`;
    },
};

// ---------------------------------------------------------------------------
// Item passive: base Rocks has no round-start Light Charge (Charged Rocks does).
// ---------------------------------------------------------------------------

const ROCKS_NO_PASSIVE_ID = 'loadout_rocks_no_light_charge_passive';

export const loadoutRocksNoLightChargeScenario: ScenarioDefinition = {
    id: ROCKS_NO_PASSIVE_ID,
    title: 'Loadout: base Rocks gets no round-start Light Charge (Charged Rocks does)',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 5000,
    buildEngine() {
        const engine = loadoutEngine();
        const { player, abilityIds } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER_POS,
            equipment: [BASIC_CORE, ROCKS],
        });
        resolvedAbilityIds[ROCKS_NO_PASSIVE_ID] = abilityIds;
        placeTargetDummy(engine, FAR_DUMMY_POS);
        // Sentinel: Throw Charged Rock accepts Light Charges while below max uses.
        player.abilities.push('throw_charged_rock');
        initializeAbilityRuntimeForUnit(player);
        const sentinel = player.abilityRuntime['throw_charged_rock'];
        if (sentinel) sentinel.currentUses = 0;
        return engine;
    },
    getInitialOrders(e) {
        return pixelOrder(e, 'throw_rock');
    },
    assertPass(e) {
        const player = e.getLocalPlayerUnit();
        const sentinel = player?.abilityRuntime['throw_charged_rock'];
        const charged = resolveCharacterLoadout([BASIC_CORE, CHARGED_ROCKS], undefined);
        return player?.roundStartRecoveryCharges.length === 0
            && sentinel?.currentUses === 0
            && (sentinel.recoveryChargesByType['lightCharge'] ?? 0) === 0
            && charged.abilityIds.includes('throw_charged_rock')
            && dummyLoss(e) > 0;
    },
    failureMessage(e) {
        const player = e.getLocalPlayerUnit();
        const sentinel = player?.abilityRuntime['throw_charged_rock'];
        return `passives=${player?.roundStartRecoveryCharges.length ?? '?'} (want 0); sentinel uses=${sentinel?.currentUses ?? '?'} lightCharge=${sentinel?.recoveryChargesByType['lightCharge'] ?? 0} (want 0/0); dummy lost ${dummyLoss(e)} hp (want >0)`;
    },
};

// ---------------------------------------------------------------------------
// Shared More Rock upgrade: applies with Knives, not with base Rocks.
// ---------------------------------------------------------------------------

const MORE_ROCK_ID = 'loadout_more_rock_shared_tree';
const MORE_ROCK_RESEARCH = { [WEAPONS_TREE_ID]: [NODE_MORE_ROCK] };
let moreRockOnRocks = true;

function knifeTargetCount(e: GameEngine): number {
    const player = e.getLocalPlayerUnit();
    const ability = getAbility('throw_knife');
    return player && ability?.getTargets ? ability.getTargets(player, e).length : 0;
}

export const loadoutMoreRockSharedTreeScenario: ScenarioDefinition = {
    id: MORE_ROCK_ID,
    title: 'Loadout: More Rock applies with Knives equipped and not with base Rocks (Knives throws two)',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 6000,
    buildEngine() {
        // Base Rocks: More Rock depends on Charged Rocks / Knives, so it is inactive and ignored.
        const rocksActive = activeResearchByPlayer({ [P]: [BASIC_CORE, ROCKS] }, { [P]: MORE_ROCK_RESEARCH });
        moreRockOnRocks = (rocksActive[P]?.[WEAPONS_TREE_ID] ?? []).includes(NODE_MORE_ROCK);

        const engine = loadoutEngine();
        const { abilityIds } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER_POS,
            equipment: [BASIC_CORE, WEAPON_ITEM_KNIVES],
            researchTrees: MORE_ROCK_RESEARCH,
        });
        resolvedAbilityIds[MORE_ROCK_ID] = abilityIds;
        placeTargetDummy(engine, FAR_DUMMY_POS);
        return engine;
    },
    getInitialOrders(e) {
        const u = e.getLocalPlayerUnit()!;
        const d = e.getUnit('target_dummy')!;
        const target = { type: 'pixel' as const, position: { x: d.x, y: d.y } };
        // With More Rock the knife takes two pixel targets.
        return [{ unitId: u.id, abilityId: 'throw_knife', targets: [target, target] }];
    },
    assertPass(e) {
        return !moreRockOnRocks
            && e.getPlayerResearchNodes(P, WEAPONS_TREE_ID).includes(NODE_MORE_ROCK)
            && knifeTargetCount(e) === 2
            && dummyLoss(e) > 0;
    },
    failureMessage(e) {
        return `More Rock active on base Rocks=${moreRockOnRocks} (want false); engine weapons=[${e.getPlayerResearchNodes(P, WEAPONS_TREE_ID).join(',')}] (want more_rock); knife target count=${knifeTargetCount(e)} (want 2); dummy lost ${dummyLoss(e)} hp (want >0)`;
    },
};

export const EQUIPMENT_LOADOUT_SCENARIOS: ScenarioDefinition[] = [
    loadoutEquipmentItemsYieldCardsScenario,
    loadoutRocksNoLightChargeScenario,
    loadoutMoreRockSharedTreeScenario,
    loadoutRocksChargedRockHitsScenario,
    loadoutSwappedWeaponIgnoresOldResearchScenario,
    loadoutShieldResearchChainScenario,
    loadoutEarthCoreKeepsChargedRockScenario,
    loadoutEarthCoreNoBonusRockScenario,
];

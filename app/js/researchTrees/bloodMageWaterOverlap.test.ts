import { beforeAll, describe, expect, it } from 'vitest';
import {
    BLOOD_MAGE_NODE_BURST,
    BLOOD_MAGE_NODE_CLAWS,
    BLOOD_MAGE_NODE_CORE,
    BLOOD_MAGE_NODE_FROZEN_FIELD,
    BLOOD_MAGE_NODE_ICE_CLAWS,
    BLOOD_MAGE_NODE_ICE_SHARDS,
    BLOOD_MAGE_TREE_ID,
    bloodMageTree,
} from './trees/blood_mage';
import { getAvailableResearchNodes, getMissionStartResourcesFromResearch } from './evaluator';
import { CORE_ITEM_IDS } from '../games/minion_battles/character_defs/items';
import { resolveCharacterLoadout } from '../games/minion_battles/character_defs/characterLoadout';
import { ResourceId } from '../games/minion_battles/resources/resourceIds';
import { defineAbility } from '../games/minion_battles/abilities/defineAbility';
import { registerAbilityForTest } from '../games/minion_battles/abilities/AbilityRegistry';
import { Unit } from '../games/minion_battles/game/units/Unit';
import { applyLockedAbilityModes, attachResourcesForAbilityCosts } from '../games/minion_battles/storylines/BaseMissionDef';
import {
    filterSelectableQuestPrepAbilityIds,
    mapPrepPicksThroughReplacements,
} from '../games/minion_battles/storylines/questPrepLoadout';
import { EventBus } from '../games/minion_battles/game/EventBus';
import { GameEngine } from '../games/minion_battles/game/GameEngine';
import { resetGameObjectIdCounter } from '../games/minion_battles/game/GameObject';
import { PLAYER_CHARACTER_ID } from '../games/minion_battles/game/units/unit_defs/unitDef';
import { DARK_AWAKENING } from '../games/minion_battles/storylines/WorldOfDarkness/missions/001_dark_awakening';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    TINY_BATTLE_PLAYER_ID,
} from '../games/minion_battles/testing/harness/buildTinyBattleEngine';

const EQUIPMENT = [CORE_ITEM_IDS.BloodMageCore];

/** Each ice node, the blood node it requires, the card it adds and the blood card it overlaps. */
const ICE_NODES = [
    { nodeId: BLOOD_MAGE_NODE_ICE_CLAWS, prereq: BLOOD_MAGE_NODE_CLAWS, cardId: '1501', bloodCardId: '0306' },
    { nodeId: BLOOD_MAGE_NODE_ICE_SHARDS, prereq: BLOOD_MAGE_NODE_CORE, cardId: '1502', bloodCardId: '0304' },
    { nodeId: BLOOD_MAGE_NODE_FROZEN_FIELD, prereq: BLOOD_MAGE_NODE_BURST, cardId: '1503', bloodCardId: '0302' },
] as const;

function node(id: string) {
    const found = bloodMageTree.nodes.find((n) => n.id === id);
    if (!found) throw new Error(`missing node ${id}`);
    return found;
}

/** Stored research with the ice node and every blood node on its path. */
function researchWith(nodeId: string, prereq: string): Record<string, string[]> {
    return { [BLOOD_MAGE_TREE_ID]: [...new Set([BLOOD_MAGE_NODE_CORE, prereq, nodeId])] };
}

function spawnMissionPlayer(research: Record<string, string[]>) {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
    DARK_AWAKENING.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: [...EQUIPMENT] },
        playerResearchTreesByPlayer: { p1: research },
    });
    const player = engine.units.find((u) => u.ownerId === 'p1' && u.characterId === PLAYER_CHARACTER_ID);
    if (!player) throw new Error('no player unit');
    return { engine, player };
}

describe('Blood Mage tree: Water overlap nodes', () => {
    it.each(ICE_NODES)('$nodeId requires $prereq and is offered only once it is researched', ({ nodeId, prereq }) => {
        const n = node(nodeId);
        expect(n.prereqNodeIds).toEqual([prereq]);
        expect(n.requirements).toContainEqual({ type: 'anyResearched', treeId: BLOOD_MAGE_TREE_ID, nodeIds: [prereq] });
        const ids = (research: Record<string, string[]>) =>
            getAvailableResearchNodes(research, { treeId: BLOOD_MAGE_TREE_ID }).map((a) => a.id);
        if (prereq !== BLOOD_MAGE_NODE_CORE) {
            expect(ids({ [BLOOD_MAGE_TREE_ID]: [BLOOD_MAGE_NODE_CORE] })).not.toContain(nodeId);
        }
        expect(ids({ [BLOOD_MAGE_TREE_ID]: [...new Set([BLOOD_MAGE_NODE_CORE, prereq])] })).toContain(nodeId);
    });

    it.each(ICE_NODES)('$nodeId replaces its blood card $bloodCardId with $cardId', ({ nodeId, prereq, cardId, bloodCardId }) => {
        const effects = node(nodeId).effects;
        expect(effects).toContainEqual({ type: 'replaceCard', fromCardId: bloodCardId, toCardId: cardId });
        expect(effects).not.toContainEqual({ type: 'addCard', cardId });
        const without = resolveCharacterLoadout(EQUIPMENT, researchWith(prereq, prereq));
        expect(without.abilityIds).not.toContain(cardId);
        expect(without.replacedCardIds).not.toContain(bloodCardId);
        const withNode = resolveCharacterLoadout(EQUIPMENT, researchWith(nodeId, prereq));
        expect(withNode.abilityIds).toContain(cardId);
        expect(withNode.abilityIds).not.toContain(bloodCardId);
        expect(withNode.replacedCardIds).toContain(bloodCardId);
        // Prep shows only the ice card.
        const selectable = filterSelectableQuestPrepAbilityIds(withNode.abilityIds);
        expect(selectable).toContain(cardId);
        expect(selectable).not.toContain(bloodCardId);
    });

    it('replacedCardIds lists 0306 / 0304 / 0302 with all three nodes', () => {
        const all = {
            [BLOOD_MAGE_TREE_ID]: [
                BLOOD_MAGE_NODE_CORE,
                BLOOD_MAGE_NODE_CLAWS,
                BLOOD_MAGE_NODE_BURST,
                ...ICE_NODES.map((i) => i.nodeId),
            ],
        };
        const loadout = resolveCharacterLoadout(EQUIPMENT, all);
        expect([...loadout.replacedCardIds].sort()).toEqual(['0302', '0304', '0306']);
    });

    it('a mission player with the nodes has the ice cards, no blood cards and no locked modes', () => {
        const all = {
            [BLOOD_MAGE_TREE_ID]: [
                BLOOD_MAGE_NODE_CORE,
                BLOOD_MAGE_NODE_CLAWS,
                BLOOD_MAGE_NODE_BURST,
                ...ICE_NODES.map((i) => i.nodeId),
            ],
        };
        const { engine, player } = spawnMissionPlayer(all);
        for (const { cardId, bloodCardId } of ICE_NODES) {
            expect(player.abilities).toContain(cardId);
            expect(player.abilities).not.toContain(bloodCardId);
        }
        expect(player.lockedAbilityModes).toEqual({});
        engine.destroy();
    });

    it('stale prep picks map to the replacement and de-duplicate', () => {
        const all = researchWith(BLOOD_MAGE_NODE_ICE_CLAWS, BLOOD_MAGE_NODE_CLAWS);
        expect(mapPrepPicksThroughReplacements(['0301', '0306'], all)).toEqual(['0301', '1501']);
        expect(mapPrepPicksThroughReplacements(['0306', '0301', '1501'], all)).toEqual(['1501', '0301']);
        expect(mapPrepPicksThroughReplacements(['0306', '0306'], {})).toEqual(['0306']);
    });

    it('a mission with a stale 0306 prep pick brings only 1501', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: [...EQUIPMENT] },
            playerResearchTreesByPlayer: { p1: researchWith(BLOOD_MAGE_NODE_ICE_CLAWS, BLOOD_MAGE_NODE_CLAWS) },
            missionPrepLoadoutsByPlayer: { p1: ['0306', '1501'] },
        });
        const player = engine.units.find((u) => u.ownerId === 'p1' && u.characterId === PLAYER_CHARACTER_ID)!;
        expect(player.abilities.filter((id) => id === '1501')).toHaveLength(1);
        expect(player.abilities).not.toContain('0306');
        engine.destroy();
    });

    describe('owned-card modes', () => {
        const SLOT = 'test_owned_slot';
        const BLOOD_CARD = 'test_owned_blood';
        beforeAll(() => {
            registerAbilityForTest(
                defineAbility({
                    id: SLOT,
                    name: 'Slot',
                    image: '',
                    resourceCost: null,
                    rechargeTurns: 0,
                    prefireTime: 0,
                    targets: [],
                    abilityTimings: [],
                    getTooltipText: () => ['Slot'],
                    getRange: () => ({ minRange: 0, maxRange: 100 }),
                    abilityModes: {
                        modes: ['ice', 'blood'],
                        defaultMode: 'ice',
                        modeAbilityIds: { blood: BLOOD_CARD },
                        fallbackMode: 'blood',
                        ownedCardModes: ['blood'],
                    },
                }),
            );
        });
        function unitWith(abilities: string[]): Unit {
            return new Unit({
                id: 'u', x: 0, y: 0, hp: 10, maxHp: 10, speed: 100,
                teamId: 'player', ownerId: 'p1', characterId: 'player', name: 'U', abilities,
            });
        }

        it('locks the blood mode when the character never owned the blood card', () => {
            const u = unitWith([SLOT]);
            applyLockedAbilityModes(u, { abilityIds: [SLOT], replacedCardIds: [] });
            expect(u.lockedAbilityModes).toEqual({ [SLOT]: ['blood'] });
        });

        it('keeps the blood mode when the blood card was replaced or is in the loadout', () => {
            const a = unitWith([SLOT]);
            applyLockedAbilityModes(a, { abilityIds: [SLOT], replacedCardIds: [BLOOD_CARD] });
            expect(a.lockedAbilityModes).toEqual({});
            const b = unitWith([SLOT]);
            applyLockedAbilityModes(b, { abilityIds: [SLOT, BLOOD_CARD], replacedCardIds: [] });
            expect(b.lockedAbilityModes).toEqual({});
        });
    });

    it('no Water node grants Water or attaches it through research', () => {
        const all = {
            [BLOOD_MAGE_TREE_ID]: [
                BLOOD_MAGE_NODE_CORE,
                BLOOD_MAGE_NODE_CLAWS,
                BLOOD_MAGE_NODE_BURST,
                ...ICE_NODES.map((i) => i.nodeId),
            ],
        };
        expect(getMissionStartResourcesFromResearch(all).has(ResourceId.Water)).toBe(false);
        for (const { nodeId } of ICE_NODES) {
            expect(node(nodeId).effects.map((e) => e.type)).toEqual(['replaceCard']);
        }
    });

    describe('Water attached from ability costs', () => {
        const WATER_MODE_SLOT = 'tstWaterModeSlot';
        const WATER_MODE_CARD = 'tstWaterModeCard';
        const baseAbility = {
            image: '',
            rechargeTurns: 0,
            prefireTime: 0,
            targets: [],
            abilityTimings: [],
            getTooltipText: () => ['x'],
            getRange: () => ({ minRange: 0, maxRange: 100 }),
        };
        beforeAll(() => {
            registerAbilityForTest(
                defineAbility({
                    ...baseAbility,
                    id: WATER_MODE_CARD,
                    name: 'Water Mode Card',
                    resourceCost: { resourceId: ResourceId.Water, amount: 3 },
                }),
            );
            registerAbilityForTest(
                defineAbility({
                    ...baseAbility,
                    id: WATER_MODE_SLOT,
                    name: 'Water Mode Slot',
                    resourceCost: null,
                    abilityModes: {
                        modes: ['plain', 'wet'],
                        defaultMode: 'plain',
                        modeAbilityIds: { wet: WATER_MODE_CARD },
                    },
                }),
            );
        });
        function unitWith(abilities: string[]): Unit {
            return new Unit({
                id: 'w', x: 0, y: 0, hp: 10, maxHp: 10, speed: 100,
                teamId: 'player', ownerId: 'p1', characterId: 'player', name: 'W', abilities,
            });
        }

        it('a unit whose mode ability costs Water gets Water at 5/8', () => {
            const u = unitWith([WATER_MODE_SLOT]);
            attachResourcesForAbilityCosts(u, new EventBus());
            const water = u.getResource(ResourceId.Water);
            expect(water?.current).toBe(5);
            expect(water?.max).toBe(8);
        });

        it('Water is never attached twice', () => {
            const u = unitWith([WATER_MODE_SLOT, WATER_MODE_CARD]);
            const bus = new EventBus();
            attachResourcesForAbilityCosts(u, bus);
            attachResourcesForAbilityCosts(u, bus);
            expect(u.resources.filter((r) => r.id === ResourceId.Water)).toHaveLength(1);
        });

        it('a unit with no Water-costing ability has no Water', () => {
            const u = unitWith(['0306']);
            attachResourcesForAbilityCosts(u, new EventBus());
            expect(u.getResource(ResourceId.Water)).toBeUndefined();
        });
    });

    it.each(ICE_NODES)('a mission player with $nodeId starts with $cardId and Water at 5/8', ({ nodeId, prereq, cardId }) => {
        const { engine, player } = spawnMissionPlayer(researchWith(nodeId, prereq));
        expect(player.abilities).toContain(cardId);
        const water = player.getResource(ResourceId.Water);
        expect(water).toBeDefined();
        expect(water!.current).toBe(5);
        expect(water!.max).toBe(8);
        expect(player.resources.filter((r) => r.id === ResourceId.Water)).toHaveLength(1);
        engine.destroy();
    });

    it('a Blood Mage without the ice nodes has no Water resource', () => {
        const { engine, player } = spawnMissionPlayer(researchWith(BLOOD_MAGE_NODE_BURST, BLOOD_MAGE_NODE_CLAWS));
        expect(player.getResource(ResourceId.Water)).toBeUndefined();
        engine.destroy();
    });

    it('the tiny-battle loadout harness attaches Water the same way', () => {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: TINY_BATTLE_PLAYER_ID });
        const { player, abilityIds } = placePlayerFromLoadout(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            world: { x: 100, y: 100 },
            equipment: [...EQUIPMENT],
            researchTrees: researchWith(BLOOD_MAGE_NODE_ICE_CLAWS, BLOOD_MAGE_NODE_CLAWS),
        });
        expect(abilityIds).toContain('1501');
        expect(player.getResource(ResourceId.Water)?.current).toBe(5);
        engine.destroy();
    });

    it('the ice nodes do not overlap other Blood Mage nodes in the tree view', () => {
        const NODE_W = 180;
        const NODE_H = 92;
        for (const { nodeId } of ICE_NODES) {
            const a = node(nodeId).position!;
            for (const other of bloodMageTree.nodes) {
                if (other.id === nodeId) continue;
                const b = other.position!;
                const overlaps = Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;
                expect(overlaps, `${nodeId} overlaps ${other.id}`).toBe(false);
            }
        }
    });
});

import { describe, expect, it } from 'vitest';
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
import {
    getAttachedResourcesFromResearch,
    getAvailableResearchNodes,
    getMissionStartResourcesFromResearch,
} from './evaluator';
import { CORE_ITEM_IDS } from '../games/minion_battles/character_defs/items';
import { resolveCharacterLoadout } from '../games/minion_battles/character_defs/characterLoadout';
import { ResourceId } from '../games/minion_battles/resources/resourceIds';
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

    it.each(ICE_NODES)('$nodeId adds $cardId beside its blood card $bloodCardId', ({ nodeId, prereq, cardId, bloodCardId }) => {
        const without = resolveCharacterLoadout(EQUIPMENT, researchWith(prereq, prereq));
        expect(without.abilityIds).not.toContain(cardId);
        const withNode = resolveCharacterLoadout(EQUIPMENT, researchWith(nodeId, prereq));
        expect(withNode.abilityIds).toContain(cardId);
        expect(withNode.abilityIds).toContain(bloodCardId);
    });

    it('each node attaches Water once, with no mission-start grant needed', () => {
        for (const { nodeId, prereq } of ICE_NODES) {
            expect(getAttachedResourcesFromResearch(researchWith(nodeId, prereq))).toEqual([ResourceId.Water]);
        }
        const all = {
            [BLOOD_MAGE_TREE_ID]: [
                BLOOD_MAGE_NODE_CORE,
                BLOOD_MAGE_NODE_CLAWS,
                BLOOD_MAGE_NODE_BURST,
                ...ICE_NODES.map((i) => i.nodeId),
            ],
        };
        expect(getAttachedResourcesFromResearch(all)).toEqual([ResourceId.Water]);
        expect(getMissionStartResourcesFromResearch(all).has(ResourceId.Water)).toBe(false);
        expect(getAttachedResourcesFromResearch({ [BLOOD_MAGE_TREE_ID]: [BLOOD_MAGE_NODE_CORE] })).toEqual([]);
    });

    it.each(ICE_NODES)('a mission player with $nodeId starts with $cardId and an empty Water resource', ({ nodeId, prereq, cardId }) => {
        const { engine, player } = spawnMissionPlayer(researchWith(nodeId, prereq));
        expect(player.abilities).toContain(cardId);
        const water = player.getResource(ResourceId.Water);
        expect(water).toBeDefined();
        expect(water!.current).toBe(0);
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
        expect(player.getResource(ResourceId.Water)?.current).toBe(0);
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

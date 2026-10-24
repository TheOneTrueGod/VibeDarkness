import type { ScenarioDefinition } from '../../types';
import {
    NODE_IRON_WRISTS,
    MELEE_WEAPONS_TREE_ID,
    MELEE_WEAPONS_ROOT_NODE_ID,
} from '../../../../../researchTrees/trees/weaponTreeIds';
import { SWORD_BASE_MAX_USES } from '../../../card_defs/0112_SwingSword/0112Ability';
import { SWING_EXTRA_USES } from '../../../abilities/abilityUses';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { BLEED_BUFF_TYPE, type BleedBuff } from '../../../buffs/BleedBuff';

const P = TINY_BATTLE_PLAYER_ID;

export const swingSwordNoneScenario: ScenarioDefinition = {
    id: 'swing_sword_research_none',
    title: 'Swing Sword without stick_sword research still hits and damages',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 16,
            gridH: 12,
            localPlayerId: P,
            grass: true,
        });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: { x: 200, y: 240 },
            dummyWorld: { x: 278, y: 240 },
            abilities: ['0112'],
        });
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        return [{ unitId: u.id, abilityId: '0112', targets: [{ type: 'pixel', position: { x: d.x, y: d.y } }] }];
    },
    assertPass(engine) {
        const d = engine.getUnit('target_dummy');
        return Boolean(d && d.maxHp - d.hp >= 10);
    },
    failureMessage(engine) {
        const d = engine.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp, expected at least 10`;
    },
};

export const swingSwordBleedScenario: ScenarioDefinition = {
    id: 'swing_sword_bleed',
    title: 'Swing Sword inflicts 2 bleed stacks without any research',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 16,
            gridH: 12,
            localPlayerId: P,
            grass: true,
        });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: { x: 200, y: 240 },
            dummyWorld: { x: 278, y: 240 },
            abilities: ['0112'],
        });
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        return [{ unitId: u.id, abilityId: '0112', targets: [{ type: 'pixel', position: { x: d.x, y: d.y } }] }];
    },
    assertPass(engine) {
        const bleed = engine.getUnit('target_dummy')?.buffs.find((b) => b._type === BLEED_BUFF_TYPE) as BleedBuff | undefined;
        return bleed?.stacks === 2;
    },
    failureMessage(engine) {
        const bleed = engine.getUnit('target_dummy')?.buffs.find((b) => b._type === BLEED_BUFF_TYPE) as BleedBuff | undefined;
        return `dummy bleed stacks=${bleed?.stacks ?? 0} (expected 2)`;
    },
};

export const swingSwordExtraUsesScenario: ScenarioDefinition = {
    id: 'swing_sword_research_extra_uses',
    title: 'Iron Wrists research raises Swing Sword maxUses',
    category: 'ability',
    maxDurationMs: 1000,
    buildEngine() {
        const research = { [P]: { [MELEE_WEAPONS_TREE_ID]: [MELEE_WEAPONS_ROOT_NODE_ID, NODE_IRON_WRISTS] } };
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 8,
            localPlayerId: P,
            grass: true,
            playerResearchTreesByPlayer: research,
        });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: { x: 100, y: 120 },
            dummyWorld: { x: 200, y: 120 },
            abilities: ['0112'],
            playerResearchTreesByPlayer: research,
        });
        return engine;
    },
    getInitialOrders: () => [],
    assertPass(engine) {
        const u = engine.getLocalPlayerUnit();
        const rt = u?.abilityRuntime['0112'];
        return Boolean(rt && rt.maxUses === SWORD_BASE_MAX_USES + SWING_EXTRA_USES);
    },
    failureMessage(engine) {
        const rt = engine.getLocalPlayerUnit()?.abilityRuntime['0112'];
        return `Swing Sword maxUses=${rt?.maxUses} expected ${SWORD_BASE_MAX_USES + SWING_EXTRA_USES}`;
    },
};

export const swingSwordHitsTwoTargetsScenario: ScenarioDefinition = {
    id: 'swing_sword_hits_two_targets',
    title: 'Swing Sword hits up to two enemies without any research',
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
            x: 200,
            y: 260,
            abilities: ['0112'],
        });
        for (let i = 0; i < 3; i++) {
            const y = 200 + i * 60;
            const du = createTargetDummyAtWorld(engine, 280, y, { id: `target_dummy_${i}`, hp: 400 });
            initializeAbilityRuntimeForUnit(du);
            engine.addUnit(du, 'initialGameSpawn');
        }
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        return [{ unitId: u.id, abilityId: '0112', targets: [{ type: 'pixel', position: { x: 280, y: 260 } }] }];
    },
    assertPass(engine) {
        const hurt = engine.units.filter((u) => u.teamId === 'enemy' && u.isAlive() && u.hp < u.maxHp);
        return hurt.length === 2;
    },
    failureMessage(engine) {
        const hurt = engine.units.filter((u) => u.teamId === 'enemy' && u.isAlive() && u.hp < u.maxHp);
        return `enemies damaged=${hurt.length} (expected exactly 2)`;
    },
};

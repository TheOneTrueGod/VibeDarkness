import type { ScenarioDefinition } from '../../types';
import { asCardDefId } from '../../../card_defs';
import {
    STICK_SWORD_NODE_EXTRA_TARGET,
    STICK_SWORD_NODE_EXTRA_USES,
    STICK_SWORD_TREE_ID,
} from '../../../../../researchTrees/trees/stick_sword';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    seedHandWithAbilities,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

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
        seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('0112'), abilityId: '0112' }]);
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        return [{ unitId: u.id, abilityId: '0112', targets: [{ type: 'pixel', position: { x: d.x, y: d.y } }] }];
    },
    assertPass(engine) {
        const d = engine.getUnit('target_dummy');
        return Boolean(d && d.hp < 490);
    },
    failureMessage(engine) {
        const d = engine.getUnit('target_dummy');
        return `dummy hp=${d?.hp}`;
    },
};

export const swingSwordExtraTargetScenario: ScenarioDefinition = {
    id: 'swing_sword_research_extra_target',
    title: 'Stick sword +1 target allows three enemies hit in one slash',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const research = { [P]: { [STICK_SWORD_TREE_ID]: ['craft_sword', STICK_SWORD_NODE_EXTRA_TARGET] } };
        const engine = buildTinyBattleEngine({
            gridW: 18,
            gridH: 14,
            localPlayerId: P,
            grass: true,
            playerResearchTreesByPlayer: research,
        });
        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 200,
            y: 260,
            abilities: ['0112'],
            playerResearchTreesByPlayer: research,
        });
        for (let i = 0; i < 3; i++) {
            const y = 200 + i * 60;
            const du = createTargetDummyAtWorld(engine, 300, y, { id: `target_dummy_${i}`, hp: 400 });
            initializeAbilityRuntimeForUnit(du);
            engine.addUnit(du);
        }
        seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('0112'), abilityId: '0112' }]);
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        return [{ unitId: u.id, abilityId: '0112', targets: [{ type: 'pixel', position: { x: 300, y: 260 } }] }];
    },
    assertPass(engine) {
        const hurt = engine.units.filter((u) => u.teamId === 'enemy' && u.isAlive() && u.hp < u.maxHp);
        return hurt.length >= 3;
    },
    failureMessage(engine) {
        const hurt = engine.units.filter((u) => u.teamId === 'enemy' && u.isAlive() && u.hp < u.maxHp);
        return `enemies damaged=${hurt.length} (need 3)`;
    },
};

export const swingSwordExtraUsesScenario: ScenarioDefinition = {
    id: 'swing_sword_research_extra_uses',
    title: 'Stick sword +2 uses raises Swing Sword maxUses',
    category: 'ability',
    maxDurationMs: 1000,
    buildEngine() {
        const research = { [P]: { [STICK_SWORD_TREE_ID]: ['craft_sword', STICK_SWORD_NODE_EXTRA_USES] } };
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
        return Boolean(rt && rt.maxUses === 4);
    },
    failureMessage(engine) {
        const rt = engine.getLocalPlayerUnit()?.abilityRuntime['0112'];
        return `Swing Sword maxUses=${rt?.maxUses} expected 4`;
    },
};

import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import { asCardDefId } from '../../../card_defs';
import { StunnedBuff, STUNNED_BUFF_TYPE } from '../../../buffs/StunnedBuff';
import {
    TRAINING_NODE_CHARGING_PUNCH,
    TRAINING_NODE_DOUBLE_PUNCH,
    TRAINING_NODE_SNEAKY_PUNCH,
    TRAINING_NODE_STRONG_PUNCH,
    TRAINING_TREE_ID,
} from '../../../../../researchTrees/trees/training';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    seedHandWithAbilities,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';

const P = TINY_BATTLE_PLAYER_ID;
const TEST_CELL_SIZE = 40;
const PLAYER_START = { x: 3 * TEST_CELL_SIZE + TEST_CELL_SIZE / 2, y: 2 * TEST_CELL_SIZE + TEST_CELL_SIZE / 2 };
const DUMMY_START = { x: 5 * TEST_CELL_SIZE + TEST_CELL_SIZE / 2, y: 2 * TEST_CELL_SIZE + TEST_CELL_SIZE / 2 };

function tinyPunchEngine(researchNodes: string[]): GameEngine {
    const engine = buildTinyBattleEngine({
        gridW: 8,
        gridH: 6,
        localPlayerId: P,
        grass: true,
        playerResearchTreesByPlayer:
            researchNodes.length > 0 ? { [P]: { [TRAINING_TREE_ID]: researchNodes } } : undefined,
    });
    placePlayerAndDummy(engine, {
        playerId: P,
        playerWorld: PLAYER_START,
        dummyWorld: DUMMY_START,
        abilities: ['0102'],
        playerResearchTreesByPlayer:
            researchNodes.length > 0 ? { [P]: { [TRAINING_TREE_ID]: researchNodes } } : undefined,
    });
    seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('0102'), abilityId: '0102' }]);
    return engine;
}

function punchOrder(engine: GameEngine, extraPixel?: { x: number; y: number }) {
    const u = engine.getLocalPlayerUnit()!;
    const d = engine.getUnit('target_dummy')!;
    const t0 = { type: 'pixel' as const, position: { x: d.x, y: d.y } };
    const targets = extraPixel ? [t0, { type: 'pixel' as const, position: extraPixel }] : [t0];
    return [{ unitId: u.id, abilityId: '0102', targets }];
}

export const punchBaselineScenario: ScenarioDefinition = {
    id: 'punch_research_baseline',
    title: 'Punch (no training punch upgrades) damages dummy',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => tinyPunchEngine([]),
    getInitialOrders: (e) => punchOrder(e),
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.maxHp - d.hp >= 8);
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp, expected at least 8`;
    },
};

export const punchStrongScenario: ScenarioDefinition = {
    id: 'punch_research_strong',
    title: 'Strong Punch applies stun on hit',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => tinyPunchEngine([TRAINING_NODE_STRONG_PUNCH]),
    getInitialOrders: (e) => punchOrder(e),
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        return Boolean(d?.hasBuff(STUNNED_BUFF_TYPE));
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        return `stunned=${d?.hasBuff(STUNNED_BUFF_TYPE)} hp=${d?.hp}`;
    },
};

export const punchDoubleScenario: ScenarioDefinition = {
    id: 'punch_research_double',
    title: 'Double Punch lands two strikes on one target line',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => tinyPunchEngine([TRAINING_NODE_DOUBLE_PUNCH]),
    getInitialOrders: (e) => {
        const d = e.getUnit('target_dummy')!;
        return punchOrder(e, { x: d.x + 4, y: d.y });
    },
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.maxHp - d.hp >= 15);
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp, expected at least 15 from two strikes`;
    },
};

export const punchSneakyScenario: ScenarioDefinition = {
    id: 'punch_research_sneaky',
    title: 'Sneaky Punch bonus vs pre-stunned dummy',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => {
        const engine = tinyPunchEngine([TRAINING_NODE_SNEAKY_PUNCH]);
        const d = engine.getUnit('target_dummy');
        if (d) {
            d.addBuff(new StunnedBuff(8), engine.gameTime, engine.roundNumber);
        }
        return engine;
    },
    getInitialOrders: (e) => punchOrder(e),
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        if (!d) return false;
        // Baseline single punch is ~8 damage; sneaky vs stunned should deal strictly more.
        const lost = d.maxHp - d.hp;
        return lost > 8;
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        const lost = d ? d.maxHp - d.hp : 0;
        return `dummy lost ${lost} hp, expected more than 8 (sneaky bonus vs stunned)`;
    },
};

export const punchChargingScenario: ScenarioDefinition = {
    id: 'punch_research_charging',
    title: 'Charging Punch restores a Throw Charged Rock use on hit',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => {
        const engine = buildTinyBattleEngine({
            gridW: 8,
            gridH: 6,
            localPlayerId: P,
            grass: true,
            playerResearchTreesByPlayer: { [P]: { [TRAINING_TREE_ID]: [TRAINING_NODE_CHARGING_PUNCH] } },
        });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_START,
            dummyWorld: DUMMY_START,
            abilities: ['0102', 'throw_charged_rock'],
            playerResearchTreesByPlayer: { [P]: { [TRAINING_TREE_ID]: [TRAINING_NODE_CHARGING_PUNCH] } },
        });
        seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('0102'), abilityId: '0102' }]);
        const u = engine.getLocalPlayerUnit();
        const rt = u?.abilityRuntime['throw_charged_rock'];
        // At max uses, throw_charged_rock cannot accept lightCharge (buffer is 0). Deplete uses so
        // recoverCharge can apply; the runtime then converts light charge into a use immediately.
        if (rt) rt.currentUses = 0;
        return engine;
    },
    getInitialOrders: (e) => punchOrder(e),
    assertPass: (e) => {
        const u = e.getLocalPlayerUnit();
        if (!u) return false;
        const rt = u.abilityRuntime['throw_charged_rock'];
        return Boolean(rt && rt.currentUses >= 1);
    },
    failureMessage: (e) => {
        const u = e.getLocalPlayerUnit();
        const rt = u?.abilityRuntime['throw_charged_rock'];
        return `throw_charged_rock uses=${rt?.currentUses ?? '—'} (expected ≥1 after hit)`;
    },
};

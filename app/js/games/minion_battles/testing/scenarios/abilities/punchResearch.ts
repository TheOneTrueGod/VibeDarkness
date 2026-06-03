import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import { asCardDefId } from '../../../card_defs';
import { StunnedBuff, STUNNED_BUFF_TYPE } from '../../../buffs/StunnedBuff';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    seedHandWithAbilities,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';

const P = TINY_BATTLE_PLAYER_ID;
const TEST_CELL_SIZE = 40;
const PLAYER_START = { x: 3 * TEST_CELL_SIZE + TEST_CELL_SIZE / 2, y: 2 * TEST_CELL_SIZE + TEST_CELL_SIZE / 2 };
// One cell to the right of the player (40px), within the 40px (MAX_RANGE + unit radius) hitbox reach.
const DUMMY_START = { x: 4 * TEST_CELL_SIZE + TEST_CELL_SIZE / 2, y: 2 * TEST_CELL_SIZE + TEST_CELL_SIZE / 2 };

// MAX_RANGE for Bash/punch abilities (matches 0120Ability.ts and 0116Ability.ts).
const PUNCH_MAX_RANGE = 30;

function buildPunchEngine(abilityId: string, extraAbilities: string[] = []): GameEngine {
    const engine = buildTinyBattleEngine({ gridW: 8, gridH: 6, localPlayerId: P, grass: true });
    placePlayerAndDummy(engine, {
        playerId: P,
        playerWorld: PLAYER_START,
        dummyWorld: DUMMY_START,
        abilities: [abilityId, ...extraAbilities],
    });
    seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId(abilityId), abilityId }]);
    return engine;
}

function punchOrder(engine: GameEngine, abilityId: string, extraPixel?: { x: number; y: number }) {
    const u = engine.getLocalPlayerUnit()!;
    const d = engine.getUnit('target_dummy')!;
    const t0 = { type: 'pixel' as const, position: { x: d.x, y: d.y } };
    const targets = extraPixel ? [t0, { type: 'pixel' as const, position: extraPixel }] : [t0];
    return [{ unitId: u.id, abilityId, targets }];
}

export const punchStrongScenario: ScenarioDefinition = {
    id: 'punch_research_strong',
    title: 'Strong Punch (0117) applies stun on hit',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => buildPunchEngine('0117'),
    getInitialOrders: (e) => punchOrder(e, '0117'),
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
    title: 'Double Punch (0116) lands two strikes on one target line',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => buildPunchEngine('0116'),
    getInitialOrders: (e) => {
        const d = e.getUnit('target_dummy')!;
        return punchOrder(e, '0116', { x: d.x + 4, y: d.y });
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
    title: 'Sneaky Punch (0118) bonus vs pre-stunned dummy',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => {
        const engine = buildPunchEngine('0118');
        const d = engine.getUnit('target_dummy');
        if (d) {
            d.addBuff(new StunnedBuff(8), engine.gameTime, engine.roundNumber);
        }
        return engine;
    },
    getInitialOrders: (e) => punchOrder(e, '0118'),
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

export const punchNEWBaselineScenario: ScenarioDefinition = {
    id: 'punch_new_baseline',
    title: 'PunchNEW (0120) damages dummy',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => buildPunchEngine('0120'),
    getInitialOrders: (e) => punchOrder(e, '0120'),
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.maxHp - d.hp >= 8);
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        return `dummy lost ${d ? d.maxHp - d.hp : 0} hp, expected at least 8`;
    },
};

export const punchChargingScenario: ScenarioDefinition = {
    id: 'punch_research_charging',
    title: 'Charging Punch (0119) grants a Light Charge to throw_charged_rock on hit',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 6, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_START,
            dummyWorld: DUMMY_START,
            abilities: ['0119', 'throw_charged_rock'],
        });
        seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('0119'), abilityId: '0119' }]);
        const u = engine.getLocalPlayerUnit();
        const rt = u?.abilityRuntime['throw_charged_rock'];
        // Deplete uses so recoverCharge can apply; the runtime converts light charge into a use.
        if (rt) rt.currentUses = 0;
        return engine;
    },
    getInitialOrders: (e) => punchOrder(e, '0119'),
    assertPass: (e) => {
        const u = e.getLocalPlayerUnit();
        if (!u) return false;
        const rt = u.abilityRuntime['throw_charged_rock'];
        return Boolean(rt && rt.currentUses >= 1);
    },
    failureMessage: (e) => {
        const u = e.getLocalPlayerUnit();
        const rt = u?.abilityRuntime['throw_charged_rock'];
        return `throw_charged_rock uses=${rt?.currentUses ?? 'â€”'} (expected â‰¥1 after hit)`;
    },
};

// ---------------------------------------------------------------------------
// Bash (0120) range-boundary scenarios
// PUNCH_HITBOX.maxRange = PUNCH_MAX_RANGE + DEFAULT_UNIT_RADIUS = 30 + 20 = 50 px
// ---------------------------------------------------------------------------

export const bashRangeBoundaryHitScenario: ScenarioDefinition = {
    id: 'bash_range_boundary_hit',
    title: 'Bash (0120) hits dummy at exactly maxRange - 1 px',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 6, localPlayerId: P, grass: true });
        // Place player and a dummy that is exactly (PUNCH_MAX_RANGE + DEFAULT_UNIT_RADIUS - 1) px away.
        const hitDistance = PUNCH_MAX_RANGE + DEFAULT_UNIT_RADIUS - 1;
        spawnTinyPlayerUnit(engine, { playerId: P, x: PLAYER_START.x, y: PLAYER_START.y, abilities: ['0120'] });
        const dummy = createTargetDummyAtWorld(engine, PLAYER_START.x + hitDistance, PLAYER_START.y, { id: 'target_dummy' });
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');
        seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('0120'), abilityId: '0120' }]);
        return engine;
    },
    getInitialOrders: (e) => {
        const u = e.getLocalPlayerUnit()!;
        const d = e.getUnit('target_dummy')!;
        return [{ unitId: u.id, abilityId: '0120', targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }] }];
    },
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.maxHp - d.hp > 0);
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        return `dummy at maxRange-1 lost ${d ? d.maxHp - d.hp : 0} hp, expected damage (should be in range)`;
    },
};

export const bashRangeBoundaryMissScenario: ScenarioDefinition = {
    id: 'bash_range_boundary_miss',
    title: 'Bash (0120) misses dummy at maxRange + 5 px',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 6, localPlayerId: P, grass: true });
        // Place dummy exactly (PUNCH_MAX_RANGE + DEFAULT_UNIT_RADIUS + 5) px away â€” just outside range.
        const missDistance = PUNCH_MAX_RANGE + DEFAULT_UNIT_RADIUS + 5;
        spawnTinyPlayerUnit(engine, { playerId: P, x: PLAYER_START.x, y: PLAYER_START.y, abilities: ['0120'] });
        const dummy = createTargetDummyAtWorld(engine, PLAYER_START.x + missDistance, PLAYER_START.y, { id: 'target_dummy' });
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');
        seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('0120'), abilityId: '0120' }]);
        return engine;
    },
    getInitialOrders: (e) => {
        const u = e.getLocalPlayerUnit()!;
        const d = e.getUnit('target_dummy')!;
        return [{ unitId: u.id, abilityId: '0120', targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }] }];
    },
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        // Dummy should take no damage â€” it is outside the effective range.
        return Boolean(d && d.maxHp - d.hp === 0);
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        return `dummy at maxRange+5 lost ${d ? d.maxHp - d.hp : 0} hp, expected 0 (should be out of range)`;
    },
};

// ---------------------------------------------------------------------------
// Double Punch (0116) two-target scenario
// Validates that per-timing selectTarget routing sends each punch to a different dummy.
// ---------------------------------------------------------------------------

export const doublePunchTwoTargetsScenario: ScenarioDefinition = {
    id: 'double_punch_two_targets',
    title: 'Double Punch (0116) hits two separate dummies with separate target pixels',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: P, grass: true });
        spawnTinyPlayerUnit(engine, { playerId: P, x: PLAYER_START.x, y: PLAYER_START.y, abilities: ['0116'] });
        // Two dummies side by side, each within punch range.
        const dummy1 = createTargetDummyAtWorld(engine, PLAYER_START.x + 40, PLAYER_START.y - 15, { id: 'target_dummy_1' });
        initializeAbilityRuntimeForUnit(dummy1);
        engine.addUnit(dummy1, 'initialGameSpawn');
        const dummy2 = createTargetDummyAtWorld(engine, PLAYER_START.x + 40, PLAYER_START.y + 15, { id: 'target_dummy_2' });
        initializeAbilityRuntimeForUnit(dummy2);
        engine.addUnit(dummy2, 'initialGameSpawn');
        seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('0116'), abilityId: '0116' }]);
        return engine;
    },
    getInitialOrders: (e) => {
        const u = e.getLocalPlayerUnit()!;
        const d1 = e.getUnit('target_dummy_1')!;
        const d2 = e.getUnit('target_dummy_2')!;
        const t1 = { type: 'unit' as const, unitId: d1.id };
        const t2 = { type: 'unit' as const, unitId: d2.id };
        return [{
            unitId: u.id,
            abilityId: '0116',
            targets: [t1, t2],
            targetsByLabel: { 'Target 1': t1, 'Target 2': t2 },
        }];
    },
    assertPass: (e) => {
        const d1 = e.getUnit('target_dummy_1');
        const d2 = e.getUnit('target_dummy_2');
        return Boolean(d1 && d1.maxHp - d1.hp > 0 && d2 && d2.maxHp - d2.hp > 0);
    },
    failureMessage: (e) => {
        const d1 = e.getUnit('target_dummy_1');
        const d2 = e.getUnit('target_dummy_2');
        return `dummy1 lost ${d1 ? d1.maxHp - d1.hp : 0} hp, dummy2 lost ${d2 ? d2.maxHp - d2.hp : 0} hp; expected both to take damage`;
    },
};

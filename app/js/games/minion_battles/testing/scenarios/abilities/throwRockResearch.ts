import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import { CRYSTAL_ROCKS_TREE_ID } from '../../../../../researchTrees/trees/crystal_rocks';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';

const P = TINY_BATTLE_PLAYER_ID;

function throwRockEngine(nodes: string[]): GameEngine {
    const research = nodes.length > 0 ? { [P]: { [CRYSTAL_ROCKS_TREE_ID]: nodes } } : undefined;
    const engine = buildTinyBattleEngine({
        gridW: 16,
        gridH: 10,
        localPlayerId: P,
        grass: true,
        playerResearchTreesByPlayer: research,
    });
    placePlayerAndDummy(engine, {
        playerId: P,
        playerWorld: { x: 120, y: 200 },
        dummyWorld: { x: 280, y: 200 },
        abilities: ['throw_rock'],
        playerResearchTreesByPlayer: research,
    });
    return engine;
}

function chargedRockEngine(nodes: string[]): GameEngine {
    const research = { [P]: { [CRYSTAL_ROCKS_TREE_ID]: nodes } };
    const engine = buildTinyBattleEngine({
        gridW: 16,
        gridH: 10,
        localPlayerId: P,
        grass: true,
        playerResearchTreesByPlayer: research,
    });
    placePlayerAndDummy(engine, {
        playerId: P,
        playerWorld: { x: 120, y: 200 },
        dummyWorld: { x: 280, y: 200 },
        abilities: ['throw_charged_rock'],
        playerResearchTreesByPlayer: research,
    });
    return engine;
}

function throwOrder(engine: GameEngine) {
    const u = engine.getLocalPlayerUnit()!;
    const d = engine.getUnit('target_dummy')!;
    return [
        {
            unitId: u.id,
            abilityId: 'throw_rock',
            targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }],
        },
    ];
}

function chargedThrowOrder(engine: GameEngine) {
    const u = engine.getLocalPlayerUnit()!;
    const d = engine.getUnit('target_dummy')!;
    return [
        {
            unitId: u.id,
            abilityId: 'throw_charged_rock',
            targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }],
        },
    ];
}

function chargedThrowTwoRockOrder(engine: GameEngine) {
    const u = engine.getLocalPlayerUnit()!;
    const d = engine.getUnit('target_dummy')!;
    return [
        {
            unitId: u.id,
            abilityId: 'throw_charged_rock',
            targets: [
                { type: 'pixel' as const, position: { x: d.x, y: d.y } },
                { type: 'pixel' as const, position: { x: d.x, y: d.y } },
            ],
        },
    ];
}

export const throwRockNoResearchScenario: ScenarioDefinition = {
    id: 'throw_rock_research_none',
    title: 'Throw Rock baseline damage (no crystal_rocks nodes)',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => throwRockEngine([]),
    getInitialOrders: throwOrder,
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.hp < 496);
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        return `dummy hp=${d?.hp} expected < 496 (at least ~5 damage)`;
    },
};

// Discriminating test: checks that the rock deals damage EXACTLY ONCE (not twice).
// Single-player floor raises damage to 6; one hit → hp 494. Two hits → hp 488.
export const throwRockExactlyOnceScenario: ScenarioDefinition = {
    id: 'throw_rock_exactly_once',
    title: 'Throw Rock deals damage exactly once (not twice)',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => throwRockEngine([]),
    getInitialOrders: throwOrder,
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        // 500 - 6 (single-player floor) = 494. Double-damage would be 488.
        return Boolean(d && d.hp >= 489 && d.hp <= 495);
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        return `dummy hp=${d?.hp}; expected 489–495 (one hit). hp < 489 means double damage.`;
    },
};

export const throwRockMorePowerScenario: ScenarioDefinition = {
    id: 'throw_rock_research_more_power',
    title: 'Throw Charged Rock with more_power deals higher explosion damage',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => chargedRockEngine(['charged_rocks', 'more_power']),
    getInitialOrders: chargedThrowOrder,
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.hp < 490);
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        return `dummy hp=${d?.hp} expected < 490 for more_power bump (5 direct + 8 explosion = 13 damage)`;
    },
};

export const throwRockMoreRockScenario: ScenarioDefinition = {
    id: 'throw_rock_research_more_rock',
    title: 'Throw Charged Rock with more_rock fires two projectiles',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => chargedRockEngine(['charged_rocks', 'more_rock']),
    getInitialOrders: chargedThrowTwoRockOrder,
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.hp < 490);
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        return `dummy hp=${d?.hp} expected < 490 for two-rock pattern (rock1: 5+3=8, rock2 explosion clips knockedback dummy: +3 = 11 total)`;
    },
};

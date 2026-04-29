import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import { asCardDefId } from '../../../card_defs';
import { CRYSTAL_ROCKS_TREE_ID } from '../../../../../researchTrees/trees/crystal_rocks';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    seedHandWithAbilities,
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
    seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('throw_rock'), abilityId: 'throw_rock' }]);
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

export const throwRockMorePowerScenario: ScenarioDefinition = {
    id: 'throw_rock_research_more_power',
    title: 'Throw Rock with more_power deals higher impact',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => throwRockEngine(['charged_rocks', 'more_power']),
    getInitialOrders: throwOrder,
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.hp < 490);
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        return `dummy hp=${d?.hp} expected < 490 for more_power bump`;
    },
};

export const throwRockMoreRockScenario: ScenarioDefinition = {
    id: 'throw_rock_research_more_rock',
    title: 'Throw Rock with more_rock (two projectiles) extra damage',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => throwRockEngine(['charged_rocks', 'more_rock']),
    getInitialOrders: throwOrder,
    assertPass: (e) => {
        const d = e.getUnit('target_dummy');
        return Boolean(d && d.hp < 488);
    },
    failureMessage: (e) => {
        const d = e.getUnit('target_dummy');
        return `dummy hp=${d?.hp} expected < 488 for two-rock pattern`;
    },
};

import type { ScenarioDefinition } from '../types';
import {
    pathAroundRockScenario,
    pathShortCommuteScenario,
    pathStraightMoveScenario,
} from './general/pathfinding';
import { swingSwordAppliesBleedScenario } from './general/buffs';
import {
    punchBaselineScenario,
    punchChargingScenario,
    punchDoubleScenario,
    punchSneakyScenario,
    punchStrongScenario,
} from './abilities/punchResearch';
import {
    throwRockMorePowerScenario,
    throwRockMoreRockScenario,
    throwRockNoResearchScenario,
} from './abilities/throwRockResearch';
import {
    swingSwordExtraTargetScenario,
    swingSwordExtraUsesScenario,
    swingSwordNoneScenario,
} from './abilities/swingSwordResearch';

export const ALL_ABILITY_TEST_SCENARIOS: ScenarioDefinition[] = [
    pathStraightMoveScenario,
    pathAroundRockScenario,
    pathShortCommuteScenario,
    swingSwordAppliesBleedScenario,
    punchBaselineScenario,
    punchStrongScenario,
    punchDoubleScenario,
    punchSneakyScenario,
    punchChargingScenario,
    throwRockNoResearchScenario,
    throwRockMorePowerScenario,
    throwRockMoreRockScenario,
    swingSwordNoneScenario,
    swingSwordExtraTargetScenario,
    swingSwordExtraUsesScenario,
];

export function getScenarioById(id: string): ScenarioDefinition | undefined {
    return ALL_ABILITY_TEST_SCENARIOS.find((s) => s.id === id);
}

export function getGeneralTestScenarios(): ScenarioDefinition[] {
    return ALL_ABILITY_TEST_SCENARIOS.filter((s) => s.category === 'general');
}

/** Map scenario → primary ability id for grouping on the Ability Test page (heuristic by scenario id). */
export function inferScenarioAbilityId(scenario: ScenarioDefinition): string | null {
    if (scenario.category !== 'ability') return null;
    const id = scenario.id;
    if (id.startsWith('punch_')) return '0102';
    if (id.startsWith('throw_rock') || id.includes('throw_rock')) return 'throw_rock';
    if (id.startsWith('swing_sword') || id.includes('buff_swing')) return '0112';
    return null;
}

/**
 * Selector key from the Ability Test page: raw ability id (e.g. `0102`) or `general:<scenarioId>`.
 */
export function getScenariosForSelectorKey(key: string): ScenarioDefinition[] {
    if (key.startsWith('general:')) {
        const sid = key.slice('general:'.length);
        const s = getScenarioById(sid);
        return s && s.category === 'general' ? [s] : [];
    }
    return ALL_ABILITY_TEST_SCENARIOS.filter((s) => inferScenarioAbilityId(s) === key);
}

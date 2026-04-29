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

/** Ordered general-test groups for the Ability Test sidebar (`general:<slug>`). */
const GENERAL_GROUP_ORDER: { slug: string; section: string }[] = [
    { slug: 'movement', section: 'Movement' },
    { slug: 'debuffs', section: 'Debuffs' },
];

export interface GeneralTestSidebarGroup {
    slug: string;
    label: string;
    /** Same key used in URL `selected` and `getScenariosForSelectorKey`. */
    selectorKey: string;
}

export function getGeneralTestSidebarGroups(): GeneralTestSidebarGroup[] {
    const general = getGeneralTestScenarios();
    return GENERAL_GROUP_ORDER.filter(({ section }) => general.some((s) => s.generalSection === section)).map(
        ({ slug, section }) => ({
            slug,
            label: section,
            selectorKey: `general:${slug}`,
        }),
    );
}

export function isRegisteredGeneralGroupSelectorKey(key: string): boolean {
    if (!key.startsWith('general:')) return false;
    const slug = key.slice('general:'.length).toLowerCase();
    return GENERAL_GROUP_ORDER.some((g) => g.slug === slug);
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
 * Selector key from the Ability Test page: raw ability id (e.g. `0102`), `general:<groupSlug>`
 * (e.g. `general:movement`), or legacy `general:<scenarioId>`.
 */
export function getScenariosForSelectorKey(key: string): ScenarioDefinition[] {
    if (key.startsWith('general:')) {
        const rest = key.slice('general:'.length);
        const slug = rest.toLowerCase();
        const group = GENERAL_GROUP_ORDER.find((g) => g.slug === slug);
        if (group) {
            return getGeneralTestScenarios().filter((s) => s.generalSection === group.section);
        }
        const s = getScenarioById(rest);
        return s && s.category === 'general' ? [s] : [];
    }
    return ALL_ABILITY_TEST_SCENARIOS.filter((s) => inferScenarioAbilityId(s) === key);
}

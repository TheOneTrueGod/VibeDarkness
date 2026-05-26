import type { ScenarioDefinition } from '../types';
import {
    pathAroundRockScenario,
    pathShortCommuteScenario,
    pathStraightMoveScenario,
} from './general/pathfinding';
import { swingSwordAppliesBleedScenario } from './general/buffs';
import { bossStunMechanicsScenario } from './general/enemies';
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
    swingSwordJaggedEdgeScenario,
    swingSwordNoBleedWithoutResearchScenario,
    swingSwordExtraUsesScenario,
    swingSwordNoneScenario,
    swingSwordHitsTwoTargetsScenario,
} from './abilities/swingSwordResearch';
import { absorptionShieldEnergyChargeScenario } from './abilities/absorptionShieldScenario';
import { lanterniteNestBuildScenario, lanterniteDefenderAttackScenario } from './general/lanternites';

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
    swingSwordJaggedEdgeScenario,
    swingSwordNoBleedWithoutResearchScenario,
    swingSwordHitsTwoTargetsScenario,
    swingSwordExtraUsesScenario,
    bossStunMechanicsScenario,
    absorptionShieldEnergyChargeScenario,
    lanterniteNestBuildScenario,
    lanterniteDefenderAttackScenario,
];

export function getScenarioById(id: string): ScenarioDefinition | undefined {
    return ALL_ABILITY_TEST_SCENARIOS.find((s) => s.id === id);
}

export interface AbilityTreeSidebarGroup {
    treeId: string;
    label: string;
    selectorKey: string;
    /** Ability IDs as returned by inferScenarioAbilityId — used to collect scenarios for this tree. */
    abilityIds: string[];
}

const ABILITY_TREE_GROUPS: AbilityTreeSidebarGroup[] = [
    { treeId: 'training',      label: 'Training',      selectorKey: 'tree:training',      abilityIds: ['0102'] },
    { treeId: 'crystal_rocks', label: 'Rocks',          selectorKey: 'tree:crystal_rocks', abilityIds: ['throw_rock'] },
    { treeId: 'stick_sword',   label: 'Stick & Sword',  selectorKey: 'tree:stick_sword',   abilityIds: ['0112'] },
    { treeId: 'tech_shield',   label: 'Tech Shield',    selectorKey: 'tree:tech_shield',   abilityIds: ['0113'] },
];

export function getAbilityTreeSidebarGroups(): AbilityTreeSidebarGroup[] {
    return ABILITY_TREE_GROUPS.filter(({ abilityIds }) =>
        ALL_ABILITY_TEST_SCENARIOS.some(
            (s) => s.category === 'ability' && abilityIds.includes(inferScenarioAbilityId(s) ?? ''),
        ),
    );
}

export function isRegisteredTreeGroupSelectorKey(key: string): boolean {
    return ABILITY_TREE_GROUPS.some((g) => g.selectorKey === key);
}

export function getGeneralTestScenarios(): ScenarioDefinition[] {
    return ALL_ABILITY_TEST_SCENARIOS.filter((s) => s.category === 'general');
}

/** Ordered general-test groups for the Ability Test sidebar (`general:<slug>`). */
const GENERAL_GROUP_ORDER: { slug: string; section: string }[] = [
    { slug: 'movement', section: 'Movement' },
    { slug: 'debuffs', section: 'Debuffs' },
    { slug: 'enemies', section: 'Enemies' },
    { slug: 'lanternites', section: 'Lanternites' },
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
    if (id.startsWith('absorption_shield')) return '0113';
    return null;
}

/**
 * Selector key from the Ability Test page: `tree:<treeId>` (e.g. `tree:training`),
 * `general:<groupSlug>` (e.g. `general:movement`), or legacy ability id / `general:<scenarioId>`.
 */
export function getScenariosForSelectorKey(key: string): ScenarioDefinition[] {
    if (key.startsWith('tree:')) {
        const treeId = key.slice('tree:'.length);
        const group = ABILITY_TREE_GROUPS.find((g) => g.treeId === treeId);
        if (!group) return [];
        return ALL_ABILITY_TEST_SCENARIOS.filter(
            (s) => s.category === 'ability' && group.abilityIds.includes(inferScenarioAbilityId(s) ?? ''),
        );
    }
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

/**
 * Research-node hover preview.
 *
 * One character research snapshot in, one before/after preview out. Stats, granted
 * abilities, and ability upgrades are derived from the node (and the character's other
 * research) — nodes do not describe their own tooltip layout.
 */

import { campaignResourceDef } from '../../../campaignResources';
import {
    applyPassiveBonusToBase,
    computePassiveBonuses,
    DEFAULT_PASSIVE_MULT,
    getNodeLevel,
    getNodeMaxLevels,
} from '../../../researchTrees/passiveBonuses';
import { PASSIVE_STAT_LABELS } from '../../../researchTrees/passiveStatLabels';
import {
    getMissionStartResourcesFromResearch,
    getPetsFromResearch,
} from '../../../researchTrees/evaluator';
import { RESEARCH_TREES } from '../../../researchTrees/list';
import {
    getVirtualRootItemIds,
    PassiveStatKey,
    type AbilityResearchModifier,
    type CampaignResourceKey,
    type PassiveBonuses,
    type ResearchNodeDef,
    type ResearchNodeLevels,
} from '../../../researchTrees/types';
import { getItemDef } from '../character_defs/items';
import { resolveCharacterLoadout } from '../character_defs/characterLoadout';
import { getCharacterMaxHunger } from '../character_defs/characterHunger';
import { expandAbilityIdsForResearchModifiers } from '../abilities/abilityModifierHelpers';
import { getAbilityTagsForId } from '../abilities/Ability';
import { getDefaultHp, PLAYER_CHARACTER_ID } from '../game/units/unit_defs/unitDef';
import { getPetDef } from '../game/units/pet_defs/petDef';
import {
    getDamageBonusFromResearch,
    getHealthBonusFromResearch,
} from './researchTrainingEffects';
import { MOVEMENT_BASE_MAX, MOVEMENT_BASE_RECOVERY_PER_ROUND } from '../resources/Movement';
import { LIGHT_REGEN_ENABLED_ADD } from '../resources/Light';
import { ALL_RESOURCE_DISPLAY_DEFS } from '../resources/resourceDisplayDefs';

/** Character research the preview diffs. The same shape is passed to ability `getTooltipText`. */
export interface ResearchView {
    researchTrees: Record<string, string[]>;
    researchNodeLevels?: ResearchNodeLevels;
}

export interface ResearchPreviewUpgrade {
    beforeAbilityId: string;
    afterAbilityId: string;
}

export type ResearchPreviewStat =
    | { id: string; label: string; kind: 'text'; before: string; after: string }
    | { id: string; label: string; kind: 'battle'; resourceId: string; before: string; after: string }
    | { id: string; label: string; kind: 'campaign'; resource: CampaignResourceKey; before: string; after: string };

export interface ResearchNodePreview {
    stats: ResearchPreviewStat[];
    /** Ability ids this node grants. Render in one horizontal "Unlocks" row. */
    unlocks: string[];
    /** Ability cards whose resolved tooltip (and modifiers) change. */
    upgrades: ResearchPreviewUpgrade[];
    /** Research snapshot for the "before" cards and stat column. */
    beforeView: ResearchView;
    /** Research snapshot for the "after" cards, unlocks, and stat column. Includes this node. */
    afterView: ResearchView;
}

export interface BuildResearchNodePreviewInput {
    treeId: string;
    node: ResearchNodeDef;
    researchTrees?: Record<string, string[]>;
    researchNodeLevels?: ResearchNodeLevels;
    /** Purchased level. Omit for an unowned node. */
    currentLevel?: number;
    /**
     * Equipped item ids. Used to resolve tag-targeted modifiers onto the abilities
     * this character actually has. Omit and the preview falls back to `modifiesAbility`.
     */
    equipment?: readonly string[];
}

const HANDLED_PASSIVE_KEYS = new Set<PassiveStatKey>([
    PassiveStatKey.MaxHealth,
    PassiveStatKey.MaxHunger,
    PassiveStatKey.AllDamage,
    PassiveStatKey.EarthDamage,
    PassiveStatKey.PetMaxHealth,
    PassiveStatKey.MaxMovementPoints,
    PassiveStatKey.MovementRegenPerRound,
    PassiveStatKey.LightRegenEnabled,
]);

const LIGHT_REGEN_ON = 'On';
const LIGHT_REGEN_OFF = 'Off';

export function researchPreviewIsEmpty(preview: ResearchNodePreview): boolean {
    return preview.stats.length === 0 && preview.unlocks.length === 0 && preview.upgrades.length === 0;
}

export function buildResearchNodePreview(input: BuildResearchNodePreviewInput): ResearchNodePreview {
    const current = cloneView({
        researchTrees: input.researchTrees ?? {},
        researchNodeLevels: input.researchNodeLevels,
    });
    const maxLevels = getNodeMaxLevels(input.node);
    const currentLevel = input.currentLevel ?? getNodeLevel(
        input.treeId,
        input.node.id,
        current.researchTrees,
        current.researchNodeLevels,
    );
    const { before, after } = previewLevels(currentLevel, maxLevels);
    const beforeView = withNodeAtLevel(current, input.treeId, input.node.id, before);
    const afterView = withNodeAtLevel(current, input.treeId, input.node.id, after);
    const abilityIds = loadoutAbilityIds(input.equipment, afterView, input.node);
    const { unlocks, upgrades } = collectAbilityChanges(input.node, abilityIds);

    return {
        stats: diffStatSheets(readStatSheet(beforeView), readStatSheet(afterView)),
        unlocks,
        upgrades,
        beforeView,
        afterView,
    };
}

/** Next purchase, or the last rank when the node is already maxed. */
export function previewLevels(currentLevel: number, maxLevels: number): { before: number; after: number } {
    if (currentLevel >= maxLevels) {
        return { before: Math.max(0, maxLevels - 1), after: maxLevels };
    }
    return { before: Math.max(0, currentLevel), after: currentLevel + 1 };
}

function cloneView(view: ResearchView): ResearchView {
    const researchTrees: Record<string, string[]> = {};
    for (const [treeId, ids] of Object.entries(view.researchTrees)) {
        researchTrees[treeId] = [...ids];
    }
    const researchNodeLevels: ResearchNodeLevels = {};
    for (const [treeId, levels] of Object.entries(view.researchNodeLevels ?? {})) {
        researchNodeLevels[treeId] = { ...levels };
    }
    return { researchTrees, researchNodeLevels };
}

function withNodeAtLevel(view: ResearchView, treeId: string, nodeId: string, level: number): ResearchView {
    const next = cloneView(view);
    const ids = (next.researchTrees[treeId] ?? []).filter((id) => id !== nodeId);
    if (level > 0) ids.push(nodeId);
    next.researchTrees[treeId] = ids;
    const levels = { ...(next.researchNodeLevels?.[treeId] ?? {}) };
    if (level > 0) levels[nodeId] = level;
    else delete levels[nodeId];
    next.researchNodeLevels = { ...(next.researchNodeLevels ?? {}), [treeId]: levels };
    return next;
}

function loadoutAbilityIds(
    equipment: readonly string[] | undefined,
    view: ResearchView,
    node: ResearchNodeDef,
): string[] {
    const ids: string[] = [];
    const push = (id: string) => {
        if (!ids.includes(id)) ids.push(id);
    };
    if (equipment) {
        for (const id of resolveCharacterLoadout(equipment, view.researchTrees).abilityIds) push(id);
    }
    for (const effect of node.effects) {
        if (effect.type === 'addCard') push(effect.cardId);
        if (effect.type === 'replaceCard') push(effect.toCardId);
        if (effect.type === 'grantPetAbility') push(effect.abilityId);
    }
    return expandAbilityIdsForResearchModifiers(ids);
}

function collectAbilityChanges(
    node: ResearchNodeDef,
    abilityIds: readonly string[],
): { unlocks: string[]; upgrades: ResearchPreviewUpgrade[] } {
    const unlocks: string[] = [];
    const upgrades: ResearchPreviewUpgrade[] = [];
    const replacedTo = new Set<string>();

    for (const effect of node.effects) {
        if (effect.type !== 'replaceCard') continue;
        replacedTo.add(effect.toCardId);
        pushUpgrade(upgrades, effect.fromCardId, effect.toCardId);
    }
    for (const effect of node.effects) {
        if (effect.type === 'addCard' && !replacedTo.has(effect.cardId)) pushUnique(unlocks, effect.cardId);
        if (effect.type === 'grantPetAbility') pushUnique(unlocks, effect.abilityId);
    }
    // Virtual roots are the weapon item, not a rewrite. Unlock the item's cards.
    for (const itemId of getVirtualRootItemIds(node)) {
        for (const cardId of getItemDef(itemId)?.cardsToAdd ?? []) {
            if (!replacedTo.has(cardId)) pushUnique(unlocks, cardId);
        }
    }
    for (const modifier of node.abilityResearchModifiers ?? []) {
        if (modifier.abilitySpecification.type !== 'abilityId') continue;
        const id = modifier.abilitySpecification.abilityId;
        if (unlocks.includes(id) || upgradeCovers(upgrades, id)) continue;
        pushUpgrade(upgrades, id, id);
    }
    for (const modifier of node.abilityResearchModifiers ?? []) {
        if (modifier.abilitySpecification.type !== 'tag') continue;
        for (const id of abilitiesWithTag(modifier, abilityIds)) {
            if (unlocks.includes(id) || upgradeCovers(upgrades, id)) continue;
            pushUpgrade(upgrades, id, id);
        }
    }
    if (node.modifiesAbility) {
        const { from, to } = node.modifiesAbility;
        const already = upgrades.some((pair) => pair.beforeAbilityId === from && pair.afterAbilityId === to);
        const sameIdCovered = from === to && upgradeCovers(upgrades, from);
        const isUnlock = unlocks.includes(from) || unlocks.includes(to);
        const resolvedDifferentPair = from !== to
            && (node.abilityResearchModifiers?.length ?? 0) > 0
            && upgrades.length > 0;
        if (!already && !sameIdCovered && !isUnlock && !resolvedDifferentPair) {
            pushUpgrade(upgrades, from, to);
        }
    }
    return { unlocks, upgrades };
}

function abilitiesWithTag(modifier: AbilityResearchModifier, abilityIds: readonly string[]): string[] {
    if (modifier.abilitySpecification.type !== 'tag') return [];
    const tag = modifier.abilitySpecification.tag;
    return abilityIds.filter((id) => getAbilityTagsForId(id).some((abilityTag) => abilityTag === tag));
}

function pushUnique(ids: string[], id: string): void {
    if (!ids.includes(id)) ids.push(id);
}

function pushUpgrade(upgrades: ResearchPreviewUpgrade[], beforeAbilityId: string, afterAbilityId: string): void {
    if (upgrades.some((pair) => pair.beforeAbilityId === beforeAbilityId && pair.afterAbilityId === afterAbilityId)) {
        return;
    }
    upgrades.push({ beforeAbilityId, afterAbilityId });
}

function upgradeCovers(upgrades: readonly ResearchPreviewUpgrade[], abilityId: string): boolean {
    return upgrades.some((pair) => pair.beforeAbilityId === abilityId || pair.afterAbilityId === abilityId);
}

interface StatSheet {
    maxHealth: number;
    maxHunger: number;
    maxMovement: number;
    movementRegen: number;
    petHealth: number;
    lightRegen: boolean;
    allDamageFlat: number;
    allDamageMult: number;
    earthDamageAdd: number;
    earthDamageMult: number;
    passives: PassiveBonuses;
    missionStart: Map<string, number>;
    bonusRewards: Partial<Record<CampaignResourceKey, number>>;
}

function readStatSheet(view: ResearchView): StatSheet {
    const getResearchNodes = (treeId: string) => view.researchTrees[treeId] ?? [];
    const passives = computePassiveBonuses(view.researchTrees, view.researchNodeLevels, () => true);
    const healthBonus = getHealthBonusFromResearch(getResearchNodes);
    const baseHp = getDefaultHp(PLAYER_CHARACTER_ID);
    return {
        maxHealth: applyPassiveBonusToBase(baseHp + healthBonus, passives[PassiveStatKey.MaxHealth]),
        maxHunger: getCharacterMaxHunger(view.researchTrees, view.researchNodeLevels),
        maxMovement: applyPassiveBonusToBase(MOVEMENT_BASE_MAX, passives[PassiveStatKey.MaxMovementPoints]),
        movementRegen: applyPassiveBonusToBase(
            MOVEMENT_BASE_RECOVERY_PER_ROUND,
            passives[PassiveStatKey.MovementRegenPerRound],
        ),
        petHealth: petMaxHealth(view, passives),
        lightRegen: (passives[PassiveStatKey.LightRegenEnabled]?.add ?? 0) >= LIGHT_REGEN_ENABLED_ADD,
        allDamageFlat: getDamageBonusFromResearch(getResearchNodes),
        allDamageMult: passives[PassiveStatKey.AllDamage]?.mult ?? DEFAULT_PASSIVE_MULT,
        earthDamageAdd: passives[PassiveStatKey.EarthDamage]?.add ?? 0,
        earthDamageMult: passives[PassiveStatKey.EarthDamage]?.mult ?? DEFAULT_PASSIVE_MULT,
        passives,
        missionStart: getMissionStartResourcesFromResearch(view.researchTrees),
        bonusRewards: collectBonusRewards(view),
    };
}

function petMaxHealth(view: ResearchView, passives: PassiveBonuses): number {
    const pets = getPetsFromResearch(view.researchTrees);
    const characterId = pets.length > 0
        ? (getPetDef(pets[0])?.unitCharacterId ?? pets[0])
        : (getPetDef('dog')?.unitCharacterId ?? 'dog');
    return applyPassiveBonusToBase(getDefaultHp(characterId), passives[PassiveStatKey.PetMaxHealth]);
}

function collectBonusRewards(view: ResearchView): Partial<Record<CampaignResourceKey, number>> {
    const out: Partial<Record<CampaignResourceKey, number>> = {};
    for (const tree of RESEARCH_TREES) {
        for (const node of tree.nodes) {
            if (!node.bonusRewards) continue;
            const level = getNodeLevel(tree.id, node.id, view.researchTrees, view.researchNodeLevels);
            if (level <= 0) continue;
            const maxLevels = getNodeMaxLevels(node);
            for (const [key, amount] of Object.entries(node.bonusRewards) as Array<[CampaignResourceKey, number]>) {
                const scaled = Math.floor((amount * level) / maxLevels);
                if (scaled === 0) continue;
                out[key] = (out[key] ?? 0) + scaled;
            }
        }
    }
    return out;
}

function diffStatSheets(before: StatSheet, after: StatSheet): ResearchPreviewStat[] {
    const rows: ResearchPreviewStat[] = [];
    pushBattle(rows, 'maxHealth', PassiveStatKey.MaxHealth, 'hp', before.maxHealth, after.maxHealth);
    pushCampaign(rows, 'maxHunger', PassiveStatKey.MaxHunger, 'hunger', before.maxHunger, after.maxHunger);
    pushBattle(rows, 'maxMovement', PassiveStatKey.MaxMovementPoints, 'movement_points', before.maxMovement, after.maxMovement);
    pushBattle(
        rows,
        'movementRegen',
        PassiveStatKey.MovementRegenPerRound,
        'movement_points',
        before.movementRegen,
        after.movementRegen,
    );
    pushBattle(rows, 'petHealth', PassiveStatKey.PetMaxHealth, 'hp', before.petHealth, after.petHealth);
    if (before.lightRegen !== after.lightRegen) {
        rows.push({
            id: 'lightRegen',
            label: PASSIVE_STAT_LABELS[PassiveStatKey.LightRegenEnabled],
            kind: 'battle',
            resourceId: 'light',
            before: before.lightRegen ? LIGHT_REGEN_ON : LIGHT_REGEN_OFF,
            after: after.lightRegen ? LIGHT_REGEN_ON : LIGHT_REGEN_OFF,
        });
    }
    const beforeDamage = formatDamagePhrase(
        PassiveStatKey.AllDamage,
        before.allDamageFlat,
        before.allDamageMult,
    );
    const afterDamage = formatDamagePhrase(
        PassiveStatKey.AllDamage,
        after.allDamageFlat,
        after.allDamageMult,
    );
    if (beforeDamage !== afterDamage) {
        rows.push({ id: 'allDamage', label: PASSIVE_STAT_LABELS[PassiveStatKey.AllDamage], kind: 'text', before: beforeDamage, after: afterDamage });
    }
    const beforeEarth = formatDamagePhrase(PassiveStatKey.EarthDamage, before.earthDamageAdd, before.earthDamageMult);
    const afterEarth = formatDamagePhrase(PassiveStatKey.EarthDamage, after.earthDamageAdd, after.earthDamageMult);
    if (beforeEarth !== afterEarth) {
        rows.push({ id: 'earthDamage', label: PASSIVE_STAT_LABELS[PassiveStatKey.EarthDamage], kind: 'text', before: beforeEarth, after: afterEarth });
    }
    for (const key of Object.values(PassiveStatKey)) {
        if (HANDLED_PASSIVE_KEYS.has(key)) continue;
        const beforePhrase = formatPassivePhrase(key, before.passives[key]);
        const afterPhrase = formatPassivePhrase(key, after.passives[key]);
        if (beforePhrase === afterPhrase) continue;
        rows.push({ id: `passive:${key}`, label: PASSIVE_STAT_LABELS[key], kind: 'text', before: beforePhrase, after: afterPhrase });
    }
    const resourceIds = new Set<string>([...before.missionStart.keys(), ...after.missionStart.keys()]);
    for (const resourceId of [...resourceIds].sort()) {
        const beforeAmount = before.missionStart.get(resourceId) ?? 0;
        const afterAmount = after.missionStart.get(resourceId) ?? 0;
        if (beforeAmount === afterAmount) continue;
        rows.push({
            id: `missionStart:${resourceId}`,
            label: battleResourceName(resourceId),
            kind: 'battle',
            resourceId,
            before: String(beforeAmount),
            after: String(afterAmount),
        });
    }
    const rewardKeys = new Set<CampaignResourceKey>([
        ...Object.keys(before.bonusRewards) as CampaignResourceKey[],
        ...Object.keys(after.bonusRewards) as CampaignResourceKey[],
    ]);
    for (const resource of [...rewardKeys].sort()) {
        const beforeAmount = before.bonusRewards[resource] ?? 0;
        const afterAmount = after.bonusRewards[resource] ?? 0;
        if (beforeAmount === afterAmount) continue;
        rows.push({
            id: `bonusReward:${resource}`,
            label: campaignResourceDef(resource).label,
            kind: 'campaign',
            resource,
            before: String(beforeAmount),
            after: String(afterAmount),
        });
    }
    return rows;
}

function pushBattle(
    rows: ResearchPreviewStat[],
    id: string,
    key: PassiveStatKey,
    resourceId: string,
    before: number,
    after: number,
): void {
    if (before === after) return;
    rows.push({
        id,
        label: PASSIVE_STAT_LABELS[key],
        kind: 'battle',
        resourceId,
        before: String(before),
        after: String(after),
    });
}

function pushCampaign(
    rows: ResearchPreviewStat[],
    id: string,
    key: PassiveStatKey,
    resource: CampaignResourceKey,
    before: number,
    after: number,
): void {
    if (before === after) return;
    rows.push({
        id,
        label: PASSIVE_STAT_LABELS[key],
        kind: 'campaign',
        resource,
        before: String(before),
        after: String(after),
    });
}

function formatSigned(n: number): string {
    if (n > 0) return `+${n}`;
    if (n === 0) return '+0';
    return String(n);
}

/**
 * Flat training damage and a percent passive share one line.
 * Percent-only matches "All Damage +0%" / "All Damage +10%".
 * Flat-only omits the percent. Both are shown when the character has each.
 */
function formatDamagePhrase(key: PassiveStatKey.AllDamage | PassiveStatKey.EarthDamage, flat: number, mult: number): string {
    const label = PASSIVE_STAT_LABELS[key];
    const pct = Math.round((mult - DEFAULT_PASSIVE_MULT) * 100);
    if (flat === 0) return `${label} ${formatSigned(pct)}%`;
    if (pct === 0) return `${label} ${formatSigned(flat)}`;
    return `${label} ${formatSigned(flat)}, ${formatSigned(pct)}%`;
}

function formatPassivePhrase(
    key: PassiveStatKey,
    entry: { add: number; mult: number } | undefined,
): string {
    const label = PASSIVE_STAT_LABELS[key];
    const add = entry?.add ?? 0;
    const pct = Math.round(((entry?.mult ?? DEFAULT_PASSIVE_MULT) - DEFAULT_PASSIVE_MULT) * 100);
    if (add !== 0 && pct !== 0) return `${label} ${formatSigned(add)}, ${formatSigned(pct)}%`;
    if (pct !== 0) return `${label} ${formatSigned(pct)}%`;
    return `${label} ${formatSigned(add)}`;
}

function battleResourceName(resourceId: string): string {
    return ALL_RESOURCE_DISPLAY_DEFS.find((def) => def.id === resourceId)?.name ?? resourceId;
}

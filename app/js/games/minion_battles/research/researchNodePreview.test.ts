import { describe, expect, it } from 'vitest';
import { getAbility } from '../abilities/AbilityRegistry';
import { getAbilityModifier } from '../abilities/abilityModifierHelpers';
import { applyDamageModifier } from '../abilities/damageModifiers';
import { formatTooltipNumber } from '../abilities/tooltipTokens';
import { MORE_ROCK_HIT_COUNT, THROW_ROCK_BASE_DAMAGE } from '../card_defs/0107_ThrowRock/0107Ability';
import {
    GRAVITY_CORE_MISSION_START_AMOUNT,
    GRAVITY_LOCUS_ABILITY_ID,
    GRAVITY_LOCUS_REPULSE_EXPLOSION_DAMAGE,
} from '../card_defs/09_gravity_core/gravityConstants';
import { rocksItem } from '../character_defs/items/hands/001_rocks';
import { getDefaultHp, PLAYER_CHARACTER_ID } from '../game/units/unit_defs/unitDef';
import { getAddAtLevel, getMultBonusAtLevel } from '../../../researchTrees/passiveBonuses';
import { PASSIVE_STAT_LABELS } from '../../../researchTrees/passiveStatLabels';
import { PassiveStatKey, type ResearchNodeDef, type ResearchTreeDef } from '../../../researchTrees/types';
import { earthTree, EARTH_ATTUNED_CLAW_ABILITY_IDS, EARTH_ATTUNED_LEVELS, EARTH_ATTUNED_MAX_MOVEMENT_ADD, EARTH_NODE_EARTH_ATTUNED, EARTH_NODE_ROCK_SYNERGY_DAMAGE, EARTH_TREE_ID } from '../../../researchTrees/trees/earth';
import {
    GRAVITY_NODE_COLLAPSE,
    GRAVITY_NODE_CORE,
    GRAVITY_NODE_REPULSE,
    GRAVITY_TREE_ID,
    gravityTree,
} from '../../../researchTrees/trees/gravity';
import {
    TRAINING_HEALTHY_LEVELS,
    TRAINING_HEALTHY_MAX_HEALTH_ADD,
    TRAINING_MIGHTY_ALL_DAMAGE_MULT,
    TRAINING_MIGHTY_LEVELS,
    TRAINING_NODE_CORE,
    TRAINING_NODE_DOUBLE_PUNCH,
    TRAINING_NODE_HEALTHY,
    TRAINING_NODE_MIGHTY,
    TRAINING_TREE_ID,
    trainingTree,
} from '../../../researchTrees/trees/training';
import { getItemDef } from '../character_defs/items';
import {
    NODE_MORE_ROCK,
    SHIELD_ROOT_NODE_ID,
    WEAPONS_TREE_ID,
    WEAPON_ITEM_SHIELD,
} from '../../../researchTrees/trees/weaponTreeIds';
import { weaponsTree } from '../../../researchTrees/trees/weapons';
import { RESEARCH_DAMAGE_BONUSES, RESEARCH_HEALTH_BONUSES } from './researchTrainingEffects';
import { MOVEMENT_BASE_MAX } from '../resources/Movement';
import { buildResearchNodePreview, type ResearchNodePreview } from './researchNodePreview';

function nodeById(tree: ResearchTreeDef, id: string): ResearchNodeDef {
    const node = tree.nodes.find((entry) => entry.id === id);
    if (!node) throw new Error(`missing node ${id}`);
    return node;
}

function stat(preview: ResearchNodePreview, id: string) {
    return preview.stats.find((row) => row.id === id);
}

const ALL_DAMAGE = PASSIVE_STAT_LABELS[PassiveStatKey.AllDamage];
const MIGHTY_ONE_LEVEL_MULT = 1 + getMultBonusAtLevel(
    TRAINING_MIGHTY_ALL_DAMAGE_MULT,
    1,
    TRAINING_MIGHTY_LEVELS,
);

describe('buildResearchNodePreview', () => {
    it('shows a health icon delta for a max-health passive', () => {
        const preview = buildResearchNodePreview({
            treeId: TRAINING_TREE_ID,
            node: nodeById(trainingTree, TRAINING_NODE_HEALTHY),
        });
        const add = getAddAtLevel(TRAINING_HEALTHY_MAX_HEALTH_ADD, 1, TRAINING_HEALTHY_LEVELS);
        const base = getDefaultHp(PLAYER_CHARACTER_ID);
        expect(stat(preview, 'maxHealth')).toMatchObject({
            kind: 'battle',
            resourceId: 'hp',
            before: String(base),
            after: String(base + add),
        });
        expect(preview.unlocks).toEqual([]);
        expect(preview.upgrades).toEqual([]);
    });

    it('phrases an all-damage percent with no icon', () => {
        const preview = buildResearchNodePreview({
            treeId: TRAINING_TREE_ID,
            node: nodeById(trainingTree, TRAINING_NODE_MIGHTY),
        });
        const pct = Math.round((MIGHTY_ONE_LEVEL_MULT - 1) * 100);
        expect(stat(preview, 'allDamage')).toEqual({
            id: 'allDamage',
            label: ALL_DAMAGE,
            kind: 'text',
            before: `${ALL_DAMAGE} +0%`,
            after: `${ALL_DAMAGE} +${pct}%`,
        });
    });

    it('keeps an owned damage percent in a flat damage before and after', () => {
        const preview = buildResearchNodePreview({
            treeId: TRAINING_TREE_ID,
            node: nodeById(trainingTree, TRAINING_NODE_CORE),
            researchTrees: { [TRAINING_TREE_ID]: [TRAINING_NODE_MIGHTY] },
            researchNodeLevels: { [TRAINING_TREE_ID]: { [TRAINING_NODE_MIGHTY]: 1 } },
        });
        const pct = Math.round((MIGHTY_ONE_LEVEL_MULT - 1) * 100);
        const flat = RESEARCH_DAMAGE_BONUSES[TRAINING_NODE_CORE];
        const health = RESEARCH_HEALTH_BONUSES[TRAINING_NODE_CORE];
        const base = getDefaultHp(PLAYER_CHARACTER_ID);
        expect(stat(preview, 'allDamage')).toMatchObject({
            before: `${ALL_DAMAGE} +${pct}%`,
            after: `${ALL_DAMAGE} +${flat}, +${pct}%`,
        });
        expect(stat(preview, 'maxHealth')).toMatchObject({
            before: String(base),
            after: String(base + health),
        });
    });

    it('treats a granted ability as an unlock, including its starting resource', () => {
        const node = nodeById(gravityTree, GRAVITY_NODE_CORE);
        const preview = buildResearchNodePreview({ treeId: GRAVITY_TREE_ID, node });
        const granted = node.effects.flatMap((effect) => effect.type === 'addCard' ? [effect.cardId] : []);
        expect(preview.unlocks).toEqual(granted);
        expect(preview.upgrades).toEqual([]);
        expect(stat(preview, 'missionStart:gravity')).toMatchObject({
            kind: 'battle',
            resourceId: 'gravity',
            before: '0',
            after: String(GRAVITY_CORE_MISSION_START_AMOUNT),
        });
    });

    it('shows a weapon virtual root as unlocking the item ability', () => {
        const node = nodeById(weaponsTree, SHIELD_ROOT_NODE_ID);
        const preview = buildResearchNodePreview({ treeId: WEAPONS_TREE_ID, node });
        const granted = getItemDef(WEAPON_ITEM_SHIELD)?.cardsToAdd ?? [];
        expect(granted.length).toBeGreaterThan(0);
        expect(preview.unlocks).toEqual(granted);
        expect(preview.upgrades).toEqual([]);
    });

    it('shows Collapse as an unlock rather than a Gravity Locus rewrite', () => {
        const node = nodeById(gravityTree, GRAVITY_NODE_COLLAPSE);
        const preview = buildResearchNodePreview({ treeId: GRAVITY_TREE_ID, node });
        expect(preview.upgrades).toEqual([]);
        expect(preview.unlocks).toEqual(
            node.effects.flatMap((effect) => effect.type === 'addCard' ? [effect.cardId] : []),
        );
    });

    it('shows an ability modifier as the same card before and after, with the new behaviour', () => {
        const preview = buildResearchNodePreview({
            treeId: GRAVITY_TREE_ID,
            node: nodeById(gravityTree, GRAVITY_NODE_REPULSE),
        });
        expect(preview.unlocks).toEqual([]);
        expect(preview.upgrades).toEqual([{
            beforeAbilityId: GRAVITY_LOCUS_ABILITY_ID,
            afterAbilityId: GRAVITY_LOCUS_ABILITY_ID,
        }]);
        const locus = getAbility(GRAVITY_LOCUS_ABILITY_ID);
        expect(locus).toBeDefined();
        expect(locus!.getTooltipText(preview.beforeView).join(' ')).not.toContain('Repulse');
        expect(locus!.getTooltipText(preview.afterView).join(' ')).toContain('Repulse');
        expect(getAbilityModifier(preview.afterView, undefined, GRAVITY_LOCUS_ABILITY_ID).explosionDamageFlat)
            .toBe(GRAVITY_LOCUS_REPULSE_EXPLOSION_DAMAGE);
    });

    it('shows a card replacement as before and after abilities', () => {
        const node = nodeById(trainingTree, TRAINING_NODE_DOUBLE_PUNCH);
        const preview = buildResearchNodePreview({ treeId: TRAINING_TREE_ID, node });
        const replace = node.effects.find((effect) => effect.type === 'replaceCard');
        expect(replace?.type).toBe('replaceCard');
        if (replace?.type !== 'replaceCard') return;
        expect(preview.upgrades).toEqual([{
            beforeAbilityId: replace.fromCardId,
            afterAbilityId: replace.toCardId,
        }]);
        expect(preview.unlocks).toEqual([]);
    });

    it('includes other damage bonuses on both sides of an ability upgrade', () => {
        const node = nodeById(earthTree, EARTH_NODE_ROCK_SYNERGY_DAMAGE);
        const trees = { [TRAINING_TREE_ID]: [TRAINING_NODE_MIGHTY] };
        const levels = { [TRAINING_TREE_ID]: { [TRAINING_NODE_MIGHTY]: 1 } };
        const beforeTrees = structuredClone(trees);
        const preview = buildResearchNodePreview({
            treeId: EARTH_TREE_ID,
            node,
            researchTrees: trees,
            researchNodeLevels: levels,
            equipment: [rocksItem.id],
        });
        expect(trees).toEqual(beforeTrees);
        expect(preview.upgrades.map((pair) => pair.beforeAbilityId)).toContain('throw_rock');
        const flat = node.abilityResearchModifiers?.find((modifier) => modifier.damageFlat != null)?.damageFlat ?? 0;
        const beforeDamage = formatTooltipNumber(applyDamageModifier(
            THROW_ROCK_BASE_DAMAGE,
            { flatAmt: 0, multiplier: MIGHTY_ONE_LEVEL_MULT },
        ));
        const afterDamage = formatTooltipNumber(applyDamageModifier(
            THROW_ROCK_BASE_DAMAGE + flat,
            { flatAmt: 0, multiplier: MIGHTY_ONE_LEVEL_MULT },
        ));
        const rock = getAbility('throw_rock');
        expect(rock).toBeDefined();
        const beforeText = rock!.getTooltipText(preview.beforeView).join(' ');
        const afterText = rock!.getTooltipText(preview.afterView).join(' ');
        expect(beforeText).toContain(beforeDamage);
        expect(afterText).toContain(afterDamage);
        expect(beforeDamage).not.toBe(afterDamage);
    });

    it('shows the extra rock on the after throw-rock card', () => {
        const preview = buildResearchNodePreview({
            treeId: WEAPONS_TREE_ID,
            node: nodeById(weaponsTree, NODE_MORE_ROCK),
            equipment: [rocksItem.id],
        });
        expect(preview.upgrades).toEqual([{ beforeAbilityId: 'throw_rock', afterAbilityId: 'throw_rock' }]);
        const rock = getAbility('throw_rock');
        expect(rock).toBeDefined();
        const beforeText = rock!.getTooltipText(preview.beforeView).join(' ');
        const afterText = rock!.getTooltipText(preview.afterView).join(' ');
        expect(beforeText).toContain('Throws a rock dealing');
        // Tooltip lines wrap numbers in braces for the renderer (`{2}`, `{6}`).
        expect(afterText).toContain(`Throws {${MORE_ROCK_HIT_COUNT}} rocks dealing`);
    });

    it('lists each ability a stat node modifies, plus the player stat', () => {
        const preview = buildResearchNodePreview({
            treeId: EARTH_TREE_ID,
            node: nodeById(earthTree, EARTH_NODE_EARTH_ATTUNED),
        });
        const movementAdd = getAddAtLevel(EARTH_ATTUNED_MAX_MOVEMENT_ADD, 1, EARTH_ATTUNED_LEVELS);
        expect(stat(preview, 'maxMovement')).toMatchObject({
            kind: 'battle',
            resourceId: 'movement_points',
            before: String(MOVEMENT_BASE_MAX),
            after: String(MOVEMENT_BASE_MAX + movementAdd),
        });
        expect(preview.upgrades.map((pair) => pair.afterAbilityId).sort()).toEqual(
            [...EARTH_ATTUNED_CLAW_ABILITY_IDS].sort(),
        );
    });
});

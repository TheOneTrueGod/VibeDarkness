import { describe, expect, it } from 'vitest';
import { RESEARCH_TREES, getResearchTreeContainingNode } from './list';
import {
    RESEARCH_TREE_COLOUR_ARMORY,
    RESEARCH_TREE_COLOUR_BLOOD_MAGE,
    RESEARCH_TREE_COLOUR_COMMAND,
    RESEARCH_TREE_COLOUR_DARKNESS,
    RESEARCH_TREE_COLOUR_EARTH,
    RESEARCH_TREE_COLOUR_GENERIC,
    RESEARCH_TREE_COLOUR_GRAVITY,
    RESEARCH_TREE_COLOUR_LIGHT,
    RESEARCH_TREE_COLOUR_WEAPON,
    RESEARCH_TREE_ICON_ARMORY,
    RESEARCH_TREE_ICON_BLOOD_MAGE,
    RESEARCH_TREE_ICON_COMMAND,
    RESEARCH_TREE_ICON_EARTH,
    RESEARCH_TREE_ICON_GENERIC,
    RESEARCH_TREE_ICON_GRAVITY,
    RESEARCH_TREE_ICON_LIGHT,
    RESEARCH_TREE_ICON_WEAPON,
    researchChromeSurfaceStyle,
    resolveResearchTreeChrome,
} from './researchTreeChrome';
import { ABILITY_THEMES } from '../games/minion_battles/themes/abilityThemes';
import { weaponsTree } from './trees/weapons';
import { earthTree } from './trees/earth';
import { lightTree } from './trees/light';
import { gravityTree } from './trees/gravity';
import { commandCoreTree } from './trees/command_core';
import { bloodMageTree } from './trees/blood_mage';
import { armoryTree } from './trees/armory';
import { trainingTree } from './trees/training';
import { miscTree } from './trees/misc';
import { darknessUpgradesTree } from './trees/darkness_upgrades';

describe('research tree chrome', () => {
    it('falls back to generic colour and icon when no tree is provided', () => {
        expect(resolveResearchTreeChrome(undefined)).toEqual({
            colour: '#7dd3fc',
            icon: RESEARCH_TREE_ICON_GENERIC,
        });
    });

    it('uses the tree theme primary and icon when present', () => {
        expect(resolveResearchTreeChrome(earthTree)).toEqual({
            colour: '#b45309',
            icon: RESEARCH_TREE_ICON_EARTH,
        });
    });

    it('keeps the exported border colours equal to the theme primaries', () => {
        expect(RESEARCH_TREE_COLOUR_WEAPON).toBe('#9ca3af');
        expect(RESEARCH_TREE_COLOUR_EARTH).toBe('#b45309');
        expect(RESEARCH_TREE_COLOUR_LIGHT).toBe('#eab308');
        expect(RESEARCH_TREE_COLOUR_GRAVITY).toBe('#a855f7');
        expect(RESEARCH_TREE_COLOUR_COMMAND).toBe('#0f766e');
        expect(RESEARCH_TREE_COLOUR_BLOOD_MAGE).toBe('#f87171');
        expect(RESEARCH_TREE_COLOUR_DARKNESS).toBe('#6366f1');
        expect(RESEARCH_TREE_COLOUR_GENERIC).toBe('#7dd3fc');
        expect(RESEARCH_TREE_COLOUR_ARMORY).toBe('#4f6d8c');
    });
});

describe('research tree appearance', () => {
    it('gives every tree a known theme and an icon', () => {
        for (const tree of RESEARCH_TREES) {
            expect(ABILITY_THEMES[tree.theme], tree.id).toBeDefined();
            expect(resolveResearchTreeChrome(tree).colour).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(tree.icon).toBeTruthy();
        }
    });

    it('uses weapon chrome on the Weapons tree', () => {
        expect(resolveResearchTreeChrome(weaponsTree)).toEqual({ colour: '#9ca3af', icon: RESEARCH_TREE_ICON_WEAPON });
    });

    it('keeps each primary-only tree border-only, with today\'s colour', () => {
        const cases = [
            [earthTree, '#b45309', RESEARCH_TREE_ICON_EARTH],
            [lightTree, '#eab308', RESEARCH_TREE_ICON_LIGHT],
            [gravityTree, '#a855f7', RESEARCH_TREE_ICON_GRAVITY],
            [bloodMageTree, '#f87171', RESEARCH_TREE_ICON_BLOOD_MAGE],
            [darknessUpgradesTree, '#6366f1', RESEARCH_TREE_ICON_GENERIC],
            [trainingTree, '#7dd3fc', RESEARCH_TREE_ICON_GENERIC],
            [miscTree, '#7dd3fc', RESEARCH_TREE_ICON_GENERIC],
        ] as const;
        for (const [tree, colour, icon] of cases) {
            const chrome = resolveResearchTreeChrome(tree);
            expect(chrome, tree.id).toEqual({ colour, icon });
            expect(researchChromeSurfaceStyle(chrome)).toEqual({ borderColor: colour });
        }
    });

    it('gives the Armory tree its secondary fill and font', () => {
        const chrome = resolveResearchTreeChrome(armoryTree);
        expect(chrome).toEqual({
            colour: '#4f6d8c',
            secondaryColour: '#e7e5e4',
            fontColour: '#000000',
            icon: RESEARCH_TREE_ICON_ARMORY,
        });
        expect(researchChromeSurfaceStyle(chrome)).toEqual({
            borderColor: '#4f6d8c',
            color: '#000000',
            backgroundColor: '#e7e5e4',
        });
        expect(researchChromeSurfaceStyle(chrome, true)).toEqual({
            borderColor: '#4f6d8c',
            color: '#000000',
            backgroundColor: '#e7e5e4',
            boxShadow: 'inset 0 0 0 2px #4f6d8c',
        });
    });

    it('gives the Command tree its Aurora secondary fill and font', () => {
        expect(resolveResearchTreeChrome(commandCoreTree)).toEqual({
            colour: '#0f766e',
            secondaryColour: '#d9f99d',
            fontColour: '#042f2e',
            icon: RESEARCH_TREE_ICON_COMMAND,
        });
    });

    it('resolves a node to its owning tree chrome', () => {
        const owning = getResearchTreeContainingNode(earthTree.nodes[0]!.id);
        expect(owning).toBe(earthTree);
        expect(resolveResearchTreeChrome(owning).colour).toBe('#b45309');
    });
});

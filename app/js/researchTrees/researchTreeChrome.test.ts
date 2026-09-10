import { describe, expect, it } from 'vitest';
import { RESEARCH_TREES, getResearchTreeContainingNode } from './list';
import {
    RESEARCH_TREE_COLOUR_BLOOD_MAGE,
    RESEARCH_TREE_COLOUR_COMMAND,
    RESEARCH_TREE_COLOUR_EARTH,
    RESEARCH_TREE_COLOUR_GENERIC,
    RESEARCH_TREE_COLOUR_GRAVITY,
    RESEARCH_TREE_COLOUR_LIGHT,
    RESEARCH_TREE_COLOUR_WEAPON,
    RESEARCH_TREE_ICON_BLOOD_MAGE,
    RESEARCH_TREE_ICON_COMMAND,
    RESEARCH_TREE_ICON_EARTH,
    RESEARCH_TREE_ICON_GENERIC,
    RESEARCH_TREE_ICON_GRAVITY,
    RESEARCH_TREE_ICON_LIGHT,
    RESEARCH_TREE_ICON_WEAPON,
    resolveResearchTreeChrome,
} from './researchTreeChrome';
import { crystalRocksTree } from './trees/crystal_rocks';
import { stickSwordTree } from './trees/stick_sword';
import { techShieldTree } from './trees/tech_shield';
import { earthTree } from './trees/earth';
import { lightTree } from './trees/light';
import { gravityTree } from './trees/gravity';
import { commandCoreTree } from './trees/command_core';
import { bloodMageTree } from './trees/blood_mage';
import { trainingTree } from './trees/training';
import { miscTree } from './trees/misc';

describe('research tree chrome', () => {
    it('falls back to generic colour and icon when no tree is provided', () => {
        expect(resolveResearchTreeChrome(undefined)).toEqual({
            colour: RESEARCH_TREE_COLOUR_GENERIC,
            icon: RESEARCH_TREE_ICON_GENERIC,
        });
    });

    it('uses the tree colour and icon when present', () => {
        expect(resolveResearchTreeChrome(earthTree)).toEqual({
            colour: RESEARCH_TREE_COLOUR_EARTH,
            icon: RESEARCH_TREE_ICON_EARTH,
        });
    });
});

describe('research tree appearance', () => {
    it('gives every tree a colour and icon', () => {
        for (const tree of RESEARCH_TREES) {
            expect(tree.colour).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(tree.icon).toBeTruthy();
        }
    });

    it('uses weapon chrome on the starting-weapon trees', () => {
        for (const tree of [crystalRocksTree, stickSwordTree, techShieldTree]) {
            expect(tree.colour).toBe(RESEARCH_TREE_COLOUR_WEAPON);
            expect(tree.icon).toBe(RESEARCH_TREE_ICON_WEAPON);
        }
    });

    it('uses each core tree colour', () => {
        expect(earthTree.colour).toBe(RESEARCH_TREE_COLOUR_EARTH);
        expect(earthTree.icon).toBe(RESEARCH_TREE_ICON_EARTH);
        expect(lightTree.colour).toBe(RESEARCH_TREE_COLOUR_LIGHT);
        expect(lightTree.icon).toBe(RESEARCH_TREE_ICON_LIGHT);
        expect(gravityTree.colour).toBe(RESEARCH_TREE_COLOUR_GRAVITY);
        expect(gravityTree.icon).toBe(RESEARCH_TREE_ICON_GRAVITY);
        expect(commandCoreTree.colour).toBe(RESEARCH_TREE_COLOUR_COMMAND);
        expect(commandCoreTree.icon).toBe(RESEARCH_TREE_ICON_COMMAND);
        expect(bloodMageTree.colour).toBe(RESEARCH_TREE_COLOUR_BLOOD_MAGE);
        expect(bloodMageTree.icon).toBe(RESEARCH_TREE_ICON_BLOOD_MAGE);
        expect(trainingTree.colour).toBe(RESEARCH_TREE_COLOUR_GENERIC);
        expect(miscTree.colour).toBe(RESEARCH_TREE_COLOUR_GENERIC);
        expect(trainingTree.icon).toBe(RESEARCH_TREE_ICON_GENERIC);
    });

    it('resolves a node to its owning tree chrome', () => {
        const owning = getResearchTreeContainingNode(earthTree.nodes[0]!.id);
        expect(owning).toBe(earthTree);
        expect(resolveResearchTreeChrome(owning).colour).toBe(RESEARCH_TREE_COLOUR_EARTH);
    });
});

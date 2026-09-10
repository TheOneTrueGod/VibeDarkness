import { describe, expect, it } from 'vitest';
import { RESEARCH_TREES, getNodeResearchType } from './list';
import {
    RESEARCH_TYPE_COLOUR_WEAPON,
    RESEARCH_TYPE_DETAILS,
    ResearchType,
    getResearchTypeDetails,
    resolveResearchType,
} from './researchType';
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

describe('research type catalog', () => {
    it('has display name, colour, and icon for every enum value', () => {
        for (const type of Object.values(ResearchType)) {
            const details = getResearchTypeDetails(type);
            expect(details).toBe(RESEARCH_TYPE_DETAILS[type]);
            expect(details.displayName.length).toBeGreaterThan(0);
            expect(details.colour).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(details.icon).toBeTruthy();
        }
    });

    it('uses gray for weapon type', () => {
        expect(getResearchTypeDetails(ResearchType.Weapon).colour).toBe(RESEARCH_TYPE_COLOUR_WEAPON);
    });
});

describe('resolveResearchType', () => {
    it('prefers the node override, then the tree, then untyped', () => {
        expect(resolveResearchType(ResearchType.Earth, ResearchType.Weapon)).toBe(ResearchType.Earth);
        expect(resolveResearchType(undefined, ResearchType.Weapon)).toBe(ResearchType.Weapon);
        expect(resolveResearchType(undefined, undefined)).toBe(ResearchType.Untyped);
    });
});

describe('research tree types', () => {
    it('marks weapon trees and their nodes as weapon', () => {
        expect(crystalRocksTree.type).toBe(ResearchType.Weapon);
        expect(stickSwordTree.type).toBe(ResearchType.Weapon);
        expect(techShieldTree.type).toBe(ResearchType.Weapon);
        expect(getNodeResearchType(crystalRocksTree.nodes[0]!)).toBe(ResearchType.Weapon);
        expect(getNodeResearchType(stickSwordTree.nodes[0]!)).toBe(ResearchType.Weapon);
        expect(getNodeResearchType(techShieldTree.nodes[0]!)).toBe(ResearchType.Weapon);
    });

    it('matches each core tree to that core type', () => {
        expect(earthTree.type).toBe(ResearchType.Earth);
        expect(lightTree.type).toBe(ResearchType.Light);
        expect(gravityTree.type).toBe(ResearchType.Gravity);
        expect(commandCoreTree.type).toBe(ResearchType.Command);
        expect(bloodMageTree.type).toBe(ResearchType.BloodMage);
        expect(getNodeResearchType(earthTree.nodes[0]!)).toBe(ResearchType.Earth);
        expect(getNodeResearchType(lightTree.nodes[0]!)).toBe(ResearchType.Light);
        expect(getNodeResearchType(gravityTree.nodes[0]!)).toBe(ResearchType.Gravity);
        expect(getNodeResearchType(commandCoreTree.nodes[0]!)).toBe(ResearchType.Command);
        expect(getNodeResearchType(bloodMageTree.nodes[0]!)).toBe(ResearchType.BloodMage);
    });

    it('marks remaining trees untyped', () => {
        expect(trainingTree.type).toBe(ResearchType.Untyped);
        expect(miscTree.type).toBe(ResearchType.Untyped);
    });

    it('assigns a catalogued type to every registered tree', () => {
        for (const tree of RESEARCH_TREES) {
            expect(Object.values(ResearchType)).toContain(tree.type);
            expect(getResearchTypeDetails(tree.type).displayName.length).toBeGreaterThan(0);
        }
    });
});

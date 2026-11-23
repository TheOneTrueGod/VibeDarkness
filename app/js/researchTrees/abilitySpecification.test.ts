import { describe, it, expect } from 'vitest';
import { resolveSpecifiedAbilityIds, staticSpecifiedAbilityIds } from './abilitySpecification';
import { PUNCH_LINE_SPEC, weaponsTree, WEAPON_BASIC_ABILITIES_SPEC } from './trees/weapons';
import { isVirtualRootNode } from './types';

describe('resolveSpecifiedAbilityIds', () => {
    it('abilityId names that one ability', () => {
        expect(resolveSpecifiedAbilityIds({ type: 'abilityId', abilityId: 'throw_rock' })).toEqual(['throw_rock']);
    });

    it('tag matches among the unit abilities only, and names nothing without them', () => {
        const tags = (id: string) => (id === 'a' ? ['RockThrow'] : []);
        expect(resolveSpecifiedAbilityIds({ type: 'tag', tag: 'RockThrow' }, tags, ['a', 'b'])).toEqual(['a']);
        expect(resolveSpecifiedAbilityIds({ type: 'tag', tag: 'RockThrow' })).toEqual([]);
        expect(staticSpecifiedAbilityIds({ type: 'tag', tag: 'RockThrow' })).toBeNull();
    });

    it("researchTreeTier on weapons up to tier 1 is each weapon's basic ability", () => {
        const roots = weaponsTree.nodes.filter(isVirtualRootNode).map((n) => n.modifiesAbility!.to);
        expect(staticSpecifiedAbilityIds(WEAPON_BASIC_ABILITIES_SPEC)).toEqual([...new Set(roots)]);
    });

    it('abilityLine is the ability plus every replaceCard chain from it', () => {
        expect(staticSpecifiedAbilityIds(PUNCH_LINE_SPEC)).toEqual(['0120', '0116', '0117', '0118', '0119']);
        expect(staticSpecifiedAbilityIds({ type: 'abilityLine', abilityId: 'nothing_replaces_me' })).toEqual(['nothing_replaces_me']);
    });

    it('researchTreeTier honours minTier and names nothing for an unknown tree', () => {
        expect(staticSpecifiedAbilityIds({ type: 'researchTreeTier', treeId: weaponsTree.id, minTier: 2, maxTier: 1 })).toEqual([]);
        expect(staticSpecifiedAbilityIds({ type: 'researchTreeTier', treeId: 'nope', maxTier: 99 })).toEqual([]);
    });
});

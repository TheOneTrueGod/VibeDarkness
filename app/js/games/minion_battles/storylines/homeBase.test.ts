import { describe, it, expect } from 'vitest';
import {
    DEFAULT_HOME_SEGMENT_ID,
    mergePartyResearch,
    resolveHomeSegmentId,
    type HomeResolveRule,
} from './homeBase';

const FORT_SEGMENT_ID = 'home_fort_test';
const CAMP_TREE_ID = 'camp';
const WALLS_NODE_ID = 'walls';

describe('resolveHomeSegmentId', () => {
    it('returns the default home when no rules match', () => {
        expect(resolveHomeSegmentId()).toBe(DEFAULT_HOME_SEGMENT_ID);
    });

    it('uses a mission override over matching rules', () => {
        const rules: HomeResolveRule[] = [
            {
                segmentId: FORT_SEGMENT_ID,
                priority: 20,
                when: () => true,
            },
        ];
        expect(resolveHomeSegmentId({}, { missionOverride: DEFAULT_HOME_SEGMENT_ID, rules })).toBe(
            DEFAULT_HOME_SEGMENT_ID,
        );
    });

    it('picks the highest-priority matching research rule', () => {
        const rules: HomeResolveRule[] = [
            {
                segmentId: FORT_SEGMENT_ID,
                priority: 20,
                when: (ctx) => (ctx.researchTrees?.[CAMP_TREE_ID] ?? []).includes(WALLS_NODE_ID),
            },
        ];
        expect(resolveHomeSegmentId({ researchTrees: { [CAMP_TREE_ID]: [WALLS_NODE_ID] } }, { rules })).toBe(
            FORT_SEGMENT_ID,
        );
        expect(resolveHomeSegmentId({ researchTrees: { [CAMP_TREE_ID]: [] } }, { rules })).toBe(
            DEFAULT_HOME_SEGMENT_ID,
        );
    });
});

const OTHER_NODE_ID = 'roof';
const OTHER_TREE_ID = 'other';
const OTHER_TREE_NODE_ID = 'a';

describe('mergePartyResearch', () => {
    it('unions node ids across players', () => {
        const merged = mergePartyResearch({
            p1: { [CAMP_TREE_ID]: [WALLS_NODE_ID] },
            p2: { [CAMP_TREE_ID]: [OTHER_NODE_ID], [OTHER_TREE_ID]: [OTHER_TREE_NODE_ID] },
        });
        expect(merged[CAMP_TREE_ID]?.sort()).toEqual([WALLS_NODE_ID, OTHER_NODE_ID].sort());
        expect(merged[OTHER_TREE_ID]).toEqual([OTHER_TREE_NODE_ID]);
    });
});

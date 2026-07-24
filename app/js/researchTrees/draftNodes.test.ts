/**
 * Draft research nodes must not appear in available-node discovery.
 */
import { describe, expect, it } from 'vitest';
import { getAvailableResearchNodes } from './evaluator';
import {
    MISC_TREE_ID,
    MISC_NODE_AIR_CORE,
    MISC_NODE_BEAST_CORE,
    MISC_NODE_BLINK_CORE,
    MISC_NODE_CHARGED_CORE,
} from './trees/misc';

describe('draft research nodes', () => {
    it('excludes draft Lightbearer cores from getAvailableResearchNodes', () => {
        const available = getAvailableResearchNodes({}, { treeId: MISC_TREE_ID });
        const ids = new Set(available.map((n) => n.id));
        expect(ids.has(MISC_NODE_BEAST_CORE)).toBe(false);
        expect(ids.has(MISC_NODE_AIR_CORE)).toBe(false);
        expect(ids.has(MISC_NODE_CHARGED_CORE)).toBe(false);
        expect(ids.has(MISC_NODE_BLINK_CORE)).toBe(false);
    });
});

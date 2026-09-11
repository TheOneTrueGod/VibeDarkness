import { describe, expect, it } from 'vitest';
import {
    RESEARCH_NODE_COMFORTABLE_DESC_HEIGHT_EM,
    RESEARCH_NODE_COMFORTABLE_DESC_LINES,
    RESEARCH_NODE_LEADING_SNUG_EM,
    RESEARCH_NODE_LEADING_TIGHT,
    RESEARCH_NODE_REQUIREMENTS_FONT_PX,
    RESEARCH_NODE_REQUIREMENTS_LINES,
    RESEARCH_NODE_REQUIREMENTS_PAD_Y_PX,
    RESEARCH_NODE_REQUIREMENTS_SLOT_HEIGHT_PX,
} from './researchNodeCardLayout';

describe('researchNodeCardLayout', () => {
    it('reserves three leading-snug description lines on comfortable cards', () => {
        expect(RESEARCH_NODE_COMFORTABLE_DESC_LINES).toBe(3);
        expect(RESEARCH_NODE_COMFORTABLE_DESC_HEIGHT_EM).toBe(
            RESEARCH_NODE_COMFORTABLE_DESC_LINES * RESEARCH_NODE_LEADING_SNUG_EM,
        );
    });

    it('reserves two leading-tight lines for the requirements slot', () => {
        expect(RESEARCH_NODE_REQUIREMENTS_LINES).toBe(2);
        expect(RESEARCH_NODE_REQUIREMENTS_SLOT_HEIGHT_PX).toBe(
            RESEARCH_NODE_REQUIREMENTS_LINES
                * RESEARCH_NODE_REQUIREMENTS_FONT_PX
                * RESEARCH_NODE_LEADING_TIGHT
                + RESEARCH_NODE_REQUIREMENTS_PAD_Y_PX,
        );
    });
});

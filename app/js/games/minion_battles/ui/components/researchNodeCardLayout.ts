/**
 * Comfortable Upgrades-grid ResearchNodeCard layout tokens.
 * Compact (tree graph) cards keep their own footprint.
 */

/** Description lines reserved on comfortable cards (`leading-snug`). */
export const RESEARCH_NODE_COMFORTABLE_DESC_LINES = 3;

/** Tailwind `leading-snug` line-height in em. */
export const RESEARCH_NODE_LEADING_SNUG_EM = 1.375;

/** Reserved description block height so 3 lines always fit. */
export const RESEARCH_NODE_COMFORTABLE_DESC_HEIGHT_EM =
    RESEARCH_NODE_COMFORTABLE_DESC_LINES * RESEARCH_NODE_LEADING_SNUG_EM;

export const RESEARCH_NODE_COMFORTABLE_WIDTH_CLASS = 'w-[280px]';
export const RESEARCH_NODE_COMPACT_WIDTH_CLASS = 'w-[180px]';
export const RESEARCH_NODE_COMPACT_HEIGHT_CLASS = 'h-[116px]';

/** Requirements copy: `text-[10px] leading-tight`, always two lines. */
export const RESEARCH_NODE_REQUIREMENTS_LINES = 2;
export const RESEARCH_NODE_REQUIREMENTS_FONT_PX = 10;
export const RESEARCH_NODE_LEADING_TIGHT = 1.25;
/** Vertical padding on the dark strip (`py-1` = 4px × 2). */
export const RESEARCH_NODE_REQUIREMENTS_PAD_Y_PX = 8;

/** Wrapper + strip share this pixel height so empty vs visible slots stay aligned. */
export const RESEARCH_NODE_REQUIREMENTS_SLOT_HEIGHT_PX =
    RESEARCH_NODE_REQUIREMENTS_LINES * RESEARCH_NODE_REQUIREMENTS_FONT_PX * RESEARCH_NODE_LEADING_TIGHT
    + RESEARCH_NODE_REQUIREMENTS_PAD_Y_PX;

/** In-flow admin id / tier row — comfortable cards only. */
export const RESEARCH_NODE_ADMIN_FOOTER_HEIGHT_CLASS = 'h-3';

export const RESEARCH_NODE_COST_ROW_MIN_HEIGHT_CLASS = 'min-h-6';

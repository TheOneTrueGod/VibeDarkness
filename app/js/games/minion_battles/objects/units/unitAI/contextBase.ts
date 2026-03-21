/**
 * Base interface shared by every tree's AI context.
 * Lives in its own file to avoid circular imports between contextTypes and tree context files.
 */

/** Fields shared by every tree's context. */
export interface UnitAIContextBase {
    /** Current node/state within the AI tree. */
    aiState?: string;
    /** Current combat target unit ID. */
    targetUnitId?: string;
}

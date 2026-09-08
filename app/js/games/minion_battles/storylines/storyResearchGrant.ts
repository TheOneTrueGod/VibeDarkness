import type { StoryChoiceAction } from './storyTypes';

/** Research node granted by a story/quest choice action, if any. */
export function researchGrantFromStoryAction(
    action: StoryChoiceAction | undefined,
): { treeId: string; nodeId: string } | undefined {
    if (!action) return undefined;
    if (action.type === 'grant_research_to_player') {
        return { treeId: action.treeId, nodeId: action.nodeId };
    }
    if (action.type === 'equip_item' && action.alsoGrantResearch) {
        return action.alsoGrantResearch;
    }
    return undefined;
}

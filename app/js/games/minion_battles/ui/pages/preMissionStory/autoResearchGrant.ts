/**
 * `grant_research_auto` story phrases (pre- and post-mission): each player's own client grants the node
 * to their selected character with a silent STORY_CHOICE, unless `skipIfResearched` says they have it.
 */
import { MessageType } from '../../../../../MessageTypes';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import { getActiveResearchTrees } from '../../../../../researchTrees/activeResearch';
import { prepLoadoutPrimaryIdsForResearchGrant } from '../../../storylines/questPrepLoadout';
import type { GrantResearchAutoPhrase } from '../../../storylines/storyTypes';

export const AUTO_GRANT_RESEARCH_CHOICE_ID = 'auto_grant_research';

export interface AutoResearchGrantContext {
    playerId: string;
    characterSelections: Record<string, string>;
    playerEquipmentByPlayer: Record<string, string[]>;
    playerResearchTreesByPlayer: Record<string, Record<string, string[]>>;
    missionPrepLoadoutsByPlayer: Record<string, string[]>;
    questPrepLoadoutsByPlayer: Record<string, string[]>;
    questAbilityLoadoutsByCharacterId: Record<string, string[]>;
}

/** Reward id recorded for the grant (`treeId+nodeId`), as research reward slots use. */
export function autoResearchRewardId(phrase: Pick<GrantResearchAutoPhrase, 'treeId' | 'nodeId'>): string {
    return `${phrase.treeId}+${phrase.nodeId}`;
}

/** True when the player already holds a `skipIfResearched` node (active research: virtual roots included). */
export function shouldSkipAutoResearchGrant(phrase: GrantResearchAutoPhrase, ctx: AutoResearchGrantContext): boolean {
    const research = getActiveResearchTrees(
        ctx.playerResearchTreesByPlayer[ctx.playerId] ?? {},
        ctx.playerEquipmentByPlayer[ctx.playerId] ?? [],
    );
    return (phrase.skipIfResearched ?? []).some(({ treeId, nodeIds }) =>
        (research[treeId] ?? []).some((id) => nodeIds.includes(id)),
    );
}

/** Sends the grant for this player's character. Resolves once the server has it; never rejects. */
export async function sendAutoResearchGrant(
    api: MinionBattlesApi,
    phrase: GrantResearchAutoPhrase,
    ctx: AutoResearchGrantContext,
): Promise<void> {
    const prepLoadoutPrimaryIds = prepLoadoutPrimaryIdsForResearchGrant({
        playerId: ctx.playerId,
        characterId: ctx.characterSelections[ctx.playerId],
        equipment: ctx.playerEquipmentByPlayer[ctx.playerId] ?? [],
        researchTrees: ctx.playerResearchTreesByPlayer[ctx.playerId],
        treeId: phrase.treeId,
        nodeId: phrase.nodeId,
        missionPrepLoadoutsByPlayer: ctx.missionPrepLoadoutsByPlayer,
        questPrepLoadoutsByPlayer: ctx.questPrepLoadoutsByPlayer,
        questAbilityLoadoutsByCharacterId: ctx.questAbilityLoadoutsByCharacterId,
    });
    try {
        await api.sendMessage(MessageType.STORY_CHOICE, {
            choiceId: AUTO_GRANT_RESEARCH_CHOICE_ID,
            optionId: 'auto',
            actionType: 'grant_research_to_player' as const,
            treeId: phrase.treeId,
            nodeId: phrase.nodeId,
            researchRewardId: autoResearchRewardId(phrase),
            ...(prepLoadoutPrimaryIds && { prepLoadoutPrimaryIds }),
        });
    } catch (err) {
        console.error('Failed to auto-grant research:', err);
    }
}

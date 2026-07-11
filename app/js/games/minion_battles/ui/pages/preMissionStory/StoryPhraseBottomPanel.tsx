import React from 'react';
import type { PlayerState } from '../../../../../types';
import type { PreMissionPhrase } from '../../../storylines/storyTypes';
import ChoicePhrasePanel from './ChoicePhrasePanel';
import GroupVotePhrasePanel from './GroupVotePhrasePanel';
import { isChoice, isGroupVote } from './preMissionStoryTypeGuards';

interface StoryPhraseBottomPanelProps {
    phrase: PreMissionPhrase;
    players: Record<string, PlayerState>;
    playingPlayerIds: string[];
    allPlayerIds: string[];
    playerId: string;
    amSpectator: boolean;
    groupVoteVotes: Record<string, Record<string, string>>;
    isApplyingGroupVote: boolean;
    onAdvance: () => void;
    onChoose: (
        choiceId: string,
        optionId: string,
        option?: { action?: { type: string; itemId?: string } },
    ) => void;
    onGroupVote: (voteId: string, optionId: string) => void;
    onGroupVoteNext: () => void;
}

export default function StoryPhraseBottomPanel({
    phrase,
    players,
    playingPlayerIds,
    allPlayerIds,
    playerId,
    amSpectator,
    groupVoteVotes,
    isApplyingGroupVote,
    onAdvance,
    onChoose,
    onGroupVote,
    onGroupVoteNext,
}: StoryPhraseBottomPanelProps) {
    if (isChoice(phrase)) {
        return (
            <ChoicePhrasePanel
                phrase={phrase}
                amSpectator={amSpectator}
                onAdvance={onAdvance}
                onChoose={onChoose}
            />
        );
    }
    if (isGroupVote(phrase)) {
        return (
            <GroupVotePhrasePanel
                phrase={phrase}
                players={players}
                playingPlayerIds={playingPlayerIds}
                allPlayerIds={allPlayerIds}
                playerId={playerId}
                amSpectator={amSpectator}
                groupVoteVotes={groupVoteVotes}
                isApplyingGroupVote={isApplyingGroupVote}
                onVote={onGroupVote}
                onNext={onGroupVoteNext}
            />
        );
    }
    return null;
}

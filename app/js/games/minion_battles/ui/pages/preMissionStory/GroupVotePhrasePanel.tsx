import React, { useMemo } from 'react';
import type { PlayerState } from '../../../../../types';
import type { GroupVotePhrase } from '../../../storylines/storyTypes';
import StoryPanelCard from './StoryPanelCard';

interface GroupVotePhrasePanelProps {
    phrase: GroupVotePhrase;
    players: Record<string, PlayerState>;
    playingPlayerIds: string[];
    allPlayerIds: string[];
    playerId: string;
    amSpectator: boolean;
    groupVoteVotes: Record<string, Record<string, string>>;
    isApplyingGroupVote: boolean;
    onVote: (voteId: string, optionId: string) => void;
    onNext: () => void;
}

export default function GroupVotePhrasePanel({
    phrase,
    players,
    playingPlayerIds,
    allPlayerIds,
    playerId,
    amSpectator,
    groupVoteVotes,
    isApplyingGroupVote,
    onVote,
    onNext,
}: GroupVotePhrasePanelProps) {
    const voteId = phrase.voteId;

    const options = useMemo(() => {
        return phrase.optionSource === 'players'
            ? playingPlayerIds.map((id) => ({
                  id,
                  label: players[id]?.name ?? id,
              }))
            : phrase.options ?? [];
    }, [phrase.optionSource, phrase.options, playingPlayerIds, players]);

    const votesForVote = groupVoteVotes[voteId] ?? {};
    const myVote = votesForVote[playerId];
    const allVoted = playingPlayerIds.every((pid) => votesForVote[pid] != null);

    const voterNames = (optionId: string) =>
        allPlayerIds
            .filter((pid) => votesForVote[pid] === optionId)
            .map((pid) => players[pid]?.name ?? pid)
            .join(', ');

    return (
        <StoryPanelCard maxWidthClassName="max-w-xl sm:max-w-2xl md:max-w-3xl">
            <div className="flex flex-col items-center w-full min-w-0">
                <p className="text-white mb-4 text-center break-words w-full">{phrase.text}</p>
                <div className="flex flex-col gap-3 w-full min-w-0 items-stretch">
                    {options.map((opt) => {
                        const voters = voterNames(opt.id);
                        const isMyVote = myVote === opt.id;
                        return (
                            <div
                                key={opt.id}
                                className="rounded-lg border-2 border-border-custom bg-surface overflow-hidden"
                            >
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 min-w-0">
                                    {myVote != null ? (
                                        <span
                                            className={`flex-1 min-w-0 text-center sm:text-left text-lg text-white break-words ${
                                                isMyVote ? 'font-semibold' : ''
                                            }`}
                                        >
                                            {opt.label}
                                            {isMyVote && <span className="text-primary ml-2">(your vote)</span>}
                                        </span>
                                    ) : amSpectator ? (
                                        <span className="flex-1 min-w-0 text-center sm:text-left text-lg text-muted break-words">
                                            {opt.label} (spectators do not vote)
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => onVote(voteId, opt.id)}
                                            className="flex-1 min-w-0 text-center sm:text-left px-2 py-2 rounded-lg text-lg text-white hover:bg-surface-light/80 transition-colors break-words"
                                        >
                                            {opt.label}
                                        </button>
                                    )}
                                    {voters ? (
                                        <span className="text-sm text-muted shrink-0 text-center sm:text-right">
                                            {voters}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {allVoted && (
                    <div className="mt-4 flex justify-center sm:justify-end items-center gap-2 w-full">
                        {isApplyingGroupVote && (
                            <svg
                                className="animate-spin h-5 w-5 text-primary"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                aria-hidden
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                        )}
                        <button
                            type="button"
                            onClick={onNext}
                            disabled={isApplyingGroupVote}
                            className="px-6 py-2 bg-primary text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isApplyingGroupVote ? 'Applying…' : 'Next'}
                        </button>
                    </div>
                )}
            </div>
        </StoryPanelCard>
    );
}

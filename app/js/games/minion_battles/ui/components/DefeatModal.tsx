/** Defeat modal shown after a lost battle (Retry Mission / Abandon Quest / Leave). */
import React from 'react';
import type { QuestLobbyFields } from '../../storylines';
import {
    abandonQuestAndLeave,
    leaveAfterDefeat,
    retryMission,
    type ModalActionsContext,
} from '../../phaseHandlers/modalActions';

interface DefeatModalProps {
    questLobbyFields: QuestLobbyFields | null;
    isHost: boolean;
    selectedMissionId: string | null;
    modalCtx: ModalActionsContext;
}

export default function DefeatModal({ questLobbyFields, isHost, selectedMissionId, modalCtx }: DefeatModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-surface-light border border-border-custom rounded-lg shadow-xl p-10 mx-4 text-center min-h-[35vh] w-[min(90%, 28rem)] flex flex-col justify-center">
                <h2 className="text-2xl font-bold text-danger mb-2">Defeat!</h2>
                <p className="text-muted mb-6">You have succumbed to the darkness</p>
                {questLobbyFields ? (
                    <p className="text-xs text-muted mb-4">
                        Quest run kept — retry this mission, or abandon the quest.
                    </p>
                ) : null}
                <div className="flex flex-wrap justify-center gap-3">
                    {questLobbyFields && isHost !== false && selectedMissionId && (
                        <button
                            type="button"
                            className="px-4 py-2 bg-primary hover:bg-primary-hover text-secondary font-medium rounded transition-colors"
                            onClick={() => retryMission(modalCtx, questLobbyFields, selectedMissionId)}
                        >
                            Retry Mission
                        </button>
                    )}
                    {questLobbyFields && (
                        <button
                            type="button"
                            className="px-4 py-2 bg-violet-800 hover:bg-violet-700 text-violet-100 font-medium rounded transition-colors border border-violet-600"
                            onClick={() => abandonQuestAndLeave(modalCtx)}
                        >
                            Abandon Quest
                        </button>
                    )}
                    <button
                        type="button"
                        className="px-4 py-2 bg-dark-600 hover:bg-dark-500 text-white font-medium rounded transition-colors"
                        onClick={() => leaveAfterDefeat(modalCtx)}
                    >
                        Leave
                    </button>
                </div>
            </div>
        </div>
    );
}

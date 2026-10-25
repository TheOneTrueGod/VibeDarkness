/** Shared context types for the Game component's phase / victory / defeat handlers. */
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CampaignResourceKey, MissionResearchRewardEntry } from '../../../types';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import type { GamePhase } from '../state';
import type { QuestLobbyFields } from '../storylines';
import type { MissionVictoryRecord } from '../storylines/missionVictoryRecord';
import type { VictorySnapshot } from '../storylines/victoryHealthConversion';
import type { DarknessUpgradeRewardLineItem } from '../../../researchTrees/darknessUpgradeRewards';
import type { useQuestFlow } from '../useQuestFlow';

export type RecordMissionResultFn = (
    missionId: string,
    result: string,
    resourceDelta?: Partial<Record<CampaignResourceKey, number>>,
    grantKnowledgeKeys?: string[],
    itemIds?: string[],
    researchRewardIds?: string[],
    researchRewards?: MissionResearchRewardEntry[],
    options?: {
        controlledNpcs?: boolean;
        applyDarknessStrengthProgression?: boolean;
        darknessStrengthPromotions?: import('../../../darknessStrength/progression').DarknessStrengthDataPromotion[];
        /** Darkness Upgrade node ids to grant to this client's campaign (mission completion reward). */
        grantDarknessUpgradeIds?: string[];
    }
) => Promise<void>;

export type QuestFlow = ReturnType<typeof useQuestFlow>;

/** Everything the mission-victory handlers (battle victory, post-mission story complete) read and write. */
export interface VictoryFlowContext {
    api: MinionBattlesApi;
    playerId: string;
    isHost: boolean;
    selectedMissionId: string | null;
    postMissionStory: unknown;
    /** Effective (server + local override) character selections by player id. */
    effectiveSelections: Record<string, string>;
    questLobbyFields: QuestLobbyFields | null;
    matchHungerLossRef: MutableRefObject<number>;
    victorySnapshotRef: MutableRefObject<VictorySnapshot | null>;
    getStartingItemIdsForPlayer: (mid: string, pid: string) => string[];
    applyDarknessUpgradeVictoryRewards: (
        base: Partial<Record<CampaignResourceKey, number>> | undefined,
        enabled: boolean,
    ) => {
        resourceDelta: Partial<Record<CampaignResourceKey, number>> | undefined;
        lineItems: DarknessUpgradeRewardLineItem[];
    };
    snapshotVictoryObjectives: () => MissionVictoryRecord['objectives'];
    fallbackVictoryRecord: () => MissionVictoryRecord;
    quest: QuestFlow;
    onRecordMissionResult?: RecordMissionResultFn;
    onDarknessStrengthMissionEnd?: (
        outcome: 'victory' | 'defeat',
        promotions?: import('../../../darknessStrength/progression').DarknessStrengthDataPromotion[]
    ) => Promise<void>;
    setVictoryRecord: Dispatch<SetStateAction<MissionVictoryRecord | null>>;
    setVictoryModalOpen: Dispatch<SetStateAction<boolean>>;
    setDefeatModalOpen: Dispatch<SetStateAction<boolean>>;
    setPendingVictoryObjectives: Dispatch<SetStateAction<MissionVictoryRecord['objectives']>>;
    setGamePhase: Dispatch<SetStateAction<GamePhase>>;
    handlePhaseChange: (phase: string, newGameState: Record<string, unknown>) => void;
}

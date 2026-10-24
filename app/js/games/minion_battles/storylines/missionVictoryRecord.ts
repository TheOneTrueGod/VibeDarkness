/**
 * Mission victory record: everything the victory popover shows, written once onto the character's mission result
 * and read back to build the popover. A reload replays `onVictory`; finding the record for the same lobby lets the
 * popover come from the stored win instead of recomputing (and re-granting) it.
 */
import type { CampaignResourceKey, MissionResearchRewardEntry, MissionResult } from '../../../types';
import type { DarknessUpgradeRewardLineItem } from '../../../researchTrees/darknessUpgradeRewards';
import type { CampaignRewardsPayload } from './questRun';
import type { QuestLobbyFields, QuestVictoryContinuePlan } from './questLobby';
import type { VictoryHealthConversion } from './victoryHealthConversion';
import { HUNGER_RESOURCE_KEY, withHungerDelta } from './matchHunger';

/** Mission Results shown on the victory popover. */
export interface MissionVictoryRewards {
    resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
    itemFromFirstChoice?: string;
    /** Items unlocked for the campaign by the mission's `unlockItemTiers` reward. */
    unlockedItemIds?: string[];
    researchRewardIds?: string[];
    researchRewards?: MissionResearchRewardEntry[];
    /** Darkness Upgrade bonus lines (host's active set, shown for every player); already included in `resourceDelta`. */
    darknessUpgradeLines?: DarknessUpgradeRewardLineItem[];
}

/** What the win did to the active quest run, as the popover needs it (banner, Continue target, Campaign Rewards). */
export type StoredQuestVictory =
    | {
          kind: 'continued';
          nextMissionId: string;
          lobbyFields: QuestLobbyFields;
          /** 1-based slot of the next mission, and the run's slot count ("mission 2/3"). */
          slotNumber: number;
          slotCount: number;
      }
    | {
          kind: 'finale';
          questDefId: string;
          /** Quest-clear Campaign Rewards (completion + queued); null when empty. */
          campaignRewards: CampaignRewardsPayload | null;
      };

export interface MissionVictoryRecord {
    /** Lobby the win happened in. A replayed victory in the same lobby reuses this record. */
    lobbyId: string;
    /** Objective rows still open at victory, crossed off at the start of the popover. */
    objectives: Array<{ id: string; label: string }>;
    /** Hunger to HP conversion; null when nothing converts (no Hunger change, spectator). */
    conversion: VictoryHealthConversion | null;
    /** Null for spectators and NPC controllers (no rewards). */
    rewards: MissionVictoryRewards | null;
    /** Null outside a quest run (or when the run could not be advanced). */
    quest: StoredQuestVictory | null;
}

/** The stored victory record for this mission when it was won in `lobbyId`, else null. */
export function findLobbyVictoryRecord(
    results: readonly MissionResult[] | undefined,
    missionId: string,
    lobbyId: string,
): MissionVictoryRecord | null {
    const entry = results?.find((r) => r.missionId === missionId && r.result === 'victory');
    const record = entry?.victory;
    return record && record.lobbyId === lobbyId ? record : null;
}

/** Popover-facing summary of a quest continue plan. */
export function storedQuestVictoryFromPlan(
    plan: QuestVictoryContinuePlan,
    campaignRewards: CampaignRewardsPayload | null,
): StoredQuestVictory {
    if (plan.kind === 'continued') {
        return {
            kind: 'continued',
            nextMissionId: plan.nextMissionId,
            lobbyFields: plan.lobbyFields,
            slotNumber: plan.run.currentSlotIndex + 1,
            slotCount: plan.run.resolvedSlots.length,
        };
    }
    return { kind: 'finale', questDefId: plan.complete.result.questDefId, campaignRewards };
}

/** Rewards with their Hunger replaced by the recorded (capped) Hunger change; omitted when 0. */
export function withRecordedHunger(rewards: MissionVictoryRewards, recordedHunger: number): MissionVictoryRewards {
    const rest = rewards.resourceDelta ? { ...rewards.resourceDelta } : undefined;
    if (rest) delete rest[HUNGER_RESOURCE_KEY];
    return {
        ...rewards,
        resourceDelta: withHungerDelta(rest && Object.keys(rest).length > 0 ? rest : undefined, recordedHunger),
    };
}

/** What a new win hands `persistCharacterMissionResult` to build its record (the conversion is computed there). */
export interface VictoryRecordInput {
    /** Match Hunger loss after heal-wounds, before the floor-at-0 cap. */
    hungerLoss: number;
    objectives: MissionVictoryRecord['objectives'];
    /** Rewards as displayed, before the Hunger cap (the record stores the capped Hunger). */
    rewards: MissionVictoryRewards | null;
    quest: StoredQuestVictory | null;
}

import type { Plan, StrategicPlan } from '../plans/types';
import type { AIContext } from '../types';
import { type GroupBlackboard, type SerializedGroup } from './types';
import { runGroupBrain } from './GroupBrain';

export class GroupManager {
    private groups: Map<string, GroupBlackboard> = new Map();

    createGroup(
        groupId: string,
        unitIds: string[],
        plan: Plan<StrategicPlan>,
    ): GroupBlackboard {
        const blackboard: GroupBlackboard = {
            groupId,
            unitIds: [...unitIds],
            strategicPlan: plan,
            nextBrainTick: 0,
        };
        this.groups.set(groupId, blackboard);
        return blackboard;
    }

    getGroup(groupId: string): GroupBlackboard | undefined {
        return this.groups.get(groupId);
    }

    getGroupForUnit(unitId: string): GroupBlackboard | undefined {
        for (const blackboard of this.groups.values()) {
            if (blackboard.unitIds.includes(unitId)) return blackboard;
        }
        return undefined;
    }

    /**
     * Tick all groups. For any group whose nextBrainTick has been reached,
     * run the brain to refresh ephemeral outputs and reschedule.
     */
    tick(gameTick: number, context: AIContext): void {
        for (const blackboard of this.groups.values()) {
            if (gameTick >= blackboard.nextBrainTick) {
                runGroupBrain(blackboard, context);
            }
        }
    }

    toJSON(currentGameTick: number): SerializedGroup[] {
        const result: SerializedGroup[] = [];
        for (const blackboard of this.groups.values()) {
            const sp = blackboard.strategicPlan;
            result.push({
                groupId: blackboard.groupId,
                unitIds: [...blackboard.unitIds],
                strategicPlan: {
                    type: sp.data.type,
                    destinationPOIId: sp.data.destinationPOIId,
                    destinationLabel: sp.data.destinationLabel,
                    engagePolicy: sp.data.engagePolicy,
                    priority: sp.data.priority,
                    ticksRemaining: Math.max(0, sp.holdUntilTick - currentGameTick),
                },
                brainTicksRemaining: Math.max(0, blackboard.nextBrainTick - currentGameTick),
            });
        }
        return result;
    }

    fromJSON(data: SerializedGroup[], currentGameTick: number): void {
        this.groups.clear();
        for (const entry of data) {
            const sp = entry.strategicPlan;
            const strategicPlan: Plan<StrategicPlan> = {
                data: {
                    type: sp.type as StrategicPlan['type'],
                    destinationPOIId: sp.destinationPOIId,
                    destinationLabel: sp.destinationLabel,
                    engagePolicy: sp.engagePolicy as StrategicPlan['engagePolicy'],
                    priority: sp.priority,
                },
                holdUntilTick: currentGameTick + sp.ticksRemaining,
                invalidateOn: new Set(),
            };
            const blackboard: GroupBlackboard = {
                groupId: entry.groupId,
                unitIds: [...entry.unitIds],
                strategicPlan,
                // Ephemeral fields left undefined — group brain repopulates on first run
                formationCenter: undefined,
                advanceWaypoint: undefined,
                sharedTargetId: undefined,
                nextBrainTick: currentGameTick + entry.brainTicksRemaining,
            };
            this.groups.set(entry.groupId, blackboard);
        }
    }
}

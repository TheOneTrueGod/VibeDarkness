/** Battle lost: persist the defeat, report DarknessStrength mission end (host) and open the defeat modal. */
import type { VictoryFlowContext } from './types';

export function handleBattleDefeat(ctx: VictoryFlowContext): void {
    const { selectedMissionId, quest, isHost, onDarknessStrengthMissionEnd, setDefeatModalOpen } = ctx;
    const { persistCharacterMissionResult } = quest;
    if (selectedMissionId) {
        void persistCharacterMissionResult(selectedMissionId, 'defeat');
    }
    if (isHost) {
        // Promotions: host may pass battle tallies later; empty merge is a no-op.
        void onDarknessStrengthMissionEnd?.('defeat');
    }
    setDefeatModalOpen(true);
}

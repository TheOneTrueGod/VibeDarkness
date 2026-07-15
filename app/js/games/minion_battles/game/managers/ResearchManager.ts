/** Tracks each player's unlocked research nodes per tree. */
export class ResearchManager {
    playerResearchTreesByPlayer: Record<string, Record<string, string[]>> = {};

    setPlayerResearchTreesByPlayer(map: Record<string, Record<string, string[]>>): void {
        this.playerResearchTreesByPlayer = {};
        for (const [playerId, trees] of Object.entries(map ?? {})) {
            const normalizedTrees: Record<string, string[]> = {};
            for (const [treeId, nodeIds] of Object.entries(trees ?? {})) {
                normalizedTrees[treeId] = Array.isArray(nodeIds) ? [...nodeIds] : [];
            }
            this.playerResearchTreesByPlayer[playerId] = normalizedTrees;
        }
    }

    getPlayerResearchNodes(playerId: string, treeId: string): string[] {
        return this.playerResearchTreesByPlayer[playerId]?.[treeId] ?? [];
    }

    toJSON(): Record<string, Record<string, string[]>> {
        return Object.fromEntries(
            Object.entries(this.playerResearchTreesByPlayer).map(([playerId, trees]) => [
                playerId,
                Object.fromEntries(Object.entries(trees).map(([treeId, nodeIds]) => [treeId, [...nodeIds]])),
            ]),
        );
    }

    restoreFromJSON(data?: Record<string, Record<string, string[]>>): void {
        if (data) {
            this.setPlayerResearchTreesByPlayer(data);
        }
    }
}

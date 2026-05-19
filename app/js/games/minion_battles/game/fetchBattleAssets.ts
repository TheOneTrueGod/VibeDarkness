import { parseAndRegisterSegment } from '../terrain/segmentRegistry';
import { logToLobbyLog } from '../../../lobbyLog';
import type { MinionBattlesApi } from '../api/minionBattlesApi';

export interface FetchBattleAssetsResult {
    terrainSegmentsFromApi: number;
}

export async function fetchBattleAssets(
    api: MinionBattlesApi,
    playerId: string,
    segmentIds: string[],
): Promise<FetchBattleAssetsResult> {
    const lobbyClient = api.getLobbyClient();
    const lobbyId = api.getLobbyId();
    const gameId = api.getGameId();
    const logBase = {
        lobbyClient,
        lobbyId,
        playerId,
        gameId,
        tick: 0,
        logType: 'debug' as const,
        gamePhase: 'battle',
    };

    if (segmentIds.length === 0) {
        void logToLobbyLog({
            ...logBase,
            severity: 'info',
            message: 'Battle Initialization: no terrain segments to fetch',
        });
        return { terrainSegmentsFromApi: 0 };
    }

    void logToLobbyLog({
        ...logBase,
        severity: 'info',
        message: `Battle Initialization: fetching terrain segments [${segmentIds.join(', ')}]`,
    });

    let terrainSegmentsFromApi = 0;
    try {
        const url = `/api/terrain-segments?ids=${encodeURIComponent(segmentIds.join(','))}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as { segments: unknown[] };
        for (const seg of json.segments ?? []) {
            if (parseAndRegisterSegment(seg)) terrainSegmentsFromApi++;
        }
        void logToLobbyLog({
            ...logBase,
            severity: 'info',
            message: `Battle Initialization: terrain fetch complete (${terrainSegmentsFromApi}/${segmentIds.length} segments from API)`,
        });
    } catch (e) {
        void logToLobbyLog({
            ...logBase,
            severity: 'warn',
            message: `Battle Initialization: terrain fetch failed, using TypeScript fallbacks (${String(e)})`,
        });
    }

    return { terrainSegmentsFromApi };
}

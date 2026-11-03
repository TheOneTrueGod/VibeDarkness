/**
 * BattleSession pre-ITS-action remote-order refresh: skipped for a solo host (no peers to fetch).
 */
import { describe, it, expect, vi } from 'vitest';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import type { PlayerState } from '../../../types';
import { BattleSession } from './BattleSession';

function makeSession(isHost: boolean, players: Record<string, PlayerState>) {
    const session = new BattleSession({
        api: { setCurrentPlayerId: vi.fn() } as unknown as MinionBattlesApi,
        missionId: 'dark_awakening',
        playerId: 'p1',
        isHost,
    });
    session.updateLobbyContext(players, {});
    const refresh = vi.fn().mockResolvedValue(undefined);
    session.setNetAdapter({
        refreshRemoteOrdersForTargetingPreview: refresh,
    } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);
    return { session, refresh };
}

const P1: PlayerState = { id: 'p1', name: 'P1', color: '#fff' };
const P2: PlayerState = { id: 'p2', name: 'P2', color: '#000' };

describe('refreshRemoteOrdersBeforeInteractiveTargetingAction', () => {
    it('skips the network refresh for a solo host', async () => {
        const { session, refresh } = makeSession(true, { p1: P1 });
        await session.refreshRemoteOrdersBeforeInteractiveTargetingAction();
        expect(refresh).not.toHaveBeenCalled();
        session.destroy();
    });

    it('refreshes when the host has peers', async () => {
        const { session, refresh } = makeSession(true, { p1: P1, p2: P2 });
        await session.refreshRemoteOrdersBeforeInteractiveTargetingAction();
        expect(refresh).toHaveBeenCalledTimes(1);
        session.destroy();
    });

    it('refreshes for a non-host client', async () => {
        const { session, refresh } = makeSession(false, { p1: P1, p2: P2 });
        await session.refreshRemoteOrdersBeforeInteractiveTargetingAction();
        expect(refresh).toHaveBeenCalledTimes(1);
        session.destroy();
    });
});

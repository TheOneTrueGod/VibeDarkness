import { describe, expect, it } from 'vitest';
import type { ReactionClaimEntry } from '../../../game/battlenet/types';
import {
    buildReactionPlaneRows,
    computeReactionClaimButton,
    type ReactionClaimButtonInput,
} from './reactionClaimView';

const base: ReactionClaimButtonInput = {
    planeOpen: true,
    canClaim: true,
    isWaiter: false,
    hostLinkUp: true,
    ownState: null,
};

function claim(over: Partial<ReactionClaimEntry>): ReactionClaimEntry {
    return { planeId: 'p1', atTick: 10, unitId: 'u1', playerId: 'a', state: 'pending', own: false, ...over };
}

describe('computeReactionClaimButton', () => {
    it('is enabled while a claim is possible and the host link is up', () => {
        expect(computeReactionClaimButton(base)).toMatchObject({ kind: 'ready', disabled: false, label: 'React' });
    });

    it('is hidden with no plane, for a waiter, or when no claim is possible', () => {
        expect(computeReactionClaimButton({ ...base, planeOpen: false }).kind).toBe('hidden');
        expect(computeReactionClaimButton({ ...base, isWaiter: true }).kind).toBe('hidden');
        expect(computeReactionClaimButton({ ...base, canClaim: false }).kind).toBe('hidden');
    });

    it('is disabled with a tooltip while the host link is down', () => {
        const v = computeReactionClaimButton({ ...base, hostLinkUp: false });
        expect(v).toMatchObject({ kind: 'offline', disabled: true });
        expect(v.kind !== 'hidden' && v.title.length).toBeGreaterThan(0);
    });

    it('shows pending, accepted and "Too late" for the own claim', () => {
        expect(computeReactionClaimButton({ ...base, ownState: 'pending' }).kind).toBe('pending');
        expect(computeReactionClaimButton({ ...base, ownState: 'accepted' }).kind).toBe('accepted');
        const rejected = computeReactionClaimButton({ ...base, canClaim: false, ownState: 'rejected' });
        expect(rejected).toMatchObject({ kind: 'rejected', label: 'Too late', disabled: true });
    });
});

describe('buildReactionPlaneRows', () => {
    const names: Record<string, string> = { a: 'Ann', b: 'Bo', c: 'Cy' };
    const common = {
        localPlayerId: 'a',
        ownerOfUnit: (id: string) => ({ u1: 'a', u2: 'b', u3: 'c' })[id] ?? null,
        nameOfPlayer: (id: string) => names[id] ?? 'Player',
    };

    it('lists every waiter and every pending claim, once each', () => {
        const rows = buildReactionPlaneRows({
            ...common,
            waiters: [{ unitId: 'u1', ownerId: 'a' }, { unitId: 'u2', ownerId: 'b' }],
            claims: [
                claim({ unitId: 'u3', playerId: 'c' }),
                claim({ unitId: 'u2', playerId: 'b' }), // already a waiter
                claim({ unitId: 'u9', playerId: 'c', state: 'rejected' }),
            ],
        });
        expect(rows.map((r) => [r.playerName, r.status])).toEqual([
            ['Ann', 'deciding'],
            ['Bo', 'deciding'],
            ['Cy', 'claiming'],
        ]);
        expect(rows[0].own).toBe(true);
        expect(rows[2].own).toBe(false);
    });

    it('resolves a pending claim heard only as a result through the unit owner', () => {
        const rows = buildReactionPlaneRows({
            ...common,
            waiters: [],
            claims: [claim({ unitId: 'u2', playerId: '' })],
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].playerName).toBe('Bo');
    });
});

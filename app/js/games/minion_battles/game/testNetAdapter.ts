/**
 * Test double for the `BattleSession` net adapter (`BattleNet`).
 *
 * Tests pass a partial object with only the members they care about. Members production code calls
 * unconditionally on a live adapter get safe defaults here so a new `BattleNet` method used on the
 * order path doesn't break every stubbed test; explicit overrides win.
 */
import type { BattleSession } from './BattleSession';

export type StubNetAdapter = Parameters<BattleSession['setNetAdapter']>[0];

export function stubNetAdapter(overrides: Record<string, unknown> = {}): StubNetAdapter {
    return {
        // Reaction claims never block a parallel-plane resume unless a test opts in.
        isReactionClaimUndecidedFor: () => false,
        ...overrides,
    } as unknown as StubNetAdapter;
}

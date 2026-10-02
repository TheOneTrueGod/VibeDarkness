/**
 * Token minted by a canonical timeline, valid only while the timeline's engineEpoch
 * has not advanced. Used to gate snapshot/fingerprint POSTs and diagnostic uploads.
 * A preview engine cannot mint a token and therefore cannot persist state.
 */

/** Branded type: only mintable by canonical timelines. */
export type CanonicalToken = { engineEpoch: number } & { readonly __brand: 'CanonicalToken' };

/**
 * Mint a token if the timeline is canonical, otherwise null.
 * The token captures the current engineEpoch; check staleness with isCanonicalTokenCurrent.
 */
export function mintCanonicalToken(timelineEngineEpoch: number): CanonicalToken | null {
    // Assume the caller has already checked that the timeline is canonical.
    // This is a factory for the minting interface: BattleSessionHandle.mintCanonicalToken()
    // does the timeline.kind check and passes only the epoch.
    return {
        engineEpoch: timelineEngineEpoch,
        __brand: 'CanonicalToken' as const,
    };
}

/**
 * Check if a token is still current (engineEpoch has not advanced).
 * Returns true if the token matches the current epoch, false if stale.
 * Missing token → treat as stale (logged as diag, never thrown).
 */
export function isCanonicalTokenCurrent(token: CanonicalToken | null | undefined, currentEngineEpoch: number): boolean {
    if (token == null) {
        return false;
    }
    return token.engineEpoch === currentEngineEpoch;
}

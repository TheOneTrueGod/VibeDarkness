/**
 * Client-side synchash computation - must match backend GameStateSync::computeSynchash.
 * Used for multiplayer sync verification during battle.
 */

function sortOrdersByGameTick(orders: Array<{ gameTick?: number; order?: unknown }>): Array<{ gameTick: number; order: unknown }> {
    return [...orders].sort((a, b) => (a.gameTick ?? 0) - (b.gameTick ?? 0));
}

function normalizeForHash(val: unknown): unknown {
    if (val === null || typeof val !== 'object') {
        return val;
    }
    if (Array.isArray(val)) {
        return val.map(normalizeForHash);
    }
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
        result[k] = normalizeForHash(obj[k]);
    }
    return result;
}

/**
 * Extract canonical subset of game state for hashing. Matches backend GameStateSync.
 */
function extractCanonical(state: Record<string, unknown>): Record<string, unknown> {
    const canonical: Record<string, unknown> = {};
    const gameTick = state.gameTick ?? state.game_tick;
    if (gameTick !== undefined && gameTick !== null) {
        canonical.gameTick = Number(gameTick);
    }
    for (const key of ['units', 'projectiles', 'effects', 'specialTiles', 'special_tiles', 'cards', 'orders']) {
        if (key in state && state[key] !== undefined) {
            let val = state[key];
            if (key === 'orders' && Array.isArray(val)) {
                val = sortOrdersByGameTick(val as Array<{ gameTick?: number; order?: unknown }>);
            }
            canonical[key] = normalizeForHash(val);
        }
    }
    return canonical;
}

/**
 * Compute SHA-256 hash of canonical game state. Async because Web Crypto is async.
 */
export async function computeSynchash(state: Record<string, unknown>): Promise<string> {
    const canonical = extractCanonical(state);
    const json = JSON.stringify(canonical);
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

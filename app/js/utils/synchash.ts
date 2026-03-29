/**
 * Client-side synchash computation - must match across different browsers and platforms.
 * Used for multiplayer sync verification during battle.
 */

const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
    return (x >>> n) | (x << (32 - n));
}

function sha256Hex(bytes: Uint8Array): string {
    const bitLen = bytes.length * 8;
    const withOneBitLen = bytes.length + 1;
    const paddedLen = ((withOneBitLen + 8 + 63) >> 6) << 6;
    const data = new Uint8Array(paddedLen);
    data.set(bytes);
    data[bytes.length] = 0x80;
    const hi = Math.floor(bitLen / 0x100000000);
    const lo = bitLen >>> 0;
    data[paddedLen - 8] = (hi >>> 24) & 0xff;
    data[paddedLen - 7] = (hi >>> 16) & 0xff;
    data[paddedLen - 6] = (hi >>> 8) & 0xff;
    data[paddedLen - 5] = hi & 0xff;
    data[paddedLen - 4] = (lo >>> 24) & 0xff;
    data[paddedLen - 3] = (lo >>> 16) & 0xff;
    data[paddedLen - 2] = (lo >>> 8) & 0xff;
    data[paddedLen - 1] = lo & 0xff;

    const h = new Uint32Array([
        0x6a09e667,
        0xbb67ae85,
        0x3c6ef372,
        0xa54ff53a,
        0x510e527f,
        0x9b05688c,
        0x1f83d9ab,
        0x5be0cd19,
    ]);
    const w = new Uint32Array(64);

    for (let offset = 0; offset < data.length; offset += 64) {
        for (let i = 0; i < 16; i++) {
            const j = offset + i * 4;
            w[i] =
                ((data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3]) >>> 0;
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }

        let a = h[0];
        let b = h[1];
        let c = h[2];
        let d = h[3];
        let e = h[4];
        let f = h[5];
        let g = h[6];
        let hh = h[7];

        for (let i = 0; i < 64; i++) {
            const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
            const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (s0 + maj) >>> 0;

            hh = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }

        h[0] = (h[0] + a) >>> 0;
        h[1] = (h[1] + b) >>> 0;
        h[2] = (h[2] + c) >>> 0;
        h[3] = (h[3] + d) >>> 0;
        h[4] = (h[4] + e) >>> 0;
        h[5] = (h[5] + f) >>> 0;
        h[6] = (h[6] + g) >>> 0;
        h[7] = (h[7] + hh) >>> 0;
    }

    return Array.from(h)
        .map((word) => word.toString(16).padStart(8, '0'))
        .join('');
}

function sortOrdersByGameTick(
    orders: Array<{ gameTick?: number; order?: unknown }>,
): Array<{ gameTick: number; order: unknown }> {
    return [...orders]
        .map((o) => ({ gameTick: Number(o.gameTick ?? 0), order: o.order }))
        .sort((a, b) => a.gameTick - b.gameTick);
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
export function extractCanonicalForSynchash(state: Record<string, unknown>): Record<string, unknown> {
    const canonical: Record<string, unknown> = {};
    const gameTick = state.gameTick ?? state.game_tick;
    if (gameTick !== undefined && gameTick !== null) {
        canonical.gameTick = Number(gameTick);
    }
    for (const key of ['units', 'projectiles', 'effects', 'specialTiles']) {
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
    const canonical = extractCanonicalForSynchash(state);

    const json = JSON.stringify(canonical);
    const bytes = new TextEncoder().encode(json);
    const subtle = globalThis.crypto?.subtle;
    if (subtle != null) {
        const buf = await subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(buf))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }
    return sha256Hex(bytes);
}

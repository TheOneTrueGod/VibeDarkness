/**
 * Fingerprint — fast, synchronous, deterministic 64-bit incremental hash for
 * tracking the host vs. client simulation state across ticks.
 *
 * Design goals:
 * - Pure 32-bit integer math (Math.imul, >>> 0, bit ops) — no BigInt, for
 *   broad browser support and predictable performance.
 * - Order-sensitive: the same payload values mixed in different orders must
 *   produce different fingerprints.
 * - Deterministic across runs and across browsers.
 * - Cheap enough to call once per simulation event without a measurable
 *   tick-budget cost.
 *
 * No engine integration lives in this file; engine wiring is Task 06 of the
 * multiplayer-sync refactor.
 */

/**
 * 64-bit fingerprint, stored as two unsigned 32-bit halves.
 * `[hi, lo]` — the first element is the high half, the second is the low half.
 */
export type Fingerprint64 = readonly [hi: number, lo: number];

/**
 * Numeric event tags used when mixing simulation events into a fingerprint.
 * Stored as small integers (NOT strings) to keep the mix function input cheap
 * and to avoid coupling fingerprints to identifier spelling.
 */
export const FingerprintEvent = {
    RNG: 1,
    DAMAGE: 2,
    DEATH: 3,
    SPAWN: 4,
    ORDER_APPLIED: 5,
    PROJECTILE_HIT: 6,
    EFFECT_TICK: 7,
    TICK_END: 8,
} as const;

export type FingerprintEvent = (typeof FingerprintEvent)[keyof typeof FingerprintEvent];

/**
 * Avalanching constants. These are well-known 32-bit primes used in xxHash /
 * splitmix style mixers. Don't change them — doing so changes every
 * fingerprint produced by this module.
 */
const FP_PRIME_HI = 0x9e3779b1;
const FP_PRIME_LO = 0x85ebca77;

/** Initial seed for `fingerprintInitial()`. */
const FP_SEED_HI = 0x9e3779b9;
const FP_SEED_LO = 0x85ebca77;

function rotl32(x: number, n: number): number {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/**
 * Mix a single 32-bit value into the running fingerprint halves.
 *
 * The asymmetric shape (xor into lo, multiply, fold into hi via rotation,
 * multiply again, then cross-mix back into lo while swapping halves) gives
 * us three properties:
 *   1. Every bit of `v` reaches every bit of the output within one call.
 *   2. The half-swap at the end means consecutive values are absorbed into
 *      different halves first, so reordering payload values changes output.
 *   3. The two avalanching multiplies kill any low-bit pattern in `v`.
 */
function absorb(hi: number, lo: number, v: number): readonly [number, number] {
    let nextLo = (lo ^ (v >>> 0)) >>> 0;
    nextLo = Math.imul(nextLo, FP_PRIME_LO) >>> 0;

    let nextHi = (hi ^ rotl32(nextLo, 13)) >>> 0;
    nextHi = Math.imul(nextHi, FP_PRIME_HI) >>> 0;

    const folded = (nextLo ^ rotl32(nextHi, 17)) >>> 0;
    return [folded, nextHi];
}

/**
 * Mix an event into a fingerprint. The tag is mixed first, then each payload
 * value in order. Returns a new `Fingerprint64`; the input `fp` is not mutated.
 *
 * Order matters:
 *   - `mix(fp, t, a, b)` !== `mix(fp, t, b, a)` (with overwhelming probability).
 *   - `mix(mix(fp, t1), t2)` !== `mix(mix(fp, t2), t1)`.
 */
export function mix(fp: Fingerprint64, tag: number, ...payload: number[]): Fingerprint64 {
    let hi = fp[0] >>> 0;
    let lo = fp[1] >>> 0;

    [hi, lo] = absorb(hi, lo, tag);
    for (let i = 0; i < payload.length; i++) {
        [hi, lo] = absorb(hi, lo, payload[i]);
    }

    return [hi, lo];
}

/** Returns the canonical starting fingerprint. */
export function fingerprintInitial(): Fingerprint64 {
    return [FP_SEED_HI, FP_SEED_LO];
}

/** 16-character lowercase hex encoding. `hi` first, then `lo`. */
export function fingerprintToHex(fp: Fingerprint64): string {
    const hi = (fp[0] >>> 0).toString(16).padStart(8, '0');
    const lo = (fp[1] >>> 0).toString(16).padStart(8, '0');
    return hi + lo;
}

/**
 * Parse a 16-character hex string back into a `Fingerprint64`. Accepts mixed
 * case but always normalizes via `parseInt`. Throws on malformed input so
 * callers fail fast rather than silently corrupting downstream sync.
 */
export function fingerprintFromHex(hex: string): Fingerprint64 {
    if (typeof hex !== 'string' || hex.length !== 16) {
        throw new Error(`fingerprintFromHex: expected 16 hex chars, got ${String(hex)}`);
    }
    if (!/^[0-9a-fA-F]{16}$/.test(hex)) {
        throw new Error(`fingerprintFromHex: invalid hex string ${hex}`);
    }
    const hi = parseInt(hex.slice(0, 8), 16) >>> 0;
    const lo = parseInt(hex.slice(8, 16), 16) >>> 0;
    return [hi, lo];
}

/** Strict equality of two fingerprints (both halves). */
export function fingerprintEquals(a: Fingerprint64, b: Fingerprint64): boolean {
    return (a[0] >>> 0) === (b[0] >>> 0) && (a[1] >>> 0) === (b[1] >>> 0);
}

/**
 * Fixed-size circular buffer of `(tick, fingerprint)` records. Used by the
 * engine to keep the last N tick fingerprints around for desync recovery
 * comparisons; the host periodically flushes new entries to the server.
 *
 * - `push` is O(1) and overwrites the oldest entry once the ring is full.
 * - `getAt` and `range` are O(N) with N bounded by `capacity` (default 600 =
 *   10 seconds at 60 Hz), which is fine for this use case.
 */
export class FingerprintRing {
    private readonly capacity: number;
    private readonly ticks: number[];
    private readonly his: number[];
    private readonly los: number[];
    /** Index where the next push will write. */
    private head = 0;
    /** Number of valid entries currently stored (<= capacity). */
    private count = 0;

    constructor(capacity: number = 600) {
        if (!Number.isFinite(capacity) || capacity <= 0 || Math.floor(capacity) !== capacity) {
            throw new Error(
                `FingerprintRing: capacity must be a positive integer, got ${String(capacity)}`,
            );
        }
        this.capacity = capacity;
        this.ticks = new Array<number>(capacity).fill(0);
        this.his = new Array<number>(capacity).fill(0);
        this.los = new Array<number>(capacity).fill(0);
    }

    /** Append a fingerprint for a given tick, evicting the oldest entry if full. */
    push(tick: number, fp: Fingerprint64): void {
        const idx = this.head;
        this.ticks[idx] = tick;
        this.his[idx] = fp[0] >>> 0;
        this.los[idx] = fp[1] >>> 0;
        this.head = (this.head + 1) % this.capacity;
        if (this.count < this.capacity) {
            this.count++;
        }
    }

    /** Index of the oldest live entry (0 when not yet full, head when full). */
    private oldestIndex(): number {
        return this.count < this.capacity ? 0 : this.head;
    }

    /** Look up the fingerprint stored at a specific tick, or `null` if not present. */
    getAt(tick: number): Fingerprint64 | null {
        const start = this.oldestIndex();
        for (let i = 0; i < this.count; i++) {
            const idx = (start + i) % this.capacity;
            if (this.ticks[idx] === tick) {
                return [this.his[idx] >>> 0, this.los[idx] >>> 0];
            }
        }
        return null;
    }

    /**
     * Return all `(tick, fp)` entries with `fromTick <= tick <= toTick`,
     * ordered oldest to newest. Bounds are inclusive.
     */
    range(fromTick: number, toTick: number): Array<{ tick: number; fp: Fingerprint64 }> {
        const out: Array<{ tick: number; fp: Fingerprint64 }> = [];
        if (fromTick > toTick) {
            return out;
        }
        const start = this.oldestIndex();
        for (let i = 0; i < this.count; i++) {
            const idx = (start + i) % this.capacity;
            const t = this.ticks[idx];
            if (t >= fromTick && t <= toTick) {
                out.push({ tick: t, fp: [this.his[idx] >>> 0, this.los[idx] >>> 0] });
            }
        }
        return out;
    }

    /** Most recently pushed entry, or `null` if the ring is empty. */
    latest(): { tick: number; fp: Fingerprint64 } | null {
        if (this.count === 0) {
            return null;
        }
        const idx = (this.head - 1 + this.capacity) % this.capacity;
        return {
            tick: this.ticks[idx],
            fp: [this.his[idx] >>> 0, this.los[idx] >>> 0],
        };
    }

    /** Number of live entries. */
    size(): number {
        return this.count;
    }

    /** Configured capacity. */
    getCapacity(): number {
        return this.capacity;
    }

    /** Drop all entries; subsequent `push` starts from a clean slate. */
    clear(): void {
        this.head = 0;
        this.count = 0;
    }
}

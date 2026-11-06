/**
 * Serialized form of an in-flight cast's cast-behaviour state, so a snapshot taken mid-cast restores
 * to an engine that plays forward identically (ITS rollback, checkpoint resync, rejoin).
 *
 * Three pieces of runtime state carry a sustained behaviour (a lunge, a dash, a beam) across ticks:
 *   - `ActiveAbility.castBehaviourPayloads`: per-behaviour data written by `setBehaviourPayload`.
 *   - `ActiveAbility.setupFiredBehaviourKeys`: which behaviours already ran `onSetup` this cast.
 *   - `Unit.activeCastBehaviours`: the per-tick records, rebuilt on restore from the two above
 *     (`rehydrateSustainedCastBehaviours` in `unitAbilityTick.ts`).
 *
 * Payloads are free-form; `Set` and `Map` values (e.g. a dash's `hitIds`) are tagged so they survive
 * JSON and come back as the same collection type.
 */

const SET_TAG = '__castBehaviourSet';
const MAP_TAG = '__castBehaviourMap';

function encode(value: unknown): unknown {
    if (value instanceof Set) return { [SET_TAG]: [...value].map(encode) };
    if (value instanceof Map) return { [MAP_TAG]: [...value.entries()].map(([k, v]) => [encode(k), encode(v)]) };
    if (Array.isArray(value)) return value.map(encode);
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            if (v === undefined || typeof v === 'function') continue;
            out[k] = encode(v);
        }
        return out;
    }
    return value;
}

function decode(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(decode);
    if (value !== null && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (SET_TAG in obj && Array.isArray(obj[SET_TAG])) return new Set((obj[SET_TAG] as unknown[]).map(decode));
        if (MAP_TAG in obj && Array.isArray(obj[MAP_TAG])) {
            return new Map((obj[MAP_TAG] as [unknown, unknown][]).map(([k, v]) => [decode(k), decode(v)]));
        }
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) out[k] = decode(v);
        return out;
    }
    return value;
}

export function serializeCastBehaviourPayloads(
    payloads: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
    if (!payloads || Object.keys(payloads).length === 0) return undefined;
    return encode(payloads) as Record<string, unknown>;
}

export function deserializeCastBehaviourPayloads(
    data: unknown,
): Record<string, unknown> | undefined {
    if (data == null || typeof data !== 'object') return undefined;
    return decode(data) as Record<string, unknown>;
}

export function serializeSetupFiredBehaviourKeys(keys: Set<string> | undefined): string[] | undefined {
    return keys && keys.size > 0 ? [...keys] : undefined;
}

export function deserializeSetupFiredBehaviourKeys(data: unknown): Set<string> | undefined {
    if (!Array.isArray(data)) return undefined;
    return new Set(data.filter((k): k is string => typeof k === 'string'));
}

/**
 * Checkpoint format versioning.
 *
 * `GameEngine.toJSON` stamps {@link SERIALIZED_GAME_STATE_VERSION}; `GameEngine.fromJSON` runs
 * {@link upgradeSerializedGameState} on the raw JSON before it builds the object graph, so every
 * deserialization path (live checkpoints, recovery/resync, replay, ability tests) is covered.
 *
 * A missing `serializationVersion` means version 0 (the format before versioning existed).
 *
 * To change serialized state in a non-backwards-compatible way: do not bump a number by hand.
 * Append one step to {@link UPGRADE_STEPS} (it upgrades version N to N + 1) and the current
 * version follows. See `.claude/skills/game-engine/SKILL.md`.
 *
 * A checkpoint NEWER than this build understands throws {@link UnsupportedCheckpointVersionError}:
 * an old client must not silently misread a newer checkpoint. During a deploy the client should
 * reload to pick up the new build.
 */
import type { SerializedGameState } from './types';

/** Raw checkpoint JSON, before upgrade. Steps treat it as untyped. */
export type RawSerializedGameState = Record<string, unknown>;

/** Upgrades raw checkpoint JSON from version N to N + 1. Must return a new object (no mutation). */
export type SerializedGameStateUpgradeStep = (raw: RawSerializedGameState) => RawSerializedGameState;

/** Index N upgrades version N to N + 1. Append only; never reorder or edit shipped steps. */
export const UPGRADE_STEPS: readonly SerializedGameStateUpgradeStep[] = [
    // 0 -> 1: drop the legacy `cards` field (CardManager was removed; nothing read it).
    (raw) => {
        const { cards: _legacyCards, ...rest } = raw;
        return rest;
    },
];

/** Version written by `toJSON`. */
export const SERIALIZED_GAME_STATE_VERSION = UPGRADE_STEPS.length;

export class UnsupportedCheckpointVersionError extends Error {
    constructor(public readonly version: number) {
        super(
            `Checkpoint serializationVersion ${version} is newer than this build supports ` +
                `(${SERIALIZED_GAME_STATE_VERSION}). Reload to get the latest version.`,
        );
        this.name = 'UnsupportedCheckpointVersionError';
    }
}

/** Version of a raw checkpoint; missing or non-numeric means 0. */
export function getSerializedGameStateVersion(raw: { serializationVersion?: unknown }): number {
    const v = raw.serializationVersion;
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
}

/**
 * Bring raw checkpoint JSON up to the current format. Does not mutate the input. Returns the
 * input unchanged (same reference) when it is already current.
 */
export function upgradeSerializedGameState(data: SerializedGameState | RawSerializedGameState): SerializedGameState {
    const version = getSerializedGameStateVersion(data);
    if (version > SERIALIZED_GAME_STATE_VERSION) {
        throw new UnsupportedCheckpointVersionError(version);
    }
    if (version === SERIALIZED_GAME_STATE_VERSION) {
        return data as SerializedGameState;
    }
    let raw = data as RawSerializedGameState;
    for (let v = version; v < SERIALIZED_GAME_STATE_VERSION; v++) {
        raw = UPGRADE_STEPS[v](raw);
    }
    return { ...raw, serializationVersion: SERIALIZED_GAME_STATE_VERSION } as unknown as SerializedGameState;
}

/**
 * Buff registry - maps buff type strings to deserializers.
 * Add new buff types here when creating them.
 */

import type { Buff } from './Buff';
import type { BuffSerialized } from './Buff';
import { StunnedBuff, STUNNED_BUFF_TYPE } from './StunnedBuff';

type BuffDeserializer = (data: BuffSerialized) => Buff;

const registry: Record<string, BuffDeserializer> = {
    [STUNNED_BUFF_TYPE]: StunnedBuff.fromJSON as BuffDeserializer,
};

/** Deserialize a buff from JSON. Returns the buff instance or throws if type unknown. */
export function buffFromJSON(data: BuffSerialized): Buff {
    const deserializer = registry[data._type];
    if (!deserializer) {
        throw new Error(`Unknown buff type: ${data._type}`);
    }
    return deserializer(data);
}

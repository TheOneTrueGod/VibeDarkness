/**
 * Buff registry - maps buff type strings to deserializers.
 * Add new buff types here when creating them.
 */

import type { Buff } from './Buff';
import type { BuffSerialized } from './Buff';
import { StunnedBuff, STUNNED_BUFF_TYPE } from './StunnedBuff';
import { BleedBuff, BLEED_BUFF_TYPE } from './BleedBuff';
import { CantDieBuff, CANT_DIE_BUFF_TYPE } from './CantDieBuff';
import { ExposedBuff, EXPOSED_BUFF_TYPE } from './ExposedBuff';

type BuffDeserializer = (data: BuffSerialized) => Buff;

const registry: Record<string, BuffDeserializer> = {
    [STUNNED_BUFF_TYPE]: StunnedBuff.fromJSON as BuffDeserializer,
    [BLEED_BUFF_TYPE]: BleedBuff.fromJSON as BuffDeserializer,
    [CANT_DIE_BUFF_TYPE]: CantDieBuff.fromJSON as BuffDeserializer,
    [EXPOSED_BUFF_TYPE]: ExposedBuff.fromJSON as BuffDeserializer,
};

/** Deserialize a buff from JSON. Returns the buff instance or throws if type unknown. */
export function buffFromJSON(data: BuffSerialized): Buff {
    const deserializer = registry[data._type];
    if (!deserializer) {
        throw new Error(`Unknown buff type: ${data._type}`);
    }
    return deserializer(data);
}

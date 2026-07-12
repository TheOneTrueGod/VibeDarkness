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
import { DoubleDamageBuff, DOUBLE_DAMAGE_BUFF_TYPE } from './DoubleDamageBuff';
import { LightImbueBuff, LIGHT_IMBUE_BUFF_TYPE } from './LightImbueBuff';
import { LiftedBuff, LIFTED_BUFF_TYPE } from './LiftedBuff';
import { GravityLocusFieldBuff, GRAVITY_LOCUS_FIELD_BUFF_TYPE } from './GravityLocusFieldBuff';
import { ShieldBuff, SHIELD_BUFF_TYPE } from './ShieldBuff';

type BuffDeserializer = (data: BuffSerialized) => Buff;

const registry: Record<string, BuffDeserializer> = {
    [STUNNED_BUFF_TYPE]: StunnedBuff.fromJSON as BuffDeserializer,
    [BLEED_BUFF_TYPE]: BleedBuff.fromJSON as BuffDeserializer,
    [CANT_DIE_BUFF_TYPE]: CantDieBuff.fromJSON as BuffDeserializer,
    [EXPOSED_BUFF_TYPE]: ExposedBuff.fromSerialized as BuffDeserializer,
    [DOUBLE_DAMAGE_BUFF_TYPE]: DoubleDamageBuff.fromJSON as BuffDeserializer,
    [LIGHT_IMBUE_BUFF_TYPE]: LightImbueBuff.fromJSON as BuffDeserializer,
    [LIFTED_BUFF_TYPE]: LiftedBuff.fromSerialized as BuffDeserializer,
    [GRAVITY_LOCUS_FIELD_BUFF_TYPE]: GravityLocusFieldBuff.fromSerialized as BuffDeserializer,
    [SHIELD_BUFF_TYPE]: ShieldBuff.fromJSON as BuffDeserializer,
};

/** Deserialize a buff from JSON. Returns the buff instance or throws if type unknown. */
export function buffFromJSON(data: BuffSerialized): Buff {
    const deserializer = registry[data._type];
    if (!deserializer) {
        throw new Error(`Unknown buff type: ${data._type}`);
    }
    return deserializer(data);
}

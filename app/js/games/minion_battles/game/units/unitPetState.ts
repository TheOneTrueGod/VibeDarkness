import type { Unit } from './Unit';

export interface UnitPetState {
    /** Unit id of the player unit that owns this pet. Set on pet units only. */
    ownerUnitId: string | undefined;
    /** Unit ids of this unit's living pets. Maintained by spawn logic; never set on pets. */
    unitIds: string[];
    /** Pet def id (from PET_DEFS) for pet units. Undefined on non-pet units. */
    defId: string | undefined;
}

export function createPetState(): UnitPetState {
    return {
        ownerUnitId: undefined,
        unitIds: [],
        defId: undefined,
    };
}

export function petStateToJSON(unit: Unit): Record<string, unknown> {
    return {
        ...(unit.petState.ownerUnitId !== undefined ? { petOwnerUnitId: unit.petState.ownerUnitId } : {}),
        ...(unit.petState.unitIds.length > 0 ? { petUnitIds: [...unit.petState.unitIds] } : {}),
        ...(unit.petState.defId !== undefined ? { petDefId: unit.petState.defId } : {}),
    };
}

export function applyPetStateFromJSON(unit: Unit, data: Record<string, unknown>): void {
    if (typeof data.petOwnerUnitId === 'string') {
        unit.petState.ownerUnitId = data.petOwnerUnitId;
    }
    unit.petState.unitIds = Array.isArray(data.petUnitIds)
        ? (data.petUnitIds as unknown[]).filter((x): x is string => typeof x === 'string')
        : [];
    if (typeof data.petDefId === 'string') {
        unit.petState.defId = data.petDefId;
    }
}

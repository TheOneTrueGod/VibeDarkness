/**
 * Equip and release a conjured weapon. Stow hides weapon-origin abilities without
 * discarding their uses. The conjure card stays on the bar, inactive, so it still
 * recovers while the weapon is held.
 */
import type { Unit } from '../units/Unit';
import type { EventBus } from '../EventBus';
import { ensureAbilityRuntimeState } from '../../abilities/abilityUses';
import type { FieldObjectHost, FieldObjectManager } from '../fieldObjects/FieldObjectManager';
import { getConjuredWeaponDef, type ConjuredWeaponDef } from './registry';

export interface ConjureHost extends FieldObjectHost {
    eventBus: EventBus;
    state?: { fieldObjects?: FieldObjectManager };
}

export function equipConjuredWeapon(unit: Unit, def: ConjuredWeaponDef, engine: ConjureHost): void {
    if (unit.heldConjuredWeapon) {
        releaseHeldConjuredWeapon(unit, engine, { leaveToken: true });
    }
    const stowed = unit.weaponAbilityIds.filter((id) => unit.abilities.includes(id));
    for (const id of stowed) setAbilityActive(unit, id, false);

    const anchorIndexes = stowed
        .map((id) => unit.abilities.indexOf(id))
        .filter((index) => index >= 0);
    const insertAt = anchorIndexes.length > 0 ? Math.min(...anchorIndexes) : unit.abilities.length;
    if (!unit.abilities.includes(def.heldAbilityId)) {
        unit.abilities.splice(insertAt, 0, def.heldAbilityId);
    }
    setAbilityActive(unit, def.heldAbilityId, true);
    const heldRuntime = unit.abilityRuntime[def.heldAbilityId];
    if (heldRuntime) {
        heldRuntime.maxUses = def.heldUses;
        heldRuntime.currentUses = def.heldUses;
    }

    const conjureIndex = unit.abilities.indexOf(def.conjureAbilityId);
    if (!unit.abilities.includes(def.releaseAbilityId)) {
        if (conjureIndex >= 0) unit.abilities.splice(conjureIndex, 0, def.releaseAbilityId);
        else unit.abilities.push(def.releaseAbilityId);
    }
    setAbilityActive(unit, def.releaseAbilityId, true);
    const releaseRuntime = unit.abilityRuntime[def.releaseAbilityId];
    if (releaseRuntime) {
        releaseRuntime.maxUses = 1;
        releaseRuntime.currentUses = 1;
    }
    setAbilityActive(unit, def.conjureAbilityId, false);

    unit.heldConjuredWeapon = { defId: def.id, stowedAbilityIds: [...stowed] };
    notifyBar(unit, engine);
}

export function releaseHeldConjuredWeapon(
    unit: Unit,
    engine: ConjureHost,
    opts: { leaveToken: boolean },
): void {
    const held = unit.heldConjuredWeapon;
    if (!held) return;
    const def = getConjuredWeaponDef(held.defId);
    unit.heldConjuredWeapon = null;
    if (def) {
        unit.abilities = unit.abilities.filter(
            (id) => id !== def.heldAbilityId && id !== def.releaseAbilityId,
        );
        for (const id of held.stowedAbilityIds) {
            if (!unit.abilities.includes(id)) unit.abilities.push(id);
            setAbilityActive(unit, id, true);
        }
        if (!unit.abilities.includes(def.conjureAbilityId)) unit.abilities.push(def.conjureAbilityId);
        setAbilityActive(unit, def.conjureAbilityId, true);
        if (opts.leaveToken) {
            engine.state?.fieldObjects?.spawnDroppedWeapon(engine, {
                originX: unit.x,
                originY: unit.y,
                kind: def.tokenKind,
                ownerUnitId: unit.id,
                teamId: unit.teamId,
                abilityId: def.heldAbilityId,
            });
        }
    }
    notifyBar(unit, engine);
}

/** Safety net: discard a held weapon that ended with no uses left and was not already dropped on impact. */
export function onConjuredWeaponCastEnded(unit: Unit, abilityId: string, engine: ConjureHost): void {
    const held = unit.heldConjuredWeapon;
    if (!held) return;
    const def = getConjuredWeaponDef(held.defId);
    if (!def || def.heldAbilityId !== abilityId) return;
    const uses = unit.abilityRuntime[abilityId]?.currentUses ?? 0;
    if (uses > 0) return;
    releaseHeldConjuredWeapon(unit, engine, { leaveToken: true });
}

function setAbilityActive(unit: Unit, abilityId: string, active: boolean): void {
    ensureAbilityRuntimeState(unit, abilityId);
    const runtime = unit.abilityRuntime[abilityId];
    if (runtime) runtime.active = active;
}

function notifyBar(unit: Unit, engine: ConjureHost): void {
    engine.eventBus.emit('ability_bar_changed', { unitId: unit.id });
}

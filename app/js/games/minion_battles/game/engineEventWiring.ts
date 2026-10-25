/**
 * Core EventBus wiring for `GameEngine`, moved out of the class as a pure move.
 * `GameEngine.registerCoreEventListeners` clears the bus and calls this; subscription order is
 * load-bearing (handlers for one event run in registration order), so keep it as written.
 */

import { WAIT_ABILITY_MODE_FAR } from '../abilities/WaitAbility';
import { isWithinEarthCoreNearbyStoneDamagedRange } from '../abilities/earthCoreHelpers';
import type { DamageTakenEvent } from './EventBus';
import { createDamageTakenEffect } from './createDamageTakenEffect';
import { applyDeathSequence } from './deathSequences/applyDeathSequence';
import { Effect } from './effects/Effect';
import { applyVisualEffectDefs } from './effects/applyVisualEffectDefs';
import { STACK_GHOST_DURATION } from './effect_defs/movementEffects';
import { FingerprintEvent } from './Fingerprint';
import { areAllies, areEnemies } from './teams';
import { registerDamageLinkListeners } from './units/unitDamageLinks';
import { runUnitComponentDeath } from './units/components/unitComponentHooks';
import { getBodyColorForUnit, getCharacterSpriteKey, getUnitDefEntry, type UnitDefId } from './units/unit_defs/unitDef';
import type { GameEngine } from './GameEngine';

export function wireCoreEventListeners(engine: GameEngine): void {
    engine.eventBus.clear();
    engine.state.unitManager.registerListeners();
    engine.state.interruptSystem.registerListeners(engine.eventBus);
    engine.state.worldModifierManager.registerListeners(engine.eventBus);
    engine.eventBus.on('cast_ended_early', engine.recordPreviewCastEndedEarly);
    registerDamageLinkListeners({
        eventBus: engine.eventBus,
        getUnit: (id) => engine.getUnit(id),
        getUnits: () => engine.units,
    });

    // unit_died: apply deathSequence (or onDeathVisualEffects) and onDeathBehaviors from the unit def directly.
    engine.eventBus.on('unit_died', (data) => {
        const unit = engine.getUnit(data.unitId);
        if (!unit) return;
        const def = getUnitDefEntry(unit.characterId as UnitDefId);
        if (def?.deathSequence) applyDeathSequence(def.deathSequence, unit, engine);
        else if (def?.onDeathVisualEffects?.length) applyVisualEffectDefs(def.onDeathVisualEffects, unit, engine);
        // Component death hooks (e.g. lanternite torch removal and Spore Rebirth) run after the visual death.
        runUnitComponentDeath(unit, engine.buildUnitComponentContext(0));
    });

    // Map-network hygiene: unregister immediately rather than waiting for the next
    // updateUnitNode diff, which may never re-fire since a dead unit's position typically
    // never changes again after death.
    engine.eventBus.on('unit_died', (data) => {
        engine.state.mapNetworkManager.unregisterUnit(data.unitId);
    });

    engine.eventBus.on('stack_members_died', (data) => {
        const unit = engine.getUnit(data.unitId);
        if (!unit) return;
        const ghostCount = Math.min(5, Math.ceil(Math.sqrt(data.count)));
        const bodyColor = getBodyColorForUnit(unit);
        const characterSpriteKey = getCharacterSpriteKey(unit.characterId);
        for (let i = 0; i < ghostCount; i++) {
            const direction = engine.generateRandomInteger(0, 1) === 0 ? -1 : 1;
            engine.addEffect(new Effect({
                x: unit.x,
                y: unit.y,
                duration: STACK_GHOST_DURATION,
                effectType: 'StackGhost',
                effectData: {
                    bodyColor,
                    radius: unit.radius,
                    characterSpriteKey,
                    vx: direction * engine.generateRandomInteger(80, 120),
                    vy: -engine.generateRandomInteger(100, 150),
                    direction,
                    initialAlpha: 0.8,
                },
            }));
        }
    });

    engine.eventBus.on('round_end', (data) => {
        engine.handleRoundEnd(data.roundNumber);
    });

    engine.eventBus.on('damage_taken', (data: DamageTakenEvent) => {
        createDamageTakenEffect(
            {
                addEffect: (e) => engine.addEffect(e),
                generateRandomInteger: (min, max) => engine.generateRandomInteger(min, max),
                getUnit: (id) => engine.getUnit(id),
            },
            data,
        );
    });

    engine.eventBus.on('damage_taken', (data) => {
        engine.mixRuntimeFingerprint(FingerprintEvent.DAMAGE, engine.hashString32(data.unitId), Math.floor(data.amount));
    });

    // Far wait: end after the minimum duration when an enemy deals damage.
    engine.eventBus.on('damage_taken', (data: DamageTakenEvent) => {
        const unit = engine.getUnit(data.unitId);
        if (!unit?.isInWaitLockout() || unit.waitAbilityMode !== WAIT_ABILITY_MODE_FAR) return;
        if (unit.waitMinEndTime != null && engine.gameTime < unit.waitMinEndTime) return;
        if (!data.sourceUnitId) return;
        const source = engine.getUnit(data.sourceUnitId);
        if (!source || !areEnemies(unit.teamId, source.teamId)) return;
        unit.waitMinEndTime = null;
        unit.waitMaxEndTime = null;
        unit.waitAbilityMode = null;
    });
    engine.eventBus.on('unit_died', (data) => {
        engine.mixRuntimeFingerprint(
            FingerprintEvent.DEATH,
            engine.hashString32(data.unitId),
            engine.hashString32(data.killerUnitId ?? ''),
        );
    });
    engine.eventBus.on('projectile_hit', (data) => {
        engine.mixRuntimeFingerprint(
            FingerprintEvent.PROJECTILE_HIT,
            engine.hashString32(data.projectileId),
            engine.hashString32(data.targetUnitId),
        );
    });

    engine.eventBus.on('terrain_stone_damaged', (event) => {
        if (!engine.terrainManager) return;
        const sourceUnitId = event.sourceUnitId ?? null;
        const sourceUnit = sourceUnitId ? engine.getUnit(sourceUnitId) : undefined;
        for (const unit of engine.units) {
            if (!unit.isAlive() || !unit.getResource('resonance')) continue;
            const { col: unitCol, row: unitRow } = engine.terrainManager.grid.worldToGrid(unit.x, unit.y);
            if (!isWithinEarthCoreNearbyStoneDamagedRange(unitCol, unitRow, event.col, event.row)) continue;
            const causedBySelfOrAlly = sourceUnit
                ? (sourceUnit.id === unit.id || areAllies(sourceUnit.teamId, unit.teamId))
                : false;
            engine.emitNearbyStoneDamaged({
                unitId: unit.id,
                sourceUnitId,
                causedBySelfOrAlly,
                col: event.col,
                row: event.row,
            });
        }
    });
}

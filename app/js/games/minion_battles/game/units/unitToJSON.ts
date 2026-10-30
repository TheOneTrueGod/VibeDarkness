import type { Unit } from './Unit';
import { PLAYER_CHARACTER_ID } from './unit_defs/unitDef';
import { serializeTacticalPlan } from './unitAI/plans/planUtils';
import { serializeUnitComponents } from './components/unitComponent';
import { ccArmourStateToJSON } from '../../crowdControl/ccArmourState';
import { serializeHoverFlight } from './hoverFlight';

export function serializeUnit(unit: Unit, currentGameTick: number): Record<string, unknown> {
    return {
        _type: 'unit',
        id: unit.id,
        x: unit.x,
        y: unit.y,
        active: unit.active,
        hp: unit.hp,
        maxHp: unit.maxHp,
        hpInjury: unit.hpInjury,
        hungerPenalty: unit.hungerPenalty,
        ...(unit.stackSize !== 1 ? { stackSize: unit.stackSize } : {}),
        speed: unit.speed,
        teamId: unit.teamId,
        ownerId: unit.ownerId,
        characterId: unit.characterId,
        // Always persist a portrait id for players so JSON checkpoints do not omit it (undefined is stripped by JSON.stringify).
        portraitId:
            unit.characterId === PLAYER_CHARACTER_ID ? (unit.portraitId ?? 'warrior') : unit.portraitId,
        name: unit.name,
        movement: unit.movement ? {
            path: unit.movement.path.map((p) => ({ ...p })),
            targetUnitId: unit.movement.targetUnitId,
            ...(unit.movement.targetPixel ? { targetPixel: { ...unit.movement.targetPixel } } : {}),
            pathfindingTick: unit.movement.pathfindingTick,
            ...(unit.movement.navEpoch !== undefined ? { navEpoch: unit.movement.navEpoch } : {}),
            ...(unit.movement.stopRange !== undefined ? { stopRange: unit.movement.stopRange } : {}),
        } : null,
        ...(unit.walkIntent
            ? {
                walkIntent: {
                    dest: { ...unit.walkIntent.dest },
                    ...(unit.walkIntent.targetUnitId !== undefined
                        ? { targetUnitId: unit.walkIntent.targetUnitId }
                        : {}),
                    ...(unit.walkIntent.targetPixel
                        ? { targetPixel: { ...unit.walkIntent.targetPixel } }
                        : {}),
                    ...(unit.walkIntent.stopRange !== undefined
                        ? { stopRange: unit.walkIntent.stopRange }
                        : {}),
                    ...(unit.walkIntent.managed ? { managed: true } : {}),
                },
            }
            : {}),
        abilities: unit.abilities,
        ...(unit.weaponAbilityIds.length > 0 ? { weaponAbilityIds: unit.weaponAbilityIds } : {}),
        ...(unit.heldConjuredWeapon ? { heldConjuredWeapon: unit.heldConjuredWeapon } : {}),
        activeAbilities: unit.activeAbilities.map((a) => ({
            abilityId: a.abilityId,
            startTime: a.startTime,
            targets: a.targets.map((t) => ({ ...t })),
            fired: a.fired,
            castPayload:
                a.castPayload !== undefined
                    ? JSON.parse(JSON.stringify(a.castPayload)) as unknown
                    : undefined,
            ...(a.abilityMode !== undefined ? { abilityMode: a.abilityMode } : {}),
            ...(a.conditionalCancelPaused ? { conditionalCancelPaused: true } : {}),
            ...(a.conditionalCancelTagFilter !== undefined
                ? { conditionalCancelTagFilter: [...a.conditionalCancelTagFilter] }
                : {}),
            ...(a.comboCount !== undefined && a.comboCount !== 1 ? { comboCount: a.comboCount } : {}),
            ...(a.processedElapsed !== undefined ? { processedElapsed: a.processedElapsed } : {}),
            ...(a.pendingSelectGate !== undefined ? { pendingSelectGate: a.pendingSelectGate } : {}),
            ...(a.missingSelectLabels !== undefined && a.missingSelectLabels.length > 0
                ? { missingSelectLabels: [...a.missingSelectLabels] }
                : {}),
            ...(a.awaitingPickLabel !== undefined ? { awaitingPickLabel: a.awaitingPickLabel } : {}),
            ...(a.movementByLabel !== undefined
                ? { movementByLabel: JSON.parse(JSON.stringify(a.movementByLabel)) as typeof a.movementByLabel }
                : {}),
        })),
        abilityNote: unit.abilityNote
            ? (JSON.parse(JSON.stringify(unit.abilityNote)) as typeof unit.abilityNote)
            : null,
        ...(unit.radiusOverride !== undefined ? { radiusOverride: unit.radiusOverride } : {}),
        aiSettings: unit.aiSettings
            ? (JSON.parse(JSON.stringify(unit.aiSettings)) as typeof unit.aiSettings)
            : null,
        pathInvalidated: unit.pathInvalidated,
        nextRepathTick: unit.nextRepathTick,
        ...(unit.pathFailedEpoch !== null ? { pathFailedEpoch: unit.pathFailedEpoch } : {}),
        aiContext: JSON.parse(JSON.stringify(unit.aiContext ?? {})) as typeof unit.aiContext,
        unitAITreeId: unit.unitAITreeId,
        moveJitter: unit.moveJitter,
        spawnTimer: unit.spawnTimer,
        ...(unit.terrainHazard ? { terrainHazard: { ...unit.terrainHazard } } : {}),
        growAnimTimer: unit.growAnimTimer,
        waitMinEndTime: unit.waitMinEndTime,
        waitMaxEndTime: unit.waitMaxEndTime,
        ...(unit.waitAbilityMode != null ? { waitAbilityMode: unit.waitAbilityMode } : {}),
        movementPaused: unit.movementPaused,
        corruptionProgress: unit.corruptionProgress,
        crystalCorruptionProgress: unit.crystalCorruptionProgress,
        darknessDamageProcCount: unit.darknessDamageProcCount,
        ...(unit.darknessStrikeElapsed != null ? { darknessStrikeElapsed: unit.darknessStrikeElapsed } : {}),
        ...ccArmourStateToJSON(unit),
        wallStuckTime: unit.wallStuckTime,
        knockback: unit.knockback ? {
            knockbackVector: { ...unit.knockback.knockbackVector },
            knockbackAirTime: unit.knockback.knockbackAirTime,
            knockbackSlideTime: unit.knockback.knockbackSlideTime,
            knockbackSource: { ...unit.knockback.knockbackSource },
            knockbackElapsed: unit.knockback.knockbackElapsed,
            ...(unit.knockback.passThroughTerrain ? { passThroughTerrain: true } : {}),
            ...(unit.knockback.collideWithUnits ? { collideWithUnits: true } : {}),
            ...(unit.knockback.bounceOffTerrain ? { bounceOffTerrain: true } : {}),
            ...(unit.knockback.unitCollisionStartFraction != null && unit.knockback.unitCollisionStartFraction > 0
                ? { unitCollisionStartFraction: unit.knockback.unitCollisionStartFraction }
                : {}),
        } : null,
        ...(unit.hoverFlight ? { hoverFlight: serializeHoverFlight(unit.hoverFlight) } : {}),
        nudge: unit.nudge ? {
            nudgeVector: { ...unit.nudge.nudgeVector },
            nudgeDuration: unit.nudge.nudgeDuration,
            nudgeElapsed: unit.nudge.nudgeElapsed,
        } : null,
        resources: unit.resources.map((r) => r.toJSON()),
        abilityRuntime: Object.fromEntries(
            Object.entries(unit.abilityRuntime).map(([abilityId, runtime]) => [
                abilityId,
                {
                    currentUses: runtime.currentUses,
                    maxUses: runtime.maxUses,
                    recoveryChargesByType: { ...runtime.recoveryChargesByType },
                    active: runtime.active,
                    ...(runtime.replacedAbilityId != null ? { replacedAbilityId: runtime.replacedAbilityId } : {}),
                },
            ]),
        ),
        abilityModifiers: unit.abilityModifiers,
        stamina: unit.stamina,
        buffs: unit.buffs.map((b) => b.toJSON()),
        // Local clock (see game/time/AGENTS.md). Omitted until the engine starts it, and timeDebt when 0.
        ...(unit.localClockActive ? { localTime: unit.localTime } : {}),
        ...(unit.timeDebt !== 0 ? { timeDebt: unit.timeDebt } : {}),
        // Frozen state from the last clock advance; read between ticks (order pauses, frozen hits), so a restore
        // mid Time Stop must not see the unit as thawed. Omitted when not frozen.
        ...(unit.localFrozen ? { localFrozen: true } : {}),
        ...(unit.frozenHitPolicyFromStop !== undefined ? { frozenHitPolicyFromStop: unit.frozenHitPolicyFromStop } : {}),
        ...(unit.pendingFrozenHits.length > 0 ? { pendingFrozenHits: unit.pendingFrozenHits.map((h) => ({ ...h })) } : {}),
        combatSettings: unit.combatSettings,
        ...(unit.passiveBonuses && Object.keys(unit.passiveBonuses).length > 0
            ? { passiveBonuses: unit.passiveBonuses }
            : {}),
        ...(unit.roundStartRecoveryCharges.length > 0
            ? { roundStartRecoveryCharges: unit.roundStartRecoveryCharges.map((c) => ({ ...c })) }
            : {}),
        ...(unit.ephemeralDespawnAtGameTime != null
            ? { ephemeralDespawnAtGameTime: unit.ephemeralDespawnAtGameTime }
            : {}),
        ...(unit.tags.length > 0 ? { tags: [...unit.tags] } : {}),
        ...(unit.controllable === false ? { controllable: false } : {}),
        ...(unit.controlGroupId != null ? { controlGroupId: unit.controlGroupId } : {}),
        // Component slices (lanternite, swarm, pet, ...) write their own top-level keys; see components/unitComponent.ts.
        ...serializeUnitComponents(unit),
        ...(unit.wallEntryPoint != null ? { wallEntryPoint: { ...unit.wallEntryPoint } } : {}),
        ...(unit.invulnerabilityGenerations != null ? { invulnerabilityGenerations: unit.invulnerabilityGenerations } : {}),
        tacticalPlan: unit.tacticalPlan
            ? serializeTacticalPlan(unit.tacticalPlan, currentGameTick)
            : null,
    };
}

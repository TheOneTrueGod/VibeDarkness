import type { Unit } from './Unit';
import { PLAYER_CHARACTER_ID } from './unit_defs/unitDef';
import { serializeTacticalPlan } from './unitAI/plans/planUtils';
import { petStateToJSON } from './unitPetState';
import {
    lanterniteStateToJSONAfterSwarm,
    lanterniteStateToJSONBeforeThornling,
    lanterniteStateToJSONBeforeWall,
} from './unitLanterniteState';
import { thornlingStateToJSON } from './unitThornlingState';
import { swarmStateToJSON } from './unitSwarmState';
import { ccArmourStateToJSON } from '../../crowdControl/ccArmourState';

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
        } : null,
        abilities: unit.abilities,
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
            ...(a.movementByLabel !== undefined
                ? { movementByLabel: JSON.parse(JSON.stringify(a.movementByLabel)) as typeof a.movementByLabel }
                : {}),
        })),
        abilityNote: unit.abilityNote,
        radius: unit.radius,
        aiSettings: unit.aiSettings,
        pathfindingRetriggerOffset: unit.pathfindingRetriggerOffset,
        pathInvalidated: unit.pathInvalidated,
        aiContext: unit.aiContext,
        unitAITreeId: unit.unitAITreeId,
        moveJitter: unit.moveJitter,
        spawnTimer: unit.spawnTimer,
        growAnimTimer: unit.growAnimTimer,
        waitMinEndTime: unit.waitMinEndTime,
        waitMaxEndTime: unit.waitMaxEndTime,
        movementPaused: unit.movementPaused,
        corruptionProgress: unit.corruptionProgress,
        crystalCorruptionProgress: unit.crystalCorruptionProgress,
        darknessDamageProcCount: unit.darknessDamageProcCount,
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
        combatSettings: unit.combatSettings,
        ...(unit.ephemeralDespawnAtGameTime != null
            ? { ephemeralDespawnAtGameTime: unit.ephemeralDespawnAtGameTime }
            : {}),
        ...(unit.tags.length > 0 ? { tags: [...unit.tags] } : {}),
        ...(unit.controllable === false ? { controllable: false } : {}),
        ...(unit.controlGroupId != null ? { controlGroupId: unit.controlGroupId } : {}),
        ...lanterniteStateToJSONBeforeWall(unit),
        ...(unit.wallEntryPoint != null ? { wallEntryPoint: { ...unit.wallEntryPoint } } : {}),
        ...lanterniteStateToJSONBeforeThornling(unit),
        ...thornlingStateToJSON(unit),
        ...swarmStateToJSON(unit),
        ...lanterniteStateToJSONAfterSwarm(unit),
        ...(unit.invulnerabilityGenerations != null ? { invulnerabilityGenerations: unit.invulnerabilityGenerations } : {}),
        ...petStateToJSON(unit),
        tacticalPlan: unit.tacticalPlan
            ? serializeTacticalPlan(unit.tacticalPlan, currentGameTick)
            : null,
    };
}

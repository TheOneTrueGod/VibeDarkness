import type { Unit } from './Unit';
import type { EventBus } from '../EventBus';
import type { AbilityModifier } from '../../../../researchTrees/types';
import type { ActiveAbility } from '../types';
import type { AbilityNote } from '../AbilityNote';
import type { BuffSerialized } from '../../buffs/Buff';
import { buffFromJSON } from '../../buffs/buffRegistry';
import { parseUnitTagsFromJSON } from './unitTag';
import { PLAYER_CHARACTER_ID } from './unit_defs/unitDef';
import { deserializeTacticalPlan } from './unitAI/plans/planUtils';
import type { SerializedTacticalPlan } from './unitAI/plans/types';
import type { AISettings, KnockbackSource, KnockbackState, NudgeState, UnitAbilityRuntimeState } from './unitTypes';
import type { UnitAIContext } from './unitAI/contextTypes';
import { applyPetStateFromJSON } from './unitPetState';
import { applyLanterniteStateFromJSON } from './unitLanterniteState';
import { applyThornlingStateFromJSON } from './unitThornlingState';
import { applySwarmStateFromJSON } from './unitSwarmState';
import { applyCcArmourStateFromJSON } from '../../crowdControl/ccArmourState';

/** Old unit.characterId values for player units before unified `player` id. */
const LEGACY_PLAYER_CHARACTER_IDS = new Set([
    'warrior', 'mage', 'ranger', 'healer', 'rogue', 'necromancer',
]);

export function normalizeLegacyUnitIdentity(data: Record<string, unknown>): { characterId: string; portraitId: string | undefined } {
    const ownerId = data.ownerId as string;
    let characterId = data.characterId as string;
    let portraitId = data.portraitId as string | undefined;
    if (LEGACY_PLAYER_CHARACTER_IDS.has(characterId) && ownerId !== 'ai') {
        portraitId = portraitId ?? characterId;
        characterId = PLAYER_CHARACTER_ID;
    }
    if (characterId === PLAYER_CHARACTER_ID && ownerId !== 'ai' && (portraitId === undefined || portraitId === '')) {
        portraitId = 'warrior';
    }
    return { characterId, portraitId };
}

export function applySerializedUnitState(unit: Unit, data: Record<string, unknown>, _eventBus: EventBus, currentGameTick: number): void {
    unit.active = data.active as boolean;
    unit.stackSize = (data.stackSize as number | undefined) ?? 1;
    if (data.ephemeralDespawnAtGameTime != null) {
        unit.ephemeralDespawnAtGameTime = data.ephemeralDespawnAtGameTime as number;
    }
    applyLanterniteStateFromJSON(unit, data);
    applyThornlingStateFromJSON(unit, data);
    applySwarmStateFromJSON(unit, data);
    if (typeof data.invulnerabilityGenerations === 'number') {
        unit.invulnerabilityGenerations = data.invulnerabilityGenerations;
    }
    applyPetStateFromJSON(unit, data);

    // Restore movement
    const movementData = data.movement as {
        path: { col: number; row: number }[];
        targetUnitId: string | undefined;
        targetPixel?: { x: number; y: number };
        pathfindingTick: number;
    } | null;
    if (movementData && movementData.path && movementData.path.length > 0) {
        unit.movement = {
            path: movementData.path.map((p) => ({ ...p })),
            targetUnitId: movementData.targetUnitId,
            targetPixel: movementData.targetPixel ? { ...movementData.targetPixel } : undefined,
            pathfindingTick: movementData.pathfindingTick,
        };
    }

    // Radius resolves from the unit def; only explicit overrides are serialized.
    // Legacy `data.radius` (pre-migration checkpoints) is intentionally ignored so def changes propagate.
    unit.radiusOverride = typeof data.radiusOverride === 'number' ? data.radiusOverride : undefined;
    unit.aiSettings = (data.aiSettings as AISettings | null) ?? null;
    unit.pathfindingRetriggerOffset = (data.pathfindingRetriggerOffset as number) ?? 0;
    unit.pathInvalidated = (data.pathInvalidated as boolean) ?? false;
    const rawCtx = (data.aiContext ?? {}) as Record<string, unknown>;
    if (rawCtx.unitAINodeId !== undefined) { rawCtx.aiState = rawCtx.unitAINodeId; delete rawCtx.unitAINodeId; }
    if (rawCtx.aiTargetUnitId !== undefined) { rawCtx.targetUnitId = rawCtx.aiTargetUnitId; delete rawCtx.aiTargetUnitId; }
    unit.aiContext = rawCtx as UnitAIContext;
    unit.unitAITreeId = (data.unitAITreeId as string) ?? 'hunt';
    unit.moveJitter = (data.moveJitter as number) ?? 0;
    unit.spawnTimer = (data.spawnTimer as number | undefined) ?? 0;
    unit.growAnimTimer = (data.growAnimTimer as number | undefined) ?? 0;
    unit.waitMinEndTime = (data.waitMinEndTime as number | null) ?? null;
    unit.waitMaxEndTime = (data.waitMaxEndTime as number | null) ?? null;
    unit.movementPaused = (data.movementPaused as boolean | undefined) ?? false;
    applyCcArmourStateFromJSON(unit, data);
    unit.corruptionProgress = Math.max(0, Math.min(1, (data.corruptionProgress as number) ?? 0));
    unit.crystalCorruptionProgress = Math.max(0, Math.min(1, (data.crystalCorruptionProgress as number) ?? 0));
    unit.darknessDamageProcCount = Math.max(0, Math.floor((data.darknessDamageProcCount as number) ?? 0));
    unit.hpInjury = Math.max(0, (data.hpInjury as number) ?? 0);
    const kb = data.knockback as KnockbackState | null;
    if (kb && typeof kb.knockbackElapsed === 'number') {
        unit.knockback = {
            knockbackVector: { ...(kb.knockbackVector as { x: number; y: number }) },
            knockbackAirTime: kb.knockbackAirTime as number,
            knockbackSlideTime: kb.knockbackSlideTime as number,
            knockbackSource: { ...(kb.knockbackSource as KnockbackSource) },
            knockbackElapsed: kb.knockbackElapsed,
            ...(kb.passThroughTerrain ? { passThroughTerrain: true } : {}),
            ...(kb.collideWithUnits ? { collideWithUnits: true } : {}),
            ...(kb.bounceOffTerrain ? { bounceOffTerrain: true } : {}),
            ...(typeof kb.unitCollisionStartFraction === 'number' && kb.unitCollisionStartFraction > 0
                ? { unitCollisionStartFraction: kb.unitCollisionStartFraction }
                : {}),
        };
    }
    const ng = data.nudge as NudgeState | null;
    if (ng && typeof ng.nudgeElapsed === 'number') {
        unit.nudge = {
            nudgeVector: { ...(ng.nudgeVector as { x: number; y: number }) },
            nudgeDuration: ng.nudgeDuration as number,
            nudgeElapsed: ng.nudgeElapsed,
        };
    }
    unit.wallStuckTime = typeof data.wallStuckTime === 'number' ? data.wallStuckTime : 0;
    unit.activeAbilities = (data.activeAbilities as ActiveAbility[]) ?? [];
    unit.abilityNote = (data.abilityNote as AbilityNote | null) ?? null;

    const buffsData = (data.buffs as BuffSerialized[] | undefined) ?? [];
    unit.buffs = buffsData.map((b) => buffFromJSON(b));
    unit.tags = parseUnitTagsFromJSON(data.tags);
    if (data.controllable === false) {
        unit.controllable = false;
    }
    if (typeof data.controlGroupId === 'string') {
        unit.controlGroupId = data.controlGroupId;
    }
    const runtimeData = (data.abilityRuntime as Record<string, UnitAbilityRuntimeState> | undefined) ?? {};
    unit.abilityRuntime = Object.fromEntries(
        Object.entries(runtimeData).map(([abilityId, runtime]) => [
            abilityId,
            {
                currentUses: runtime.currentUses,
                maxUses: runtime.maxUses,
                recoveryChargesByType: { ...(runtime.recoveryChargesByType ?? {}) },
                active: (runtime as any).active ?? true,          // default true for old snapshots
                replacedAbilityId: (runtime as any).replacedAbilityId ?? null,
            },
        ]),
    );
    unit.abilityModifiers = (data.abilityModifiers as Record<string, AbilityModifier> | undefined) ?? {};

    const wep = data.wallEntryPoint as { x?: number; y?: number } | undefined;
    if (wep != null && typeof wep.x === 'number' && typeof wep.y === 'number') {
        unit.wallEntryPoint = { x: wep.x, y: wep.y };
    }

    if (data.tacticalPlan) {
        unit.tacticalPlan = deserializeTacticalPlan(
            data.tacticalPlan as SerializedTacticalPlan,
            currentGameTick,
        );
    }

    // Resources are reattached by the unit subclass factory
}

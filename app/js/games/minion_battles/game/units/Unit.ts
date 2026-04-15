/**
 * Unit - Base class for all units in the battle.
 *
 * Holds HP, team, owner, speed, resources, active abilities, wait lockout, and movement.
 * Supports waypoint-based pathfinding movement with terrain speed modifiers.
 * Subclasses define per-character defaults.
 */

import { GameObject, generateGameObjectId } from '../GameObject';
import type { TeamId } from '../teams';
import type { ActiveAbility } from '../types';
import type { AbilityNote } from '../AbilityNote';
import type { Resource } from '../../resources/Resource';
import type { EventBus } from '../EventBus';
import { getAbility } from '../../abilities/AbilityRegistry';
import { AbilityState, refundAbilityCost } from '../../abilities/Ability';
import type { Buff, BuffSerialized } from '../../buffs/Buff';
import { buffFromJSON } from '../../buffs/buffRegistry';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { TerrainGrid } from '../../terrain/TerrainGrid';
import { computeForcedDisplacement } from '../forceMove';
import { DEFAULT_UNIT_RADIUS } from './unit_defs/unitConstants';
import { debugSettingsSnapshot } from '../../../../debug/debugSettingsStore';
import { getDefaultHp } from './unit_defs/unitDef';
import { getHealthBonusFromResearch } from '../../research/researchTrainingEffects';
import type { RecoveryChargeType } from '../../abilities/abilityUses';

/** AI behavior settings for enemy units. */
export interface AISettings {
    /** Minimum desired distance (px) to target. AI backs away if closer. */
    minRange: number;
    /** Maximum desired distance (px) to target. AI approaches if farther. */
    maxRange: number;
}

import type { UnitAIContext } from './unitAI/contextTypes';
export type { UnitAIContext } from './unitAI/contextTypes';

/** Movement state for a unit. */
export interface UnitMovement {
    /** Grid cells to traverse, each exactly 1 cell (cardinal or diagonal) from the previous. */
    path: { col: number; row: number }[];
    /** ID of the unit being pursued (undefined for ground-move orders). */
    targetUnitId: string | undefined;
    /** The gameTick when pathfinding was last computed. */
    pathfindingTick: number;
}

/** Source of knockback (for callbacks). Serializable. */
export interface KnockbackSource {
    /** Unit ID that applied the knockback. */
    unitId: string;
    /** Ability ID used. */
    abilityId: string;
}

/** Knockback state on a unit. Serializable. */
export interface KnockbackState {
    /** Direction and magnitude (px) of the knockback. */
    knockbackVector: { x: number; y: number };
    /** Time (seconds) the unit is in the air and cannot move; full vector applied. */
    knockbackAirTime: number;
    /** Time (seconds) after air during which half the vector is applied (slide). */
    knockbackSlideTime: number;
    /** Who applied the knockback (for callbacks). */
    knockbackSource: KnockbackSource;
    /** Time (seconds) this knockback has been active. */
    knockbackElapsed: number;
}

/** Parameters for applying knockback to a unit. */
export interface ApplyKnockbackParams {
    knockbackVector: { x: number; y: number };
    knockbackAirTime: number;
    knockbackSlideTime: number;
    knockbackSource: KnockbackSource;
}

export interface UnitAbilityRuntimeState {
    currentUses: number;
    maxUses: number;
    recoveryChargesByType: Partial<Record<RecoveryChargeType, number>>;
}

export class Unit extends GameObject {
    hp: number;
    maxHp: number;
    speed: number;
    teamId: TeamId;
    ownerId: string; // playerId or 'ai'
    characterId: string;
    name: string;

    /** Attached resource instances (Rage, Mana, etc.). */
    resources: Resource[] = [];
    /** Ability runtime state (uses and recharge charges) keyed by ability id. */
    abilityRuntime: Record<string, UnitAbilityRuntimeState> = {};
    /** Stamina stat; granted as stamina charges to all abilities on cadence triggers. */
    stamina: number = 1;

    /** Movement state: grid path, optional target unit, and pathfinding tick. */
    movement: UnitMovement | null = null;

    /** Ability IDs available to this unit. */
    abilities: string[] = [];

    /** Abilities currently being executed (tick-based effects in progress). */
    activeAbilities: ActiveAbility[] = [];

    /** Note set by the currently executing ability (e.g. stored target position). Cleared when ability ends or is overwritten. */
    abilityNote: AbilityNote | null = null;

    /** Visual radius for collision and rendering. */
    radius: number = 20;

    /** AI behavior settings (only used for AI-controlled units). */
    aiSettings: AISettings | null = null;

    /** Recalculate pathfinding every N ticks (0 = never). Set at spawn from engine RNG. */
    pathfindingRetriggerOffset: number = 0;

    /** True after forced movement (knockback, ability displacement); next normal move must recalculate path. */
    pathInvalidated: boolean = false;

    /** Per-controller AI context bag (serialized via toJSON/fromJSON). */
    aiContext: UnitAIContext = {};

    /** UnitAITree ID for AI-controlled units. Default 'default'. */
    unitAITreeId: string = 'default';

    /** Optional tags (e.g. 'protectedByCrystal' when near a crystal; enemies cannot see the unit). Not serialized by default; mission logic can set. */
    tags: string[] = [];

    /** Per-unit aim jitter factor in [0, 1]. Used to bias attack direction. */
    moveJitter: number = 0;

    /** When using the "wait" action: earliest and latest gameTime (seconds) when the wait can end. */
    waitMinEndTime: number | null = null;
    waitMaxEndTime: number | null = null;

    /** Darkness corruption progress 0..1. Fills in 1s when in full darkness or the tier below, drains in 1s when not. At 1: deal 5 damage (full darkness) or 2 (tier below) and reset. */
    corruptionProgress: number = 0;

    /** Current Poise HP. When 0 or below, knockback is applied. */
    poiseHp: number = 0;
    /** Maximum Poise HP. Units with 0 have no poise (knockback always applies). */
    maxPoiseHp: number = 0;

    /** Active knockback state; unit cannot move while set. */
    knockback: KnockbackState | null = null;

    /** Active buffs/debuffs on this unit. Serialized for checkpoints. */
    buffs: Buff[] = [];

    constructor(config: {
        id?: string;
        x: number;
        y: number;
        hp: number;
        maxHp?: number;
        speed: number;
        teamId: TeamId;
        ownerId: string;
        characterId: string;
        name: string;
        abilities?: string[];
        aiSettings?: AISettings | null;
        /** UnitAITree ID for AI. Default 'default'. */
        unitAITreeId?: string;
        /** Visual/collision radius. Defaults to DEFAULT_UNIT_RADIUS. */
        radius?: number;
        /** Max Poise HP. Default 0 (no poise). */
        maxPoiseHp?: number;
        /** Stamina stat. */
        stamina?: number;
    }) {
        super(config.id ?? generateGameObjectId('unit'), config.x, config.y);
        this.hp = config.hp;
        this.maxHp = config.maxHp ?? config.hp;
        this.speed = config.speed;
        this.teamId = config.teamId;
        this.ownerId = config.ownerId;
        this.characterId = config.characterId;
        this.name = config.name;
        this.abilities = config.abilities ?? [];
        this.aiSettings = config.aiSettings ?? null;
        this.unitAITreeId = config.unitAITreeId ?? 'default';
        this.radius = config.radius ?? DEFAULT_UNIT_RADIUS;
        this.maxPoiseHp = config.maxPoiseHp ?? 0;
        this.poiseHp = this.maxPoiseHp;
        this.stamina = config.stamina ?? 1;
    }

    /** Attach a resource and subscribe its event listeners. */
    attachResource(resource: Resource, eventBus: EventBus): void {
        this.resources.push(resource);
        resource.attach(this, eventBus);
    }

    /** Detach all resources and unsubscribe their event listeners. */
    detachAllResources(eventBus: EventBus): void {
        for (const resource of this.resources) {
            resource.detach(eventBus);
        }
        this.resources = [];
    }

    /** Get a resource by its ID. */
    getResource(resourceId: string): Resource | undefined {
        return this.resources.find((r) => r.id === resourceId);
    }

    /** Whether this unit is controlled by a real player (not AI). */
    isPlayerControlled(): boolean {
        return this.ownerId !== 'ai';
    }

    /** Whether this unit is alive. */
    isAlive(): boolean {
        return this.hp > 0 && this.active;
    }

    /**
     * Calculate max health from unit def base + health-affecting research.
     * Loops through RESEARCH_HEALTH_BONUSES for each researched node.
     * @param getResearchNodes Callback (treeId) => researched node IDs for this unit's owner.
     */
    calculateMaxHealth(getResearchNodes: (treeId: string) => string[]): number {
        const base = getDefaultHp(this.characterId);
        const bonus = getHealthBonusFromResearch(getResearchNodes);
        return base + bonus;
    }

    /** Apply damage to this unit. Returns actual damage dealt. */
    takeDamage(amount: number, sourceUnitId: string | null, eventBus: EventBus): number {
        if (!this.isAlive()) return 0;

        // God mode: prevent HP loss for player-controlled units.
        if (debugSettingsSnapshot.godModeEnabled && this.isPlayerControlled()) {
            return 0;
        }
        const actual = Math.min(amount, this.hp);
        this.hp -= actual;

        eventBus.emit('damage_taken', {
            unitId: this.id,
            amount: actual,
            sourceUnitId,
        });

        if (this.hp <= 0) {
            this.hp = 0;
            this.active = false;

            eventBus.emit('unit_died', {
                unitId: this.id,
                killerUnitId: sourceUnitId,
            });
        }

        return actual;
    }

    /** Set movement state with a grid-cell path. Clears movement if path is empty. Clears pathInvalidated. */
    setMovement(path: { col: number; row: number }[], targetUnitId: string | undefined, pathfindingTick: number): void {
        if (path.length === 0) {
            this.movement = null;
            return;
        }
        this.pathInvalidated = false;
        this.movement = {
            path: path.map((p) => ({ ...p })),
            targetUnitId,
            pathfindingTick,
        };
    }

    /** Clear all movement state. */
    clearMovement(): void {
        this.movement = null;
    }

    /**
     * Mark the current pathfinding route as invalid (e.g. after knockback or forced movement).
     * Next normal move will recalculate the path. Clears movement so the unit does not follow the old route.
     */
    invalidateMovementPath(): void {
        this.movement = null;
        this.pathInvalidated = true;
    }

    /**
     * Attempt to apply knockback to this unit. Poise is consumed first; if the unit
     * has no Poise HP left (or has no max poise), knockback is applied.
     * When knockback is applied, onApplied is called so the caller can interrupt the unit
     * (e.g. cancel and refund any ability in progress).
     * @param poiseDamage Amount of Poise HP to subtract (0 = no poise check).
     * @param params Knockback vector, times, and source.
     * @param _eventBus Event bus (unused).
     * @param onApplied Called when knockback is successfully applied; use to interrupt the unit.
     * @returns true if knockback was applied, false if resisted by poise.
     */
    applyKnockback(
        poiseDamage: number,
        params: ApplyKnockbackParams,
        _eventBus: EventBus,
        onApplied?: (unit: Unit) => void,
    ): boolean {
        if (poiseDamage > 0) {
            this.poiseHp = Math.max(0, this.poiseHp - poiseDamage);
            if (this.maxPoiseHp > 0 && this.poiseHp > 0) return false;
        }
        this.knockback = {
            knockbackVector: { ...params.knockbackVector },
            knockbackAirTime: params.knockbackAirTime,
            knockbackSlideTime: params.knockbackSlideTime,
            knockbackSource: { ...params.knockbackSource },
            knockbackElapsed: 0,
        };
        this.invalidateMovementPath();
        onApplied?.(this);
        return true;
    }

    /** Whether the unit is currently being knocked back (cannot move or act). */
    isInKnockback(): boolean {
        return this.knockback !== null;
    }

    /**
     * Move the unit toward a world position by at most maxDistance.
     * If the unit has a movement path, checks whether a new step (current grid cell)
     * needs to be prepended to the path so pathfinding stays valid after the move.
     * Returns the actual distance moved.
     */
    moveUnit(towardX: number, towardY: number, maxDistance: number): number {
        const dx = towardX - this.x;
        const dy = towardY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return 0;

        const step = Math.min(maxDistance, dist);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;

        if (this.movement && this.movement.path.length > 0) {
            const currentCol = Math.floor(this.x / CELL_SIZE);
            const currentRow = Math.floor(this.y / CELL_SIZE);
            const first = this.movement.path[0];
            if (currentCol !== first.col || currentRow !== first.row) {
                this.movement.path.unshift({ col: currentCol, row: currentRow });
            }
        }

        return step;
    }

    update(dt: number, engine: unknown): void {
        const eng = engine as { gameTime: number; roundNumber: number };
        const gameTime = eng.gameTime;
        const roundNumber = eng.roundNumber ?? 1;

        // Expire buffs
        this.buffs = this.buffs.filter((b) => !b.isExpired(gameTime, roundNumber));

        // Wait action: enforce minimum and maximum wait duration, and allow early end when movement finishes.
        if (this.waitMinEndTime !== null && this.waitMaxEndTime !== null) {
            const reachedMovementTarget = !this.movement;
            const afterMin = gameTime >= this.waitMinEndTime;
            const afterMax = gameTime >= this.waitMaxEndTime;

            if (afterMax || (afterMin && reachedMovementTarget)) {
                this.waitMinEndTime = null;
                this.waitMaxEndTime = null;
            }
        }

        const terrainManager = (engine as { terrainManager?: TerrainManager }).terrainManager ?? null;
        const grid = terrainManager?.grid ?? null;

        // Knockback: unit cannot move normally; apply push and wall bounce
        if (this.knockback) {
            this.updateKnockback(dt, grid);
            return;
        }

        // Move along grid path
        if (!this.isAlive() || !this.movement || this.movement.path.length === 0) return;

        // Target: jittered position around the center of the next grid cell in the path
        const nextCell = this.movement.path[0];
        const centerX = nextCell.col * CELL_SIZE + CELL_SIZE / 2;
        const centerY = nextCell.row * CELL_SIZE + CELL_SIZE / 2;

        // Movement jitter: deterministic per-unit offset so multiple units in the same tile stand on different pixels.
        const jitterAngle = (this.moveJitter ?? 0) * Math.PI * 2;
        const jitterRadius = CELL_SIZE * 0.15;
        const jitterX = Math.cos(jitterAngle) * jitterRadius;
        const jitterY = Math.sin(jitterAngle) * jitterRadius;

        const targetX = centerX + jitterX;
        const targetY = centerY + jitterY;

        // Compute effective speed: base × ability penalties × terrain modifier
        let effectiveSpeed = this.getEffectiveSpeed(gameTime);
        if (terrainManager) {
            effectiveSpeed *= terrainManager.getSpeedMultiplier(this.x, this.y);
        }

        // Debug: super speed for player-controlled units
        if (debugSettingsSnapshot.superSpeedEnabled && this.isPlayerControlled()) {
            effectiveSpeed *= 10;
        }

        // Move toward the jittered target within the tile
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const step = effectiveSpeed * dt;
        if (dist <= step) {
            this.x = targetX;
            this.y = targetY;
        } else if (dist > 0) {
            this.x += (dx / dist) * step;
            this.y += (dy / dist) * step;
        }

        // Only advance the path when we've effectively reached the jittered target position
        const remainingDx = targetX - this.x;
        const remainingDy = targetY - this.y;
        const remainingDistSq = remainingDx * remainingDx + remainingDy * remainingDy;
        const EPSILON = 1; // 1px tolerance
        if (remainingDistSq <= EPSILON * EPSILON) {
            this.movement.path.shift();
            if (this.movement.path.length === 0) {
                this.movement = null;
            }
        }
    }

    /**
     * Advance knockback state: apply push (full vector during air, half during slide).
     * If the next position would be out of bounds or unwalkable, knockback is cleared
     * immediately and no movement is applied.
     */
    private updateKnockback(dt: number, grid: TerrainGrid | null): void {
        const k = this.knockback!;
        const airTime = k.knockbackAirTime;
        const slideTime = k.knockbackSlideTime;
        const totalTime = airTime + slideTime;
        const v = k.knockbackVector;

        const displacementAt = (t: number): { x: number; y: number } => {
            if (t <= 0) return { x: 0, y: 0 };
            if (t <= airTime) {
                const f = t / airTime;
                return { x: v.x * f, y: v.y * f };
            }
            const slideT = Math.min(t - airTime, slideTime);
            return { x: v.x + 0.5 * (slideT / slideTime) * v.x, y: v.y + 0.5 * (slideT / slideTime) * v.y };
        };

        const prevElapsed = k.knockbackElapsed;
        k.knockbackElapsed = Math.min(k.knockbackElapsed + dt, totalTime);

        const prevD = displacementAt(prevElapsed);
        const newD = displacementAt(k.knockbackElapsed);
        const pushX = newD.x - prevD.x;
        const pushY = newD.y - prevD.y;

        const newX = this.x + pushX;
        const newY = this.y + pushY;

        const segmentLength = Math.sqrt(pushX * pushX + pushY * pushY);
        if (segmentLength > 0 && grid) {
            const { distance } = computeForcedDisplacement(
                this.x,
                this.y,
                newX,
                newY,
                segmentLength,
                { grid },
            );
            if (distance <= 0) {
                this.knockback = null;
                return;
            }

            const scale = distance / segmentLength;
            this.x += pushX * scale;
            this.y += pushY * scale;
        } else {
            this.x += pushX;
            this.y += pushY;
        }

        if (k.knockbackElapsed >= totalTime) {
            this.knockback = null;
        }
    }

    /**
     * Get the unit's effective speed accounting for movement penalties
     * from all active abilities. Takes the lowest penalty multiplier.
     */
    getEffectiveSpeed(gameTime: number): number {
        let lowestPenalty = 1;

        for (const active of this.activeAbilities) {
            const ability = getAbility(active.abilityId);
            if (!ability) continue;

            const currentTime = gameTime - active.startTime;
            const states =
                ability.getAbilityStatesForActive?.(currentTime, active) ??
                ability.getAbilityStates(currentTime);

            for (const entry of states) {
                if (entry.state === AbilityState.MOVEMENT_PENALTY) {
                    lowestPenalty = Math.min(lowestPenalty, entry.data.amount);
                }
            }
        }

        return this.speed * lowestPenalty;
    }

    /**
     * Whether the unit currently has invincibility frames from any active ability.
     * When true, projectiles should not deal damage to this unit.
     */
    hasIFrames(gameTime: number): boolean {
        for (const active of this.activeAbilities) {
            const ability = getAbility(active.abilityId);
            if (!ability) continue;

            const currentTime = gameTime - active.startTime;
            const states =
                ability.getAbilityStatesForActive?.(currentTime, active) ??
                ability.getAbilityStates(currentTime);

            for (const entry of states) {
                if (entry.state === AbilityState.IFRAMES) return true;
            }
        }
        return false;
    }

    /** True while a wait order is active (see `GameEngine` wait handling). */
    isInWaitLockout(): boolean {
        return this.waitMinEndTime !== null && this.waitMaxEndTime !== null;
    }

    /** Whether the unit can take a new order (move / card / wait). */
    canAct(): boolean {
        return (
            this.isAlive() &&
            !this.isInKnockback() &&
            !this.hasBuff('stunned') &&
            this.activeAbilities.length === 0 &&
            !this.isInWaitLockout()
        );
    }

    /** Fast check: does this unit have a buff of the given type? */
    hasBuff(buffType: string): boolean {
        return this.buffs.some((b) => b._type === buffType);
    }

    /** Add a buff to this unit. Caller sets appliedAtTime/appliedAtRound on the buff. */
    addBuff(buff: Buff, gameTime: number, roundNumber: number): void {
        buff.appliedAtTime = gameTime;
        buff.appliedAtRound = roundNumber;
        this.buffs.push(buff);
    }

    /** Interrupt all active abilities (e.g. when stunned). Refunds resource costs. */
    interruptAllAbilities(): void {
        for (const active of this.activeAbilities) {
            const ability = getAbility(active.abilityId);
            if (ability) refundAbilityCost(this, ability);
        }
        this.activeAbilities = [];
        this.clearAbilityNote();
    }

    /** Set the ability note (overwrites any existing). Used by abilities during execution. */
    setAbilityNote(note: { abilityId: string; abilityNote: unknown } | null): void {
        this.abilityNote = note as AbilityNote | null;
    }

    /** Clear the ability note. */
    clearAbilityNote(): void {
        this.abilityNote = null;
    }

    toJSON(): Record<string, unknown> {
        return {
            _type: 'unit',
            id: this.id,
            x: this.x,
            y: this.y,
            active: this.active,
            hp: this.hp,
            maxHp: this.maxHp,
            speed: this.speed,
            teamId: this.teamId,
            ownerId: this.ownerId,
            characterId: this.characterId,
            name: this.name,
            movement: this.movement ? {
                path: this.movement.path.map((p) => ({ ...p })),
                targetUnitId: this.movement.targetUnitId,
                pathfindingTick: this.movement.pathfindingTick,
            } : null,
            abilities: this.abilities,
            activeAbilities: this.activeAbilities.map((a) => ({
                ...a,
                targets: a.targets.map((t) => ({ ...t })),
                castPayload:
                    a.castPayload !== undefined
                        ? JSON.parse(JSON.stringify(a.castPayload)) as unknown
                        : undefined,
            })),
            abilityNote: this.abilityNote,
            radius: this.radius,
            aiSettings: this.aiSettings,
            pathfindingRetriggerOffset: this.pathfindingRetriggerOffset,
            pathInvalidated: this.pathInvalidated,
            aiContext: this.aiContext,
            unitAITreeId: this.unitAITreeId,
            moveJitter: this.moveJitter,
            waitMinEndTime: this.waitMinEndTime,
            waitMaxEndTime: this.waitMaxEndTime,
            poiseHp: this.poiseHp,
            maxPoiseHp: this.maxPoiseHp,
            knockback: this.knockback ? {
                knockbackVector: { ...this.knockback.knockbackVector },
                knockbackAirTime: this.knockback.knockbackAirTime,
                knockbackSlideTime: this.knockback.knockbackSlideTime,
                knockbackSource: { ...this.knockback.knockbackSource },
                knockbackElapsed: this.knockback.knockbackElapsed,
            } : null,
            resources: this.resources.map((r) => r.toJSON()),
            abilityRuntime: Object.fromEntries(
                Object.entries(this.abilityRuntime).map(([abilityId, runtime]) => [
                    abilityId,
                    {
                        currentUses: runtime.currentUses,
                        maxUses: runtime.maxUses,
                        recoveryChargesByType: { ...runtime.recoveryChargesByType },
                    },
                ]),
            ),
            stamina: this.stamina,
            buffs: this.buffs.map((b) => b.toJSON()),
        };
    }

    static fromJSON(data: Record<string, unknown>, _eventBus: EventBus): Unit {
        const unit = new Unit({
            id: data.id as string,
            x: data.x as number,
            y: data.y as number,
            hp: data.hp as number,
            maxHp: data.maxHp as number,
            speed: data.speed as number,
            teamId: data.teamId as TeamId,
            ownerId: data.ownerId as string,
            characterId: data.characterId as string,
            name: data.name as string,
            abilities: data.abilities as string[],
            stamina: (data.stamina as number | undefined) ?? 1,
        });
        unit.active = data.active as boolean;

        // Restore movement
        const movementData = data.movement as {
            path: { col: number; row: number }[];
            targetUnitId: string | undefined;
            pathfindingTick: number;
        } | null;
        if (movementData && movementData.path && movementData.path.length > 0) {
            unit.movement = {
                path: movementData.path.map((p) => ({ ...p })),
                targetUnitId: movementData.targetUnitId,
                pathfindingTick: movementData.pathfindingTick,
            };
        }

        unit.radius = (data.radius as number) ?? DEFAULT_UNIT_RADIUS;
        unit.aiSettings = (data.aiSettings as AISettings | null) ?? null;
        unit.pathfindingRetriggerOffset = (data.pathfindingRetriggerOffset as number) ?? 0;
        unit.pathInvalidated = (data.pathInvalidated as boolean) ?? false;
        const rawCtx = (data.aiContext ?? {}) as Record<string, unknown>;
        if (rawCtx.unitAINodeId !== undefined) { rawCtx.aiState = rawCtx.unitAINodeId; delete rawCtx.unitAINodeId; }
        if (rawCtx.aiTargetUnitId !== undefined) { rawCtx.targetUnitId = rawCtx.aiTargetUnitId; delete rawCtx.aiTargetUnitId; }
        unit.aiContext = rawCtx as UnitAIContext;
        unit.unitAITreeId = (data.unitAITreeId as string) ?? 'default';
        unit.moveJitter = (data.moveJitter as number) ?? 0;
        unit.waitMinEndTime = (data.waitMinEndTime as number | null) ?? null;
        unit.waitMaxEndTime = (data.waitMaxEndTime as number | null) ?? null;
        unit.poiseHp = (data.poiseHp as number) ?? 0;
        unit.maxPoiseHp = (data.maxPoiseHp as number) ?? 0;
        unit.corruptionProgress = Math.max(0, Math.min(1, (data.corruptionProgress as number) ?? 0));
        const kb = data.knockback as KnockbackState | null;
        if (kb && typeof kb.knockbackElapsed === 'number') {
            unit.knockback = {
                knockbackVector: { ...(kb.knockbackVector as { x: number; y: number }) },
                knockbackAirTime: kb.knockbackAirTime as number,
                knockbackSlideTime: kb.knockbackSlideTime as number,
                knockbackSource: { ...(kb.knockbackSource as KnockbackSource) },
                knockbackElapsed: kb.knockbackElapsed,
            };
        }
        unit.activeAbilities = (data.activeAbilities as ActiveAbility[]) ?? [];
        unit.abilityNote = (data.abilityNote as AbilityNote | null) ?? null;

        const buffsData = (data.buffs as BuffSerialized[] | undefined) ?? [];
        unit.buffs = buffsData.map((b) => buffFromJSON(b));
        const runtimeData = (data.abilityRuntime as Record<string, UnitAbilityRuntimeState> | undefined) ?? {};
        unit.abilityRuntime = Object.fromEntries(
            Object.entries(runtimeData).map(([abilityId, runtime]) => [
                abilityId,
                {
                    currentUses: runtime.currentUses,
                    maxUses: runtime.maxUses,
                    recoveryChargesByType: { ...(runtime.recoveryChargesByType ?? {}) },
                },
            ]),
        );

        // Resources are reattached by the unit subclass factory
        return unit;
    }
}

/**
 * Unit - Base class for all units in the battle.
 *
 * Holds HP, team, owner, speed, resources, cooldown, and movement.
 * Supports waypoint-based pathfinding movement with terrain speed modifiers.
 * Subclasses define per-character defaults.
 */

import { GameObject, generateGameObjectId } from './GameObject';
import type { TeamId } from '../engine/teams';
import type { ActiveAbility } from '../engine/types';
import type { Resource } from '../resources/Resource';
import type { EventBus } from '../engine/EventBus';
import { getAbility } from '../abilities/AbilityRegistry';
import { AbilityState } from '../abilities/Ability';
import type { TerrainManager } from '../terrain/TerrainManager';
import { CELL_SIZE } from '../terrain/TerrainGrid';

/** AI behavior settings for enemy units. */
export interface AISettings {
    /** Minimum desired distance (px) to target. AI backs away if closer. */
    minRange: number;
    /** Maximum desired distance (px) to target. AI approaches if farther. */
    maxRange: number;
}

/** Movement state for a unit. */
export interface UnitMovement {
    /** Grid cells to traverse, each exactly 1 cell (cardinal or diagonal) from the previous. */
    path: { col: number; row: number }[];
    /** ID of the unit being pursued (undefined for ground-move orders). */
    targetUnitId: string | undefined;
    /** The gameTick when pathfinding was last computed. */
    pathfindingTick: number;
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

    /** Time remaining before the unit can act again (seconds). */
    cooldownRemaining: number = 0;

    /** Total duration of the current cooldown (for progress display). */
    cooldownTotal: number = 0;

    /** Movement state: grid path, optional target unit, and pathfinding tick. */
    movement: UnitMovement | null = null;

    /** Ability IDs available to this unit. */
    abilities: string[] = [];

    /** Abilities currently being executed (tick-based effects in progress). */
    activeAbilities: ActiveAbility[] = [];

    /** Visual radius for collision and rendering. */
    radius: number = 20;

    /** AI behavior settings (only used for AI-controlled units). */
    aiSettings: AISettings | null = null;

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

    /** Apply damage to this unit. Returns actual damage dealt. */
    takeDamage(amount: number, sourceUnitId: string | null, eventBus: EventBus): number {
        if (!this.isAlive()) return 0;
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

    /** Set movement state with a grid-cell path. Clears movement if path is empty. */
    setMovement(path: { col: number; row: number }[], targetUnitId: string | undefined, pathfindingTick: number): void {
        if (path.length === 0) {
            this.movement = null;
            return;
        }
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
        // Decrement cooldown
        if (this.cooldownRemaining > 0) {
            this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
        }

        // Move along grid path
        if (!this.isAlive() || !this.movement || this.movement.path.length === 0) return;

        const gameTime = (engine as { gameTime: number }).gameTime;
        const terrainManager = (engine as { terrainManager?: TerrainManager }).terrainManager ?? null;

        // Target: center of the next grid cell in the path
        const nextCell = this.movement.path[0];
        const targetX = nextCell.col * CELL_SIZE + CELL_SIZE / 2;
        const targetY = nextCell.row * CELL_SIZE + CELL_SIZE / 2;

        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Compute effective speed: base × ability penalties × terrain modifier
        let effectiveSpeed = this.getEffectiveSpeed(gameTime);
        if (terrainManager) {
            effectiveSpeed *= terrainManager.getSpeedMultiplier(this.x, this.y);
        }

        // Move toward the next cell center
        const step = effectiveSpeed * dt;
        if (step >= dist) {
            this.x = targetX;
            this.y = targetY;
        } else {
            this.x += (dx / dist) * step;
            this.y += (dy / dist) * step;
        }

        // Check if we've entered the front cell's grid coordinate
        const currentCol = Math.floor(this.x / CELL_SIZE);
        const currentRow = Math.floor(this.y / CELL_SIZE);
        if (currentCol === nextCell.col && currentRow === nextCell.row) {
            this.movement.path.shift();
            if (this.movement.path.length === 0) {
                this.movement = null;
            }
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
            const states = ability.getAbilityStates(currentTime);

            for (const entry of states) {
                if (entry.state === AbilityState.MOVEMENT_PENALTY) {
                    lowestPenalty = Math.min(lowestPenalty, entry.data.amount);
                }
            }
        }

        return this.speed * lowestPenalty;
    }

    /** Whether the unit's cooldown has finished and it can act. */
    canAct(): boolean {
        return this.cooldownRemaining <= 0 && this.isAlive();
    }

    /** Set cooldown after using an ability. */
    startCooldown(duration: number): void {
        this.cooldownRemaining = duration;
        this.cooldownTotal = duration;
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
            cooldownRemaining: this.cooldownRemaining,
            cooldownTotal: this.cooldownTotal,
            movement: this.movement ? {
                path: this.movement.path.map((p) => ({ ...p })),
                targetUnitId: this.movement.targetUnitId,
                pathfindingTick: this.movement.pathfindingTick,
            } : null,
            abilities: this.abilities,
            activeAbilities: this.activeAbilities.map((a) => ({ ...a, targets: a.targets.map((t) => ({ ...t })) })),
            radius: this.radius,
            aiSettings: this.aiSettings,
            resources: this.resources.map((r) => r.toJSON()),
        };
    }

    static fromJSON(data: Record<string, unknown>, eventBus: EventBus): Unit {
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
        });
        unit.active = data.active as boolean;
        unit.cooldownRemaining = data.cooldownRemaining as number;
        unit.cooldownTotal = (data.cooldownTotal as number) ?? 0;

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

        unit.radius = (data.radius as number) ?? 20;
        unit.aiSettings = (data.aiSettings as AISettings | null) ?? null;
        unit.activeAbilities = (data.activeAbilities as ActiveAbility[]) ?? [];

        // Resources are reattached by the unit subclass factory
        return unit;
    }
}

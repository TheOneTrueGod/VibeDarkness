import type { TerrainType } from '../terrain/TerrainType';
import type { KnockbackSource } from './units/unitTypes';

/**
 * EventBus - Typed pub/sub event system for the battle engine.
 *
 * Game events flow through here so that resources, abilities, and other
 * systems can react without tight coupling.
 */

export type GameEventType =
    | 'damage_taken'
    | 'round_start'
    | 'turn_start'
    | 'turn_end'
    | 'round_end'
    | 'unit_died'
    | 'unit_enraged'
    | 'ability_used'
    | 'projectile_hit'
    | 'terrain_stone_damaged'
    | 'nearby_stone_damaged'
    | 'recovery_charge_granted'
    | 'stack_members_died'
    | 'boss_exposed_cc_suppressed'
    | 'ability_bar_changed'
    | 'control_assigned'
    | 'control_released'
    | 'forced_movement_unit_collision'
    | 'forced_movement_terrain_collision'
    | 'unit_slam_landed';

export interface DamageTakenEvent {
    unitId: string;
    amount: number;
    sourceUnitId: string | null;
    /** Incoming damage value before armour absorption. */
    incomingDamage?: number;
    /** HP damage applied after armour absorption. */
    hpDamage?: number;
    /** Armour removed by this damage instance. */
    armourRemoved?: number;
    /** Shield-buff hp absorbed by this damage instance (consumed before armour). */
    shieldAbsorbed?: number;
}

export interface TurnStartEvent {
    unitId: string;
}

export interface RoundStartEvent {
    roundNumber: number;
    /** Stamina charges granted per eligible ability at round start (= floor(unit.stamina)). */
    staminaSurgeAmount?: number;
    /** Number of player abilities that will receive roundCharge at round start. */
    roundChargeCount?: number;
    /** Ability ids that will receive roundCharge (computed before recovery is applied). */
    roundChargeAbilityIds?: string[];
    /** Ability ids that will receive stamina surge (computed before recovery is applied). */
    staminaSurgeAbilityIds?: string[];
}

export interface TurnEndEvent {
    /** @deprecated Prefer {@link unitIds} for parallel batches; still set for AI-only emit paths. */
    unitId?: string;
    /** All units whose parallel order batch ended (single bus emit per batch). */
    unitIds?: string[];
}

export interface RoundEndEvent {
    roundNumber: number;
}

export interface UnitDiedEvent {
    unitId: string;
    killerUnitId: string | null;
}

export interface UnitEnragedEvent {
    unitId: string;
    tag: string;
}

export interface AbilityUsedEvent {
    unitId: string;
    abilityId: string;
}

export interface ProjectileHitEvent {
    projectileId: string;
    targetUnitId: string;
    damage: number;
}

export interface NearbyStoneDamagedEvent {
    /** Unit who is within Earth Core nearby-stone range. */
    unitId: string;
    /** Unit that caused the stone damage, if known. */
    sourceUnitId: string | null;
    /** True when the source is self/ally for unitId. */
    causedBySelfOrAlly: boolean;
    /** Optional world/grid context for future consumers. */
    col?: number;
    row?: number;
}

export interface TerrainStoneDamagedEvent {
    col: number;
    row: number;
    worldX: number;
    worldY: number;
    previousHealth: number;
    health: number;
    maxHealth: number;
    previousTerrainType: TerrainType;
    terrainType: TerrainType;
    tier?: number;
    sourceUnitId?: string | null;
}

export interface RecoveryChargeGrantedEvent {
    /** Unit that received the charge(s). */
    unitId: string;
    /** Charge type granted (string to avoid cross-layer import). */
    chargeType: string;
    /** Number of charge units distributed. */
    amount: number;
    /** The specific ability that received the charge, if known. */
    abilityId?: string;
}

export interface StackMembersDiedEvent {
    unitId: string;
    /** Number of stack members that died in this damage application. */
    count: number;
}

export interface BossExposedCcSuppressedEvent {
    /** The exposed unit that absorbed the CC attempt. */
    unitId: string;
}

export interface AbilityBarChangedEvent {
    unitId: string;
}

/** Fired when a unit is assigned to or released from player NPC control. */
export interface ControlChangedEvent {
    unitId: string;
    playerId: string | null;
    groupId: string | null;
}

export interface ForcedMovementUnitCollisionEvent {
    movingUnitId: string;
    struckUnitId: string;
    impact: { x: number; y: number };
    source: KnockbackSource;
}

export interface ForcedMovementTerrainCollisionEvent {
    unitId: string;
    impact: { x: number; y: number };
    tile: { col: number; row: number };
    source: KnockbackSource;
}

export interface UnitSlamLandedEvent {
    unitId: string;
    position: { x: number; y: number };
    sourceAbilityId: string;
}

export type GameEventDataMap = {
    damage_taken: DamageTakenEvent;
    round_start: RoundStartEvent;
    turn_start: TurnStartEvent;
    turn_end: TurnEndEvent;
    round_end: RoundEndEvent;
    unit_died: UnitDiedEvent;
    unit_enraged: UnitEnragedEvent;
    ability_used: AbilityUsedEvent;
    projectile_hit: ProjectileHitEvent;
    terrain_stone_damaged: TerrainStoneDamagedEvent;
    nearby_stone_damaged: NearbyStoneDamagedEvent;
    recovery_charge_granted: RecoveryChargeGrantedEvent;
    stack_members_died: StackMembersDiedEvent;
    boss_exposed_cc_suppressed: BossExposedCcSuppressedEvent;
    ability_bar_changed: AbilityBarChangedEvent;
    control_assigned: ControlChangedEvent;
    control_released: ControlChangedEvent;
    forced_movement_unit_collision: ForcedMovementUnitCollisionEvent;
    forced_movement_terrain_collision: ForcedMovementTerrainCollisionEvent;
    unit_slam_landed: UnitSlamLandedEvent;
};

type EventCallback<T extends GameEventType> = (data: GameEventDataMap[T]) => void;

export class EventBus {
    private listeners: Map<GameEventType, Set<EventCallback<GameEventType>>> = new Map();

    on<T extends GameEventType>(event: T, callback: EventCallback<T>): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback as EventCallback<GameEventType>);
    }

    off<T extends GameEventType>(event: T, callback: EventCallback<T>): void {
        const set = this.listeners.get(event);
        if (set) {
            set.delete(callback as EventCallback<GameEventType>);
            if (set.size === 0) {
                this.listeners.delete(event);
            }
        }
    }

    emit<T extends GameEventType>(event: T, data: GameEventDataMap[T]): void {
        const set = this.listeners.get(event);
        if (set) {
            for (const callback of set) {
                callback(data);
            }
        }
    }

    /** Remove all listeners. Used during teardown. */
    clear(): void {
        this.listeners.clear();
    }
}

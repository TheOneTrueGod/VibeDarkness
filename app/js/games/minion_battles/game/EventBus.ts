import type { TerrainType } from '../terrain/TerrainType';
import type { KnockbackSource } from './units/unitTypes';
import type { ClearedTerrainEffect } from './TerrainLayerManager';

/**
 * EventBus - Typed pub/sub event system for the battle engine.
 *
 * Game events flow through here so that resources, abilities, and other
 * systems can react without tight coupling.
 */

export type GameEventType =
    | 'damage_taken'
    | 'damage_redirected'
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
    | 'unit_slam_landed'
    | 'daylight_damage_pulse'
    | 'terrain_effects_cleared'
    | 'cast_ended_early'
    | 'time_stop_started'
    | 'time_stop_ended'
    | 'world_pace_changed';

/** Optional combat VFX hint — does not change damage rules. */
export const DAMAGE_VISUAL_KIND_DAYLIGHT = 'daylight' as const;
export type DamageVisualKind = typeof DAMAGE_VISUAL_KIND_DAYLIGHT;

export interface DamageApplyOptions {
    visualKind?: DamageVisualKind;
    /**
     * What this hit does if the target is frozen (tempo 0). A Time Stop def's own policy wins over this;
     * this wins over the engine default (`DEFAULT_FROZEN_HIT_POLICY`). See `game/time/AGENTS.md`.
     */
    frozenHitPolicy?: import('./time/timeConstants').FrozenHitPolicy;
    /**
     * Fraction (0-1) of this hit that shield buffs may absorb; the rest bypasses shields and
     * continues to armour/HP. Default 1 (shields absorb everything they can).
     */
    shieldShare?: number;
    /** When true, damage links (`DamageLinkBuff`) on the target do not redirect this hit. Set on redirected hits so links never chain. */
    skipDamageLinks?: boolean;
}

/**
 * Fired by the damage pipeline when a `DamageLinkBuff` moves part of a unit's HP loss onto the
 * linked unit. Handled synchronously by `registerDamageLinkListeners`, which applies the damage.
 */
export interface DamageRedirectedEvent {
    /** Unit whose HP loss was reduced. */
    fromUnitId: string;
    /** Unit that takes the redirected amount. */
    toUnitId: string;
    amount: number;
    /** `shieldShare` for the redirected hit on `toUnitId`. */
    shieldShare: number;
    /** Original attacker, kept so kill credit and reactions stay correct. */
    sourceUnitId: string | null;
    visualKind?: DamageVisualKind;
    /**
     * Set to true by the listener that applied the redirect. When nobody handles it (no listener,
     * or the linked unit is gone) the original unit keeps the share.
     */
    handled: boolean;
}

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
    /** Renderer-only hint (e.g. DayLight gold numbers). */
    visualKind?: DamageVisualKind;
}

/** Fired once per DayLight DoT pulse that damaged at least one unit. Not serialized. */
export type DayLightDamagePulseEvent = Record<string, never>;

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

/** Fired when terrain clearing (scour / gust / blast) removed ground/air effects from cells. */
export interface TerrainEffectsClearedEvent {
    cleared: ClearedTerrainEffect[];
    source?: { unitId?: string; abilityId?: string };
}

/**
 * The single "cast ended early" hook for UI, logs and interactive targeting (ITS). Emitted by the
 * interrupt pipeline (`interruptUnitAbilities`) and by `fizzleUnitActiveAbility` for every cast that
 * is removed or snapped to cooldown before it finished. Not emitted for a cast kept under
 * `duringCooldown: 'ignore'`, for natural completion, or for a same-id recast.
 */
export interface CastEndedEarlyEvent {
    unitId: string;
    abilityId: string;
    /** `ActiveAbility.startTime` of the cast that ended (identifies the cast instance). */
    castStartTime: number;
    reason: 'interrupted' | 'fizzled';
    /** What happened to the cast: removed (`cancelled`), snapped to cooldown, or a cooldown-phase cast ended. */
    outcome: 'cancelled' | 'skippedToCooldown' | 'ended';
    /** Derived from unit state at emit time (knockback source while in knockback); omitted otherwise. */
    source?: KnockbackSource;
    gameTick: number;
}

/** A Time Stop began (`engine.startTimeStop`). For VFX/UI. */
export interface TimeStopStartedEvent {
    id: string;
    sourceActorId: string | null;
    durationTicks: number;
    exemptActorIds: string[];
    exemptRate: number;
    gameTick: number;
}

/** A Time Stop ended: it ran its tick-time duration (`expired`) or was ended early (`ended`). */
export interface TimeStopEndedEvent {
    id: string;
    sourceActorId: string | null;
    reason: 'expired' | 'ended';
    gameTick: number;
}

/** World pace changed value at a tick boundary (focal dilation start/stop, Time Stop start/stop). */
export interface WorldPaceChangedEvent {
    previousPace: number;
    worldPace: number;
    gameTick: number;
}

export type GameEventDataMap = {
    damage_taken: DamageTakenEvent;
    damage_redirected: DamageRedirectedEvent;
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
    daylight_damage_pulse: DayLightDamagePulseEvent;
    terrain_effects_cleared: TerrainEffectsClearedEvent;
    cast_ended_early: CastEndedEarlyEvent;
    time_stop_started: TimeStopStartedEvent;
    time_stop_ended: TimeStopEndedEvent;
    world_pace_changed: WorldPaceChangedEvent;
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

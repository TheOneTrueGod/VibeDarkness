/**
 * EventBus - Typed pub/sub event system for the battle engine.
 *
 * Game events flow through here so that resources, abilities, and other
 * systems can react without tight coupling.
 */

export type GameEventType =
    | 'damage_taken'
    | 'turn_start'
    | 'turn_end'
    | 'round_end'
    | 'unit_died'
    | 'ability_used'
    | 'projectile_hit';

export interface DamageTakenEvent {
    unitId: string;
    amount: number;
    sourceUnitId: string | null;
}

export interface TurnStartEvent {
    unitId: string;
}

export interface TurnEndEvent {
    unitId: string;
}

export interface RoundEndEvent {
    roundNumber: number;
}

export interface UnitDiedEvent {
    unitId: string;
    killerUnitId: string | null;
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

export type GameEventDataMap = {
    damage_taken: DamageTakenEvent;
    turn_start: TurnStartEvent;
    turn_end: TurnEndEvent;
    round_end: RoundEndEvent;
    unit_died: UnitDiedEvent;
    ability_used: AbilityUsedEvent;
    projectile_hit: ProjectileHitEvent;
};

type EventCallback<T extends GameEventType> = (data: GameEventDataMap[T]) => void;

interface ListenerEntry {
    event: GameEventType;
    callback: EventCallback<GameEventType>;
}

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

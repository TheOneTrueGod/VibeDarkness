/**
 * Resource - Base class for unit resources (Rage, Mana, etc.).
 *
 * Resources are event-driven: they subscribe to game events via the
 * EventBus and modify their values accordingly. This keeps resource
 * logic decoupled from the Unit class.
 */

import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';

/** Minimal shape needed to render a resource bar. The full Resource class satisfies this. */
export interface ResourceDisplay {
    id: string;
    name: string;
    color: string;
    iconName: string;
    current: number;
    max: number;
}

export abstract class Resource {
    /** Unique resource type ID (e.g. 'rage', 'mana'). */
    abstract readonly id: string;
    /** Display name. */
    abstract readonly name: string;
    /** CSS color for UI rendering. */
    abstract readonly color: string;
    /** Lucide icon name for UI display. Swap-point for future SVG/PNG migration. */
    abstract readonly iconName: string;

    /** Current value. */
    current: number;
    /** Maximum value. */
    max: number;

    /** The unit this resource is attached to. Set by attach(). */
    protected unitId: string | null = null;

    constructor(initial: number, max: number) {
        this.current = initial;
        this.max = max;
    }

    /** Add an amount, clamped to [0, max]. */
    add(amount: number): void {
        this.current = Math.min(this.max, this.current + amount);
    }

    /** Spend an amount. Returns false if insufficient. */
    spend(amount: number): boolean {
        if (this.current < amount) return false;
        this.current -= amount;
        return true;
    }

    /** Whether the unit can afford the given cost. */
    canAfford(amount: number): boolean {
        return this.current >= amount;
    }

    /**
     * Attach this resource to a unit and subscribe to events.
     * Subclasses override to add their specific event listeners.
     */
    attach(unit: Unit, eventBus: EventBus): void {
        this.unitId = unit.id;
        this.subscribe(unit, eventBus);
    }

    /**
     * Detach from the event bus. Subclasses override to remove listeners.
     */
    detach(eventBus: EventBus): void {
        this.unsubscribe(eventBus);
        this.unitId = null;
    }

    /** Called each round; override for engine-context-dependent recovery (e.g. tile-based gain). */
    onRoundStart?(unit: Unit, engine: EngineContext): void;

    /** Subclasses add their event subscriptions here. */
    protected abstract subscribe(unit: Unit, eventBus: EventBus): void;

    /** Subclasses remove their event subscriptions here. */
    protected abstract unsubscribe(eventBus: EventBus): void;

    toJSON(): Record<string, unknown> {
        return {
            id: this.id,
            current: this.current,
            max: this.max,
        };
    }

    /** Restore values from serialized data. */
    restoreFromJSON(data: Record<string, unknown>): void {
        this.current = data.current as number;
        this.max = data.max as number;
    }
}

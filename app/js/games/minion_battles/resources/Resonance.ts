/**
 * Resonance - Earth Core resource.
 *
 * Starts at 0, max 100. Gains at round start and when nearby stone damage is
 * caused by self/allies.
 */

import { Resource } from './Resource';
import type { EventBus, RoundStartEvent, NearbyStoneDamagedEvent } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import {
    EARTH_CORE_RESONANCE_GAIN_ROUND_START,
    EARTH_CORE_RESONANCE_GAIN_STONE_DAMAGED_NEARBY,
    EARTH_CORE_RESONANCE_MAX,
} from '../constants/earthCoreConstants';

export class Resonance extends Resource {
    readonly id = 'resonance';
    readonly name = 'Resonance';
    readonly color = '#84cc16'; // lime-500

    private boundOnRoundStart: ((data: RoundStartEvent) => void) | null = null;
    private boundOnNearbyStoneDamaged: ((data: NearbyStoneDamagedEvent) => void) | null = null;

    constructor() {
        super(0, EARTH_CORE_RESONANCE_MAX);
    }

    protected subscribe(unit: Unit, eventBus: EventBus): void {
        this.boundOnRoundStart = (data: RoundStartEvent) => {
            if (data.roundNumber >= 1 && this.unitId === unit.id) {
                this.add(EARTH_CORE_RESONANCE_GAIN_ROUND_START);
            }
        };
        eventBus.on('round_start', this.boundOnRoundStart);

        this.boundOnNearbyStoneDamaged = (data: NearbyStoneDamagedEvent) => {
            if (data.unitId !== this.unitId) return;
            if (!data.causedBySelfOrAlly) return;
            this.add(EARTH_CORE_RESONANCE_GAIN_STONE_DAMAGED_NEARBY);
        };
        eventBus.on('nearby_stone_damaged', this.boundOnNearbyStoneDamaged);
    }

    protected unsubscribe(eventBus: EventBus): void {
        if (this.boundOnRoundStart) {
            eventBus.off('round_start', this.boundOnRoundStart);
            this.boundOnRoundStart = null;
        }
        if (this.boundOnNearbyStoneDamaged) {
            eventBus.off('nearby_stone_damaged', this.boundOnNearbyStoneDamaged);
            this.boundOnNearbyStoneDamaged = null;
        }
    }
}

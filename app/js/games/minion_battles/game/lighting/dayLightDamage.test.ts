import { describe, expect, it, vi } from 'vitest';
import {
    DAYLIGHT_DAMAGE_DOT_STRIDE,
    DAYLIGHT_DAMAGE_PER_INTENSITY,
    tickDayLightDamage,
} from './dayLightDamage';
import type { Unit } from '../units/Unit';
import type { EngineContext } from '../EngineContext';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { DAMAGE_VISUAL_KIND_DAYLIGHT } from '../EventBus';

function mockUnit(overrides: Partial<Unit> & { characterId: string }): Unit {
    return {
        isAlive: () => true,
        takeDamage: vi.fn(),
        x: CELL_SIZE / 2,
        y: CELL_SIZE / 2,
        ...overrides,
    } as unknown as Unit;
}

function mockEngine(intensity: number) {
    return {
        eventBus: { emit: vi.fn() },
        getLightIntensity: vi.fn().mockReturnValue(intensity),
    } as unknown as EngineContext;
}

const DAYLIGHT_DAMAGE_OPTS = { visualKind: DAMAGE_VISUAL_KIND_DAYLIGHT };

describe('tickDayLightDamage', () => {
    it('damages dark creatures by 2× DayLight intensity on even DOT milestones', () => {
        const unit = mockUnit({ characterId: 'dark_wolf' });
        const engine = mockEngine(3);

        tickDayLightDamage([unit], engine, 0);
        expect(unit.takeDamage).toHaveBeenCalledWith(
            DAYLIGHT_DAMAGE_PER_INTENSITY * 3,
            null,
            engine.eventBus,
            DAYLIGHT_DAMAGE_OPTS,
        );
        expect(engine.eventBus.emit).toHaveBeenCalledWith('daylight_damage_pulse', {});
    });

    it('skips odd DOT milestones when stride is 2', () => {
        expect(DAYLIGHT_DAMAGE_DOT_STRIDE).toBe(2);
        const unit = mockUnit({ characterId: 'dark_wolf' });
        const engine = mockEngine(3);

        tickDayLightDamage([unit], engine, 1);
        expect(unit.takeDamage).not.toHaveBeenCalled();
        expect(engine.eventBus.emit).not.toHaveBeenCalled();
    });

    it('does not damage non-dark creatures', () => {
        const unit = mockUnit({ characterId: 'player' });
        const engine = mockEngine(5);

        tickDayLightDamage([unit], engine, 0);
        expect(unit.takeDamage).not.toHaveBeenCalled();
        expect(engine.eventBus.emit).not.toHaveBeenCalled();
    });

    it('skips when DayLight intensity is zero', () => {
        const unit = mockUnit({ characterId: 'dark_wolf' });
        const engine = mockEngine(0);

        tickDayLightDamage([unit], engine, 0);
        expect(unit.takeDamage).not.toHaveBeenCalled();
        expect(engine.eventBus.emit).not.toHaveBeenCalled();
    });

    it('floors fractional DayLight damage', () => {
        const unit = mockUnit({ characterId: 'dark_wolf' });
        const engine = mockEngine(1.4);

        tickDayLightDamage([unit], engine, 0);
        expect(unit.takeDamage).toHaveBeenCalledWith(
            Math.floor(DAYLIGHT_DAMAGE_PER_INTENSITY * 1.4),
            null,
            engine.eventBus,
            DAYLIGHT_DAMAGE_OPTS,
        );
    });
});

import { describe, expect, it, vi } from 'vitest';
import {
    DAYLIGHT_DAMAGE_DOT_STRIDE,
    DAYLIGHT_DAMAGE_PER_INTENSITY,
    tickDayLightDamage,
} from './dayLightDamage';
import type { Unit } from '../units/Unit';
import type { EngineContext } from '../EngineContext';
import { CELL_SIZE } from '../../terrain/TerrainGrid';

function mockUnit(overrides: Partial<Unit> & { characterId: string }): Unit {
    return {
        isAlive: () => true,
        takeDamage: vi.fn(),
        x: CELL_SIZE / 2,
        y: CELL_SIZE / 2,
        ...overrides,
    } as unknown as Unit;
}

describe('tickDayLightDamage', () => {
    it('damages dark creatures by 2× DayLight intensity on even DOT milestones', () => {
        const unit = mockUnit({ characterId: 'dark_wolf' });
        const engine = {
            eventBus: {},
            getLightIntensity: vi.fn().mockReturnValue(3),
        } as unknown as EngineContext;

        tickDayLightDamage([unit], engine, 0);
        expect(unit.takeDamage).toHaveBeenCalledWith(
            DAYLIGHT_DAMAGE_PER_INTENSITY * 3,
            null,
            engine.eventBus,
        );
    });

    it('skips odd DOT milestones when stride is 2', () => {
        expect(DAYLIGHT_DAMAGE_DOT_STRIDE).toBe(2);
        const unit = mockUnit({ characterId: 'dark_wolf' });
        const engine = {
            eventBus: {},
            getLightIntensity: vi.fn().mockReturnValue(3),
        } as unknown as EngineContext;

        tickDayLightDamage([unit], engine, 1);
        expect(unit.takeDamage).not.toHaveBeenCalled();
    });

    it('does not damage non-dark creatures', () => {
        const unit = mockUnit({ characterId: 'player' });
        const engine = {
            eventBus: {},
            getLightIntensity: vi.fn().mockReturnValue(5),
        } as unknown as EngineContext;

        tickDayLightDamage([unit], engine, 0);
        expect(unit.takeDamage).not.toHaveBeenCalled();
    });

    it('skips when DayLight intensity is zero', () => {
        const unit = mockUnit({ characterId: 'dark_wolf' });
        const engine = {
            eventBus: {},
            getLightIntensity: vi.fn().mockReturnValue(0),
        } as unknown as EngineContext;

        tickDayLightDamage([unit], engine, 0);
        expect(unit.takeDamage).not.toHaveBeenCalled();
    });
});

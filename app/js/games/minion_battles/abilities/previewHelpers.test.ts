import { describe, expect, it, vi } from 'vitest';
import {
    resolveTerrainAwareMovementDisplacement,
    createPetSourcedMovementPreview,
    drawTerrainAwareMovementLine,
} from './previewHelpers';
import type { IAbilityPreviewGraphics } from './Ability';
import type { Unit } from '../game/units/Unit';

describe('resolveTerrainAwareMovementDisplacement', () => {
    it('moves up to maxDistance on open terrain', () => {
        const result = resolveTerrainAwareMovementDisplacement(0, 0, 200, 0, 120);
        expect(result.distance).toBe(120);
        expect(result.dx).toBe(120);
        expect(result.dy).toBe(0);
    });

    it('stops at impassable terrain before maxDistance', () => {
        const terrainManager = {
            isPassable: (x: number, _y: number) => x < 80,
        };
        const gameState = { terrainManager };
        const result = resolveTerrainAwareMovementDisplacement(0, 0, 200, 0, 120, gameState, 4);
        // Last safe step at x=76 (d=76, next probe at 80 is blocked).
        expect(result.distance).toBeLessThan(120);
        expect(result.distance).toBeGreaterThanOrEqual(72);
        expect(result.dx).toBe(result.distance);
    });

    it('matches straight-line clamp when no terrain manager is present', () => {
        const toward = { x: 50, y: 50 };
        const dist = Math.hypot(toward.x, toward.y);
        const max = 30;
        const result = resolveTerrainAwareMovementDisplacement(0, 0, toward.x, toward.y, max);
        expect(result.distance).toBe(max);
        expect(result.dx / result.distance).toBeCloseTo(toward.x / dist, 5);
        expect(result.dy / result.distance).toBeCloseTo(toward.y / dist, 5);
    });
});

describe('createPetSourcedMovementPreview', () => {
    it('draws from the nearest pet, not the caster', () => {
        const strokes: unknown[] = [];
        const gr = {
            clear: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            circle: vi.fn(),
            stroke: vi.fn((style: unknown) => { strokes.push(style); }),
        } as unknown as IAbilityPreviewGraphics;

        const caster = { id: 'player1', x: 0, y: 0, teamId: 'player', ownerId: 'p1' } as Unit;
        const nearPet = {
            id: 'dog1',
            x: 10,
            y: 0,
            teamId: 'player',
            ownerId: 'p1',
            petState: { ownerUnitId: 'player1' },
            radius: 12,
            isAlive: () => true,
        } as Unit;
        const farPet = {
            id: 'dog2',
            x: 10,
            y: 200,
            teamId: 'player',
            ownerId: 'p1',
            petState: { ownerUnitId: 'player1' },
            radius: 12,
            isAlive: () => true,
        } as Unit;

        const preview = createPetSourcedMovementPreview(
            { abilitySource: { type: 'pet', selector: 'nearest' } },
            { maxDistance: 120, collisionStep: 4 },
        );
        preview(gr, caster, [], { x: 200, y: 0 }, [nearPet, farPet]);

        expect(gr.moveTo).toHaveBeenCalledWith(10, 0);
        expect(gr.lineTo).toHaveBeenCalledWith(130, 0);
    });

    it('draws fizzle when no living pets', () => {
        const gr = {
            clear: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            circle: vi.fn(),
            stroke: vi.fn(),
        } as unknown as IAbilityPreviewGraphics;

        const caster = { x: 5, y: 5, teamId: 'player', ownerId: 'p1' } as Unit;
        const preview = createPetSourcedMovementPreview(
            { abilitySource: { type: 'pet', selector: 'nearest' } },
            { maxDistance: 120 },
        );
        preview(gr, caster, [], { x: 50, y: 50 }, []);

        expect(gr.moveTo).toHaveBeenCalledWith(-3, -3);
        expect(gr.lineTo).toHaveBeenCalledWith(13, 13);
    });
});

describe('drawTerrainAwareMovementLine', () => {
    it('returns endpoint coordinates', () => {
        const gr = {
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            circle: vi.fn(),
        } as unknown as IAbilityPreviewGraphics;

        const result = drawTerrainAwareMovementLine(gr, 0, 0, 100, 0, 40);
        expect(result.endX).toBe(40);
        expect(result.endY).toBe(0);
        expect(result.distance).toBe(40);
    });
});

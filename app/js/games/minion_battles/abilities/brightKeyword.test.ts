import { describe, expect, it } from 'vitest';
import { resetGameObjectIdCounter } from '../game/GameObject';
import { buildTinyBattleEngine, TINY_BATTLE_PLAYER_ID } from '../testing/harness/buildTinyBattleEngine';
import { BRIGHT_DEFS, spawnBrightLight } from './brightKeyword';

const BRIGHT_RADIUS = 2;
const EXPECTED_BRIGHTNESS: Record<number, number> = { 1: 2, 2: 3, 3: 4 };

describe('Bright light levels', () => {
    it.each([[1, 2], [2, 3], [3, 4]])('Bright %i has brightness %i at radius 2', (magnitude, brightness) => {
        expect(BRIGHT_DEFS[magnitude]).toEqual({ lightAmount: brightness, radius: BRIGHT_RADIUS });
    });

    it.each([1, 2, 3])('Bright %i loses 1 brightness per round end (cast round included), keeps radius, then vanishes', (magnitude) => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({
            gridW: 8,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        spawnBrightLight(engine, 100, 100, magnitude);
        const light = engine.lightSources[engine.lightSources.length - 1]!;
        const initial = EXPECTED_BRIGHTNESS[magnitude]!;
        expect(light.lightAmount).toBe(initial);
        expect(light.radius).toBe(BRIGHT_RADIUS);

        // The first drop is at the end of the round the light was created in.
        for (let roundEnds = 1; roundEnds <= initial; roundEnds++) {
            engine.state.lightSourceManager.handleRoundEnd(engine.roundNumber + roundEnds - 1);
            expect(light.lightAmount).toBe(initial - roundEnds);
            expect(light.radius).toBe(BRIGHT_RADIUS);
            expect(light.active).toBe(roundEnds < initial);
        }

        // Round ends no longer apply the timed fade.
        engine.state.lightSourceManager.processDecays();
        expect(light.active).toBe(false);
        engine.destroy();
    });
});

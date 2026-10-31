import { describe, expect, it } from 'vitest';
import '../../abilities/AbilityRegistry';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { resolvePlayerBodyColor } from '../units/unit_defs/unitDef';
import { turretHullColor } from './turretDeployDraw';

const PLAYER_CELL = 5;
/** Portrait whose body color differs from the default player token. */
const RANGER_PORTRAIT_ID = 'ranger';

describe('turretHullColor', () => {
    it('matches the owner token color', () => {
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 12,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
        });
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            portraitId: RANGER_PORTRAIT_ID,
            x: PLAYER_CELL * CELL_SIZE,
            y: PLAYER_CELL * CELL_SIZE,
            abilities: [],
        });

        expect(turretHullColor(player)).toBe(resolvePlayerBodyColor(RANGER_PORTRAIT_ID));
        expect(turretHullColor(player)).not.toBe(resolvePlayerBodyColor(undefined));
        expect(turretHullColor(undefined)).toBe(resolvePlayerBodyColor(undefined));
        engine.destroy();
    });
});

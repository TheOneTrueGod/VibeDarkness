/**
 * Visibility E2E scenario — visibility_senses_tiers.
 *
 * One map exercises every perception tier at once (see `game/visibility/AGENTS.md`). Global light is 0.
 * The player (PLAYER_SENSES + a TREMORSENSE_GRANT instance grant) stands in a lantern pool, with a rock
 * pillar beside the lantern and a rock wall line just below the player:
 *
 *   col: 0 1 2 3 4 5 6 7 8 9 . . . 14 15
 *   r0   . . . . . . . . . . . . . .  .
 *   r1   . . L # D . . . . . . . . .  .      L = lantern, # = rock, D = seen (1 tile into dark)
 *   r2   . . . . . . . . . . . . . F  .      F = far lit patch (second light source)
 *   r3   . . P . S . . . . . . . . G  .      P = player, S = seen (lit), G = glimpsed (12 tiles, lit, clear line)
 *   r4   # # # # # # # . . . . . . .  .      wall line (the tile below P must be in visibleTiles)
 *   r6   . . E . . . . . . . . . . .  .      E = heard (3 tiles, behind the wall)
 *   r8   . . T . . . . . . . . . . H  .      T = felt (5 tiles, behind the wall); H = hidden (dark, 13 tiles)
 *
 * The pillar shades the tile right of it from the lantern (walls block light), so `D` stands in full
 * darkness while the player's line to it crosses one lit tile: darkness cost 1 ≤ penetration 2 → seen.
 */

import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import { TerrainType } from '../../../terrain/TerrainType';
import { LightSource } from '../../../game/lightSources/LightSource';
import { DarknessLevel } from '../../../game/darknessLevels';
import {
    buildTinyBattleEngine,
    placeTargetDummy,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { computeTeamPerception, type TeamPerception } from '../../../game/visibility/teamPerception';
import { TREMORSENSE_GRANT, type Detection } from '../../../game/visibility/senses';

const CELL = 40;
const GRID_W = 16;
const GRID_H = 10;

const PLAYER = { col: 2, row: 3 };
const LANTERN = { col: 2, row: 1, emission: 5, radius: 3 };
const FAR_PATCH = { col: 13, row: 2, emission: 3, radius: 1 };
const PILLAR = { col: 3, row: 1 };
const WALL_ROW = 4;
const WALL_COLS = { from: 0, to: 6 };
/** The wall tile directly below the player: its face must be in the team's vision. */
const WALL_NEXT_TO_PLAYER = { col: PLAYER.col, row: WALL_ROW };

interface ExpectedDummy {
    id: string;
    col: number;
    row: number;
    detection: Detection;
}

const DUMMIES: readonly ExpectedDummy[] = [
    { id: 'vis_seen_lit', col: 4, row: 3, detection: 'seen' },
    { id: 'vis_seen_dark', col: 4, row: 1, detection: 'seen' },
    { id: 'vis_glimpsed', col: 13, row: 3, detection: 'glimpsed' },
    { id: 'vis_heard', col: 2, row: 6, detection: 'heard' },
    { id: 'vis_felt', col: 2, row: 8, detection: 'felt' },
    { id: 'vis_hidden', col: 13, row: 8, detection: 'hidden' },
];

function worldCenter(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

function steadyLight(col: number, row: number, emission: number, radius: number): LightSource {
    const pos = worldCenter(col, row);
    return new LightSource({
        x: pos.x,
        y: pos.y,
        lightAmount: emission,
        radius,
        decay: { roundCreated: 0, initialLightAmount: emission, initialRadius: radius, roundsTotal: 9999, noDecay: true },
    });
}

function perception(engine: GameEngine): TeamPerception {
    return computeTeamPerception(engine, 'player');
}

function isWallNextToPlayerVisible(p: TeamPerception): boolean {
    return p.visibleTiles[WALL_NEXT_TO_PLAYER.row * p.width + WALL_NEXT_TO_PLAYER.col] === 1;
}

function mismatches(engine: GameEngine): string[] {
    const p = perception(engine);
    const out: string[] = [];
    for (const d of DUMMIES) {
        const got = p.detections.get(d.id);
        if (got !== d.detection) out.push(`${d.id}: expected ${d.detection}, got ${got ?? 'missing'}`);
    }
    if (!isWallNextToPlayerVisible(p)) out.push('wall tile below the player is not in visibleTiles');
    return out;
}

export const visibilitySensesTiersScenario: ScenarioDefinition = {
    id: 'visibility_senses_tiers',
    title: 'Visibility: seen, glimpsed, heard, felt and hidden enemies',
    category: 'general',
    generalSection: 'Visibility',
    renderLighting: true,
    maxDurationMs: 2000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: GRID_W, gridH: GRID_H, localPlayerId: TINY_BATTLE_PLAYER_ID });
        const tm = engine.terrainManager!;
        tm.grid.set(PILLAR.col, PILLAR.row, TerrainType.Rock);
        for (let col = WALL_COLS.from; col <= WALL_COLS.to; col++) tm.grid.set(col, WALL_ROW, TerrainType.Rock);

        const playerPos = worldCenter(PLAYER.col, PLAYER.row);
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerPos.x,
            y: playerPos.y,
            abilities: [],
        });
        player.addSenseGrant(TREMORSENSE_GRANT);

        for (const d of DUMMIES) placeTargetDummy(engine, worldCenter(d.col, d.row), d.id);

        engine.addLightSource(steadyLight(LANTERN.col, LANTERN.row, LANTERN.emission, LANTERN.radius));
        engine.addLightSource(steadyLight(FAR_PATCH.col, FAR_PATCH.row, FAR_PATCH.emission, FAR_PATCH.radius));
        engine.setMissionLightConfig(true, DarknessLevel.FULL_DARKNESS);
        engine.applyInstantLightingPass();
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.units.find((u) => u.ownerId === TINY_BATTLE_PLAYER_ID);
        return player ? [{ unitId: player.id, abilityId: 'wait', targets: [] }] : [];
    },

    assertPass(engine) {
        return mismatches(engine).length === 0;
    },

    failureMessage(engine) {
        return mismatches(engine).join('; ');
    },

    describeState(engine) {
        const p = perception(engine);
        return DUMMIES.map((d) => {
            const pos = worldCenter(d.col, d.row);
            return `${d.id}=${p.detections.get(d.id) ?? '?'} (light ${engine.getLightLevelAt(pos.x, pos.y)})`;
        }).join(', ');
    },
};

export const VISIBILITY_SCENARIOS: ScenarioDefinition[] = [visibilitySensesTiersScenario];

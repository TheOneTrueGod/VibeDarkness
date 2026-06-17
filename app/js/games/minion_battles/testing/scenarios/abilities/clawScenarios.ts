import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { CLAW_MAX_DISTANCE } from '../../../card_defs/0111_Claw/0111Ability';

const P = TINY_BATTLE_PLAYER_ID;

const START_X = 200;
const START_Y = 200;
// Target well beyond max range to guarantee the caster travels the full CLAW_MAX_DISTANCE.
const TARGET_X = START_X + 200;
const TARGET_Y = START_Y;
const EXPECTED_X = START_X + CLAW_MAX_DISTANCE;

export const clawMovementDistanceScenario: ScenarioDefinition = {
    id: 'claw_movement_distance',
    title: 'Claw (0111): caster moves full CLAW_MAX_DISTANCE on open terrain',
    category: 'ability',
    maxDurationMs: 3000,
    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 18,
            gridH: 14,
            localPlayerId: P,
            grass: true,
        });
        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: START_X,
            y: START_Y,
            abilities: ['0111'],
        });
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        return [{ unitId: u.id, abilityId: '0111', targets: [{ type: 'pixel' as const, position: { x: TARGET_X, y: TARGET_Y } }] }];
    },
    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return false;
        const dist = Math.hypot(player.x - EXPECTED_X, player.y - START_Y);
        return dist <= 5;
    },
    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return 'player unit missing';
        const moved = Math.hypot(player.x - START_X, player.y - START_Y);
        return `player moved ${moved.toFixed(1)} px from start, ended at (${player.x.toFixed(1)}, ${player.y.toFixed(1)}); expected ~${CLAW_MAX_DISTANCE} px toward (${EXPECTED_X}, ${START_Y})`;
    },
};

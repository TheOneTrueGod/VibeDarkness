/**
 * AbilityTest: CrowdSpacing pack separation vs anchors (player + CrowdSpacingAnchor tag).
 */

import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { UnitTag } from '../../../game/units/unitTag';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { CROWD_SPACING_OVERLAP_EPSILON } from '../../../game/crowdSpacing/crowdSpacingConstants';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';

const P = TINY_BATTLE_PLAYER_ID;

/** Centers this far apart still heavily overlap at {@link DEFAULT_UNIT_RADIUS}. */
const PACK_OVERLAP_OFFSET = DEFAULT_UNIT_RADIUS * 0.5;

/** Anchors must stay within this of spawn (should be exact; allow float noise). */
const ANCHOR_STAY_EPSILON = CROWD_SPACING_OVERLAP_EPSILON;

/** Softs must gain at least this much distance from each anchor / each other. */
const MIN_SEPARATION_GAIN = CROWD_SPACING_OVERLAP_EPSILON;

/** Let several one-pass-per-tick resolves run before asserting. */
const MIN_ASSERT_GAME_TIME_SEC = 0.25;

const SOFT_A_ID = 'crowd_soft_a';
const SOFT_B_ID = 'crowd_soft_b';
const SOFT_C_ID = 'crowd_soft_c';
const ANCHOR_ID = 'crowd_tagged_anchor';

/** Pack center near mid-map so softs have room to spread. */
const PACK_CENTER = {
    x: 5 * CELL_SIZE + CELL_SIZE / 2,
    y: 4 * CELL_SIZE + CELL_SIZE / 2,
};

const PLAYER_START = { x: PACK_CENTER.x, y: PACK_CENTER.y };
const SOFT_A_START = { x: PACK_CENTER.x - PACK_OVERLAP_OFFSET, y: PACK_CENTER.y };
const SOFT_B_START = { x: PACK_CENTER.x + PACK_OVERLAP_OFFSET, y: PACK_CENTER.y };
const SOFT_C_START = { x: PACK_CENTER.x, y: PACK_CENTER.y - PACK_OVERLAP_OFFSET };
const ANCHOR_START = { x: PACK_CENTER.x, y: PACK_CENTER.y + PACK_OVERLAP_OFFSET };

const SOFT_STARTS: Record<string, { x: number; y: number }> = {
    [SOFT_A_ID]: SOFT_A_START,
    [SOFT_B_ID]: SOFT_B_START,
    [SOFT_C_ID]: SOFT_C_START,
};

function dist(ax: number, ay: number, bx: number, by: number): number {
    return Math.hypot(ax - bx, ay - by);
}

function near(
    unit: { x: number; y: number } | undefined,
    start: { x: number; y: number },
    epsilon: number,
): boolean {
    if (!unit) return false;
    return dist(unit.x, unit.y, start.x, start.y) <= epsilon;
}

function spawnStaticEnemy(
    engine: GameEngine,
    opts: {
        id: string;
        x: number;
        y: number;
        name: string;
        unitTags?: UnitTag[];
    },
): void {
    const unit = createUnitFromSpawnConfig(
        {
            id: opts.id,
            characterId: 'enemy_melee',
            name: opts.name,
            x: opts.x,
            y: opts.y,
            teamId: 'enemy',
            ownerId: 'ai',
            abilities: [],
            radius: DEFAULT_UNIT_RADIUS,
            unitAITreeId: 'static_test_no_ai',
            unitTags: opts.unitTags,
        },
        engine.eventBus,
        engine,
    );
    initializeAbilityRuntimeForUnit(unit);
    engine.addUnit(unit, 'initialGameSpawn');
}

function softPairSpreadOk(engine: GameEngine): boolean {
    const ids = [SOFT_A_ID, SOFT_B_ID, SOFT_C_ID];
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const a = engine.getUnit(ids[i]!);
            const b = engine.getUnit(ids[j]!);
            if (!a || !b) return false;
            const startA = SOFT_STARTS[ids[i]!]!;
            const startB = SOFT_STARTS[ids[j]!]!;
            const before = dist(startA.x, startA.y, startB.x, startB.y);
            const after = dist(a.x, a.y, b.x, b.y);
            if (after < before + MIN_SEPARATION_GAIN) return false;
        }
    }
    return true;
}

function softsMovedAwayFromAnchors(engine: GameEngine): boolean {
    const player = engine.getLocalPlayerUnit();
    const tagged = engine.getUnit(ANCHOR_ID);
    if (!player || !tagged) return false;

    for (const id of [SOFT_A_ID, SOFT_B_ID, SOFT_C_ID]) {
        const soft = engine.getUnit(id);
        const start = SOFT_STARTS[id]!;
        if (!soft) return false;

        const fromPlayerBefore = dist(start.x, start.y, PLAYER_START.x, PLAYER_START.y);
        const fromPlayerAfter = dist(soft.x, soft.y, player.x, player.y);
        if (fromPlayerAfter < fromPlayerBefore + MIN_SEPARATION_GAIN) return false;

        const fromAnchorBefore = dist(start.x, start.y, ANCHOR_START.x, ANCHOR_START.y);
        const fromAnchorAfter = dist(soft.x, soft.y, tagged.x, tagged.y);
        if (fromAnchorAfter < fromAnchorBefore + MIN_SEPARATION_GAIN) return false;
    }
    return true;
}

/**
 * Overlapping soft enemies separate over ticks; player and CrowdSpacingAnchor stay put;
 * softs yield away from both anchors.
 */
export const crowdSpacingPackAndAnchorsScenario: ScenarioDefinition = {
    id: 'crowd_spacing_pack_and_anchors',
    title: 'CrowdSpacing: soft pack spreads; player + tagged anchors hold',
    category: 'general',
    generalSection: 'Movement',
    maxDurationMs: 3000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 8,
            localPlayerId: P,
            grass: true,
        });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_START.x,
            y: PLAYER_START.y,
            abilities: [],
        });
        player.radius = DEFAULT_UNIT_RADIUS;
        player.unitAITreeId = 'static_test_no_ai';
        player.pathfindingRetriggerOffset = 0;

        spawnStaticEnemy(engine, {
            id: SOFT_A_ID,
            x: SOFT_A_START.x,
            y: SOFT_A_START.y,
            name: 'Soft A',
        });
        spawnStaticEnemy(engine, {
            id: SOFT_B_ID,
            x: SOFT_B_START.x,
            y: SOFT_B_START.y,
            name: 'Soft B',
        });
        spawnStaticEnemy(engine, {
            id: SOFT_C_ID,
            x: SOFT_C_START.x,
            y: SOFT_C_START.y,
            name: 'Soft C',
        });
        spawnStaticEnemy(engine, {
            id: ANCHOR_ID,
            x: ANCHOR_START.x,
            y: ANCHOR_START.y,
            name: 'Spacing Anchor',
            unitTags: [UnitTag.CrowdSpacingAnchor],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        // Wait lockout keeps the runner non-idle while CrowdSpacing resolves.
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        if (engine.gameTime < MIN_ASSERT_GAME_TIME_SEC) return false;
        const player = engine.getLocalPlayerUnit();
        const tagged = engine.getUnit(ANCHOR_ID);
        if (!near(player ?? undefined, PLAYER_START, ANCHOR_STAY_EPSILON)) return false;
        if (!near(tagged ?? undefined, ANCHOR_START, ANCHOR_STAY_EPSILON)) return false;
        if (!softPairSpreadOk(engine)) return false;
        if (!softsMovedAwayFromAnchors(engine)) return false;
        return true;
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const tagged = engine.getUnit(ANCHOR_ID);
        const softs = [SOFT_A_ID, SOFT_B_ID, SOFT_C_ID].map((id) => {
            const u = engine.getUnit(id);
            return u ? `${id}=(${u.x.toFixed(1)},${u.y.toFixed(1)})` : `${id}=missing`;
        });
        return (
            `t=${engine.gameTime.toFixed(2)} ` +
            `player=${player ? `(${player.x.toFixed(1)},${player.y.toFixed(1)})` : 'none'} ` +
            `anchor=${tagged ? `(${tagged.x.toFixed(1)},${tagged.y.toFixed(1)})` : 'none'} ` +
            softs.join(' ')
        );
    },

    describeState(engine) {
        return `tick=${engine.gameTick} t=${engine.gameTime.toFixed(2)}`;
    },
};

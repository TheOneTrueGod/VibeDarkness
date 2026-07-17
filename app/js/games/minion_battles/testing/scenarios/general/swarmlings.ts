/**
 * Swarmling ability-test scenarios.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const REQUIRED_ATTACKS = 4;
const BITE_DAMAGE = 2;

// Player in the centre of a 10 × 8 grid.
const PLAYER_POS = { x: 4 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };  // (180, 140)

// Four swarmlings 120 px away in cardinal directions — outside bite AI range (70 px)
// so each must walk before it can attack.
const SWARMLING_SPAWNS = [
    { id: 'swarm_n', x: PLAYER_POS.x,       y: PLAYER_POS.y - 120 },  // (180, 20)
    { id: 'swarm_s', x: PLAYER_POS.x,       y: PLAYER_POS.y + 120 },  // (180, 260)
    { id: 'swarm_e', x: PLAYER_POS.x + 120, y: PLAYER_POS.y },        // (300, 140)
    { id: 'swarm_w', x: PLAYER_POS.x - 120, y: PLAYER_POS.y },        // (60, 140)
];

/**
 * Four swarmlings spawn outside bite range in cardinal directions, hunt the player down
 * via the hunt AI, and collectively land at least 4 bites.
 * Each swarmling carries two copies of Bite (E13) so it can snap twice per round.
 */
export const swarmlingHuntAndBiteScenario: ScenarioDefinition = {
    id: 'enemy_swarmling_hunt_and_bite',
    title: 'Swarmlings: 4 close from outside range and land 4 bites on the player',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 15000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 8, localPlayerId: P, grass: true });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: [],
        });

        for (const { id, x, y } of SWARMLING_SPAWNS) {
            const swarmling = createUnitFromSpawnConfig(
                {
                    id,
                    characterId: 'swarmling',
                    name: 'Swarmling',
                    x,
                    y,
                    teamId: 'enemy',
                    ownerId: 'ai',
                    abilities: ['0013', '0013'],
                    unitAITreeId: 'hunt',
                    aiSettings: { minRange: 0, maxRange: 70 },
                },
                engine.eventBus,
            );
            initializeAbilityRuntimeForUnit(swarmling);
            engine.addUnit(swarmling, 'initialGameSpawn');
        }

        // Keep the player non-idle so the runner doesn't exit before all bites land.
        // Queue waits every 1.5 s (90 ticks) to cover the full scenario window.
        for (const tick of [90, 180, 270, 360, 450, 540]) {
            engine.state.orderMgr.queueOrder(tick, {
                unitId: player.id,
                abilityId: 'wait',
                targets: [],
            });
        }

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        return Boolean(player && player.maxHp - player.hp >= BITE_DAMAGE * REQUIRED_ATTACKS);
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const damageDealt = player ? player.maxHp - player.hp : 0;
        const attacksLanded = Math.floor(damageDealt / BITE_DAMAGE);
        const swarmInfo = SWARMLING_SPAWNS.map(({ id }) => {
            const s = engine.getUnit(id);
            if (!s) return `${id}:gone`;
            const active = s.activeAbilities.map((a) => a.abilityId).join(',');
            return `${id}:pos=(${s.x.toFixed(0)},${s.y.toFixed(0)}) active=[${active || '—'}]`;
        }).join(' | ');
        return `attacks landed: ${attacksLanded}/${REQUIRED_ATTACKS} (player hp=${player?.hp}/${player?.maxHp}) | ${swarmInfo}`;
    },
};

// ---------------------------------------------------------------------------
// Two swarmlings converge on the same POI — shared build, no duplicate nest.
// ---------------------------------------------------------------------------

const SWARM_SHARED_SITE_COL = 6;
const SWARM_SHARED_SITE_ROW = 3;
/** Must match SEEK_STAND_RADIUS in snet_seek.ts. */
const SWARM_SEEK_STAND_RADIUS = 56;
/** Must match SWARM_DEFAULT_CONSTRUCTION_SEC in swarmNestTick.ts (10s). */
const SWARM_SOLO_CONSTRUCTION_SEC = 10;

function swarmWorldOf(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export const swarmlingSharedConstructionScenario: ScenarioDefinition = {
    id: 'swarmling_shared_construction',
    title: 'Swarmlings: two swarmlings building at the same site finish faster than one alone',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 15000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 8, localPlayerId: P, grass: true });

        engine.registerMapPOIs([
            {
                id: 'swarm_shared_site',
                label: 'Shared Swarm Site',
                col: SWARM_SHARED_SITE_COL,
                row: SWARM_SHARED_SITE_ROW,
                type: 'nest',
            },
        ]);

        const sitePos = swarmWorldOf(SWARM_SHARED_SITE_COL, SWARM_SHARED_SITE_ROW);

        // `processSwarmNests`'s construction-completion path now resolves the new nest's spawn
        // position via `mapNetwork.getNode(...)` instead of the old `mapPOIs` + `terrainGrid`
        // lookup (see `docs/plans/swarm-nest-network-migration.md` Step 2/3) — register a matching
        // network node (same id as the POI above) so construction can still complete here.
        // Mirrors `lanternites.ts`'s `engine.mapNetworkManager.loadFromSegments(...)` pattern; no
        // edges needed since this scenario hardcodes `targetNestPoiId` directly and never calls
        // `findUnclaimedNetworkNode`.
        engine.mapNetworkManager.loadFromSegments({
            nodes: [
                {
                    id: 'swarm_shared_site',
                    x: sitePos.x,
                    y: sitePos.y,
                    radius: 0,
                    tags: ['nest'],
                    segmentId: 'test',
                },
            ],
            edges: [],
        });

        // Both swarmlings start already standing at their construction position (angles 0 and PI,
        // so they don't overlap) — this isolates the shared-build/acceleration behavior from travel time.
        function makeSwarmling(id: string, angle: number): void {
            const standX = sitePos.x + Math.cos(angle) * SWARM_SEEK_STAND_RADIUS;
            const standY = sitePos.y + Math.sin(angle) * SWARM_SEEK_STAND_RADIUS;
            const swarmling = createUnitFromSpawnConfig(
                {
                    id,
                    characterId: 'swarmling',
                    name: 'Test Swarmling',
                    x: standX,
                    y: standY,
                    teamId: 'enemy',
                    ownerId: 'ai',
                    abilities: ['0013'],
                    unitAITreeId: 'swarmlingNetwork',
                    aiSettings: { minRange: 0, maxRange: 70 },
                },
                engine.eventBus,
                engine,
            );
            swarmling.swarmState.targetNestPoiId = 'swarm_shared_site';
            swarmling.swarmState.orbitAngle = angle;
            initializeAbilityRuntimeForUnit(swarmling);
            engine.addUnit(swarmling, 'initialGameSpawn');
        }
        makeSwarmling('shared_swarmling_a', 0);
        makeSwarmling('shared_swarmling_b', Math.PI);

        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: swarmWorldOf(0, 7).x,
            y: swarmWorldOf(0, 7).y,
            abilities: [],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return [];
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        // Exactly one nest should ever be built here, and — since two swarmlings are
        // contributing — it must complete well before a lone swarmling's 10s duration would allow.
        const nests = engine.units.filter((u) => u.characterId === 'swarm_nest' && u.isAlive());
        return nests.length === 1 && engine.gameTime < SWARM_SOLO_CONSTRUCTION_SEC * 0.75;
    },

    failureMessage(engine) {
        const nests = engine.units.filter((u) => u.characterId === 'swarm_nest' && u.isAlive());
        const swarmlings = engine.units.filter((u) => u.characterId === 'swarmling' && u.isAlive());
        const buildTime = swarmlings[0]?.swarmState.constructionCompleteAtGameTime;
        return (
            `alive nests=${nests.length} alive swarmlings=${swarmlings.length}` +
            (buildTime != null
                ? ` constructAt=${buildTime.toFixed(1)} now=${engine.gameTime.toFixed(1)}`
                : ' no-construct-timer')
        );
    },

    describeState(engine) {
        const nests = engine.units.filter((u) => u.characterId === 'swarm_nest' && u.isAlive()).length;
        const swarmlings = engine.units.filter((u) => u.characterId === 'swarmling' && u.isAlive()).length;
        return `t=${engine.gameTime.toFixed(1)} nests=${nests} swarmlings=${swarmlings}`;
    },
};

// ---------------------------------------------------------------------------
// A freshly spawned swarmling contests an occupied network node instead of
// avoiding it, and still picks the nearest node in the whole graph rather than
// restricting itself to graph neighbors.
// ---------------------------------------------------------------------------

const CONTEST_NEAR_NODE_COL = 5;
const CONTEST_NEAR_NODE_ROW = 3;
const CONTEST_FAR_NODE_COL = 1;
const CONTEST_FAR_NODE_ROW = 6;
const CONTEST_NEST_COL = 6;
const CONTEST_NEST_ROW = 3;

export const swarmlingContestsOccupiedNestScenario: ScenarioDefinition = {
    id: 'swarmling_contests_occupied_nest',
    title: 'Swarmlings: a new swarmling targets the nearest network node even when another faction already holds it',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 8000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 8, localPlayerId: P, grass: true });

        const nearNodePos = swarmWorldOf(CONTEST_NEAR_NODE_COL, CONTEST_NEAR_NODE_ROW);
        const farNodePos = swarmWorldOf(CONTEST_FAR_NODE_COL, CONTEST_FAR_NODE_ROW);
        const nestPos = swarmWorldOf(CONTEST_NEST_COL, CONTEST_NEST_ROW);

        // Two candidate network nodes: one close to the swarm nest but already held by a
        // lanternite_nest (a different faction/characterId entirely), one genuinely unclaimed but
        // much farther away. Per docs/plans/swarm-nest-network-migration.md decisions #1/#2,
        // `findUnclaimedNetworkNode` must still pick the near, occupied-by-another-faction node —
        // it only excludes nodes already claimed by the swarm's *own* units, and it scans the
        // whole graph rather than restricting to neighbors. If a future change added
        // `getOwnerCharacterId`-based exclusion, this scenario would fail by picking the far node.
        engine.mapNetworkManager.loadFromSegments({
            nodes: [
                { id: 'contest_near_node', x: nearNodePos.x, y: nearNodePos.y, radius: 20, tags: ['nest'], segmentId: 'test' },
                { id: 'contest_far_node', x: farNodePos.x, y: farNodePos.y, radius: 20, tags: ['nest'], segmentId: 'test' },
            ],
            edges: [],
        });

        // A live, opted-in non-swarm unit standing exactly on the near node — "occupying" it from
        // another faction's perspective.
        const occupier = createUnitFromSpawnConfig(
            {
                id: 'contest_occupier',
                characterId: 'lanternite_nest',
                name: 'Occupying Lanternite Nest',
                x: nearNodePos.x,
                y: nearNodePos.y,
                teamId: 'allied',
                ownerId: 'ai',
                abilities: [],
                unitAITreeId: 'lanterniteNestIdle',
                aiSettings: { minRange: 0, maxRange: 0 },
            },
            engine.eventBus,
            engine,
        );
        engine.addUnit(occupier, 'initialGameSpawn');

        // Swarm nest, primed to spawn its first swarmling on tick one.
        const nest = createUnitFromSpawnConfig(
            {
                id: 'contest_swarm_nest',
                characterId: 'swarm_nest',
                name: 'Contest Swarm Nest',
                x: nestPos.x,
                y: nestPos.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitAITreeId: 'lanterniteNestIdle',
                aiSettings: { minRange: 0, maxRange: 0 },
            },
            engine.eventBus,
            engine,
        );
        nest.swarmState.nestConfig = { maxSwarmlings: 1, spawnIntervalSec: 1 };
        nest.swarmState.nestSpawnState = { spawnedIds: [], nextSpawnAtGameTime: 0 };
        engine.addUnit(nest, 'initialGameSpawn');

        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: swarmWorldOf(0, 7).x,
            y: swarmWorldOf(0, 7).y,
            abilities: [],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return [];
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const swarmling = engine.units.find((u) => u.characterId === 'swarmling' && u.isAlive());
        return swarmling?.swarmState.targetNestPoiId === 'contest_near_node';
    },

    failureMessage(engine) {
        const swarmling = engine.units.find((u) => u.characterId === 'swarmling' && u.isAlive());
        return swarmling
            ? `swarmling targetNestPoiId=${swarmling.swarmState.targetNestPoiId ?? 'none'}`
            : 'no swarmling spawned';
    },

    describeState(engine) {
        const swarmling = engine.units.find((u) => u.characterId === 'swarmling' && u.isAlive());
        return `t=${engine.gameTime.toFixed(1)} swarmlingTarget=${swarmling?.swarmState.targetNestPoiId ?? 'none'}`;
    },
};

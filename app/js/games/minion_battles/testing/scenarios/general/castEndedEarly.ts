import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import { TerrainType } from '../../../terrain/TerrainType';
import { Rock } from '../../../resources/Rock';
import { STONE_TOMB_ROCK_COST } from '../../../card_defs/05_earth_core/earthCoreConstants';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const GRID_W = 12;
const GRID_H = 10;
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 };
const DUMMY_POS = { x: 5 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 };

const STONE_TOMB_ID = '0530';
const TOMB_LABEL = 'Tomb location';

/** What `assertPass` has seen so far, per engine (the assertion runs every tick, so it can latch). */
interface MissingPickProgress {
    /** The battle paused for the player while the Stone Tomb cast had `awaitingPickLabel` set. */
    sawMissingPickPause: boolean;
    /** `waitingForTargetInput` was ever non-null (the pause must never be an ITS target pause). */
    sawTargetInput: boolean;
    /** After the fizzle, the player became an ordinary order waiter (the battle carried on). */
    sawLaterPause: boolean;
    /** Rock tiles on the map when the engine was built. */
    baselineRockTiles: number;
}

const progressByEngine = new WeakMap<object, MissingPickProgress>();

function countRockTiles(engine: GameEngine): number {
    const tm = engine.terrainManager;
    if (!tm) return 0;
    let count = 0;
    for (let row = 0; row < GRID_H; row++) {
        for (let col = 0; col < GRID_W; col++) {
            if (tm.getEffectiveTerrainType(col, row) === TerrainType.Rock) count++;
        }
    }
    return count;
}

function progressOf(engine: GameEngine): MissingPickProgress {
    let progress = progressByEngine.get(engine);
    if (!progress) {
        progress = {
            sawMissingPickPause: false,
            sawTargetInput: false,
            sawLaterPause: false,
            baselineRockTiles: countRockTiles(engine),
        };
        progressByEngine.set(engine, progress);
    }
    return progress;
}

/** Latches the milestones from the engine's current state. Called from every `assertPass`. */
function observe(engine: GameEngine): MissingPickProgress {
    const progress = progressOf(engine);
    if (engine.waitingForTargetInput != null) progress.sawTargetInput = true;

    const player = engine.getLocalPlayerUnit();
    const batch = engine.waitingForOrders;
    if (!player || !batch || !batch.waiters.some((w) => w.unitId === player.id)) return progress;

    const tomb = player.activeAbilities.find((a) => a.abilityId === STONE_TOMB_ID);
    if (tomb) {
        if (tomb.awaitingPickLabel === TOMB_LABEL) progress.sawMissingPickPause = true;
    } else if (progress.sawMissingPickPause) {
        progress.sawLaterPause = true;
    }
    return progress;
}

export const castMissingPickPassFizzlesScenario: ScenarioDefinition = {
    id: 'cast_ended_early_missing_pick_pass_fizzles',
    title: 'A committed Stone Tomb with no pick pauses the battle at the select, and Pass fizzles the cast with a refund',
    category: 'general',
    generalSection: 'Cast Ended Early',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: GRID_W, gridH: GRID_H, localPlayerId: P, grass: true });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: PLAYER_POS,
            dummyWorld: DUMMY_POS,
            abilities: [STONE_TOMB_ID],
        });
        const player = engine.getLocalPlayerUnit()!;
        const rock = new Rock();
        player.attachResource(rock, engine.eventBus);
        rock.add(STONE_TOMB_ROCK_COST);
        progressOf(engine);
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        // A committed order from a preview that ended before the tomb pick: no target, label marked missing.
        // Nothing interrupts the cast, so the select gate is reached and the battle pauses for the pick.
        return [{
            unitId: u.id,
            abilityId: STONE_TOMB_ID,
            targets: [],
            targetsByLabel: {},
            missingSelectLabels: [TOMB_LABEL],
            endTurn: true,
        }];
    },
    // The runner answers every ordinary pause (including the missing-pick pause) with `wait`, which is Pass.
    assertPass(e) {
        const progress = observe(e);
        const player = e.getLocalPlayerUnit();
        const dummy = e.getUnit('target_dummy');
        if (!player || !dummy) return false;
        const castGone = !player.activeAbilities.some((a) => a.abilityId === STONE_TOMB_ID);
        const rockLeft = player.getResource('rock')?.current;
        return progress.sawMissingPickPause
            && !progress.sawTargetInput
            && progress.sawLaterPause
            && castGone
            // Stone Tomb uses the default interrupt policy (cancel), so the rock cost is refunded in full.
            && rockLeft === STONE_TOMB_ROCK_COST
            && countRockTiles(e) === progress.baselineRockTiles
            && dummy.hp === dummy.maxHp;
    },
    failureMessage(e) {
        const progress = progressOf(e);
        const player = e.getLocalPlayerUnit();
        const dummy = e.getUnit('target_dummy');
        const castActive = player?.activeAbilities.some((a) => a.abilityId === STONE_TOMB_ID) ?? false;
        return `sawMissingPickPause=${progress.sawMissingPickPause} (want true); sawTargetInput=${progress.sawTargetInput} (want false); `
            + `sawLaterPause=${progress.sawLaterPause} (want true); tomb cast still active=${castActive} (want false); `
            + `rock=${player?.getResource('rock')?.current} (want ${STONE_TOMB_ROCK_COST}); `
            + `rock tiles=${countRockTiles(e)} (want ${progress.baselineRockTiles}); `
            + `dummy lost ${dummy ? dummy.maxHp - dummy.hp : '?'} hp (want 0)`;
    },
    describeState(e) {
        const player = e.getLocalPlayerUnit();
        const tomb = player?.activeAbilities.find((a) => a.abilityId === STONE_TOMB_ID);
        return `ticks=${e.gameTick} awaitingPickLabel=${tomb?.awaitingPickLabel ?? 'none'} waiters=${e.waitingForOrders?.waiters.length ?? 0}`;
    },
};

export const CAST_ENDED_EARLY_SCENARIOS: ScenarioDefinition[] = [castMissingPickPassFizzlesScenario];

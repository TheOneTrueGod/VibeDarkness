/**
 * Bloody Claws (0306) committed-run E2E contract. See `card_defs/03_blood_mage/AGENTS.md`.
 *
 * Orders are built the way the live UI builds them: each strike is picked through
 * `resolveItsSelectTargetForClick` (lock-on candidates from the claw hitbox at the clicked aim),
 * so the committed order carries the same label targets and positional lock-ons a player's would.
 *
 * Every strike is aimed due right of the caster. The primary lock-on (nearest the aim point) sits a
 * little above the aim line; a second enemy sits near the tip of the left claw, inside the hitbox for
 * the clicked direction and so locked on during targeting. Both must be hit: the claws strike along
 * the clicked aim, not along the line to the primary lock-on's centre.
 */

import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import type { BattleOrder, ResolvedTarget } from '../../../game/types';
import { buildFinalizedSequentialTargetingOrder } from '../../../game/interaction/InteractiveTargetingSession';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { getSelectTargetDefsFromTimings } from '../../../abilities/targeting';
import { resolveItsSelectTargetForClick } from '../../../game/interaction/itsCanvasInput';
import {
    BLOODY_CLAWS_FIRST_STRIKE_LUNGE,
    BLOODY_CLAWS_FOLLOW_UP_LUNGE,
    BLOODY_CLAWS_TIMINGS,
    BloodyClawsAbility_0306,
} from '../../../card_defs/03_blood_mage/0306_BloodyClaws/0306Ability';

const P = TINY_BATTLE_PLAYER_ID;
const CLAWS_ID = BloodyClawsAbility_0306.id;

const CASTER_POS = { x: 200, y: 200 };
/** Clicked aim for every strike: due right of the caster. */
const AIM = { x: CASTER_POS.x + 60, y: CASTER_POS.y };
/** Nearest the aim point, so it becomes each strike's primary lock-on. Off the aim line by ~14 degrees. */
const PRIMARY_POS = { x: CASTER_POS.x + 40, y: CASTER_POS.y - 10 };
/** Near the left claw's tip: inside the hitbox for the clicked aim, outside it if the claws swing to the primary. */
const EDGE_POS = { x: CASTER_POS.x + 64, y: CASTER_POS.y + 34 };
const EDGE_ID = 'claws_edge_enemy';
const START_HP = 100;

/** Primary: every claw (left, right, both X claws). Edge: the left claw on strikes 1 and 3. */
const PRIMARY_HITS = 4;
const EDGE_HITS = 2;

/** Claw hits per unit, counted from `damage_taken` events sourced by the caster (bleed ticks excluded). */
let clawHits: Record<string, number> = {};

/**
 * Pick every strike at `aim` the way the live UI does, then commit through the same finalizer ITS
 * uses, so the order has the real label targets and positional targets.
 */
function buildOrderLikeTheUi(
    engine: GameEngine,
    aim: { x: number; y: number },
    /**
     * Where the caster stands when each step is picked. Live play picks later strikes when their
     * windows open, after earlier step lunges have moved the caster; omit to pick all from the start.
     */
    pickFrom?: ReadonlyArray<{ x: number; y: number }>,
): BattleOrder {
    const caster = engine.getLocalPlayerUnit()!;
    const selectDefs = getSelectTargetDefsFromTimings(BloodyClawsAbility_0306, caster, engine);
    const collected: Record<string, ResolvedTarget> = {};
    for (const [i, selectDef] of selectDefs.entries()) {
        const at = pickFrom?.[i];
        const picker = at ? Object.assign(Object.create(caster) as typeof caster, { x: at.x, y: at.y }) : caster;
        const pick = resolveItsSelectTargetForClick(BloodyClawsAbility_0306, picker, selectDef, aim, aim, collected, engine);
        if (!pick) throw new Error(`Bloody Claws scenario: no pick for ${selectDef.label}`);
        collected[selectDef.label] = pick.labelTarget;
    }
    return buildFinalizedSequentialTargetingOrder(
        selectDefs.map((d) => d.label),
        collected,
        { unitId: caster.id, abilityId: CLAWS_ID, targets: [] },
    );
}

/** Counts claw hits on enemies (`damage_taken` sourced by the caster, so bleed ticks are excluded). */
function trackClawHits(engine: GameEngine, casterId: string): void {
    clawHits = {};
    engine.eventBus.on('damage_taken', (e) => {
        if (e.sourceUnitId === casterId) clawHits[e.unitId] = (clawHits[e.unitId] ?? 0) + 1;
    });
}

function addEnemy(engine: GameEngine, id: string, pos: { x: number; y: number }): void {
    const unit = createUnitFromSpawnConfig({
        id, characterId: 'dog', name: id,
        x: pos.x, y: pos.y, teamId: 'enemy', ownerId: 'ai',
        hp: START_HP, unitAITreeId: 'static_test_no_ai',
    }, engine.eventBus);
    initializeAbilityRuntimeForUnit(unit);
    engine.addUnit(unit, 'initialGameSpawn');
}

export const bloodyClawsEdgeLockOnScenario: ScenarioDefinition = {
    id: 'bloody_claws_edge_lock_on_e2e',
    title: 'Bloody Claws (0306): enemies locked on at the claw edge are hit along the clicked aim',
    category: 'ability',
    maxDurationMs: 4000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 16, gridH: 12, localPlayerId: P, grass: true });
        const { player, dummy } = placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: CASTER_POS,
            dummyWorld: PRIMARY_POS,
            abilities: [CLAWS_ID],
        });
        dummy.hp = START_HP;
        dummy.maxHp = START_HP;
        addEnemy(engine, EDGE_ID, EDGE_POS);
        trackClawHits(engine, player.id);
        return engine;
    },

    getInitialOrders(engine) {
        return [buildOrderLikeTheUi(engine, AIM)];
    },

    assertPass(engine) {
        if (engine.gameTime < BLOODY_CLAWS_TIMINGS.xStrikeEnd + 0.05) return false;
        return (clawHits['target_dummy'] ?? 0) === PRIMARY_HITS && (clawHits[EDGE_ID] ?? 0) === EDGE_HITS;
    },

    failureMessage(engine) {
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `primary claw hits=${clawHits['target_dummy'] ?? 0} (expected ${PRIMARY_HITS})`,
            `edge claw hits=${clawHits[EDGE_ID] ?? 0} (expected ${EDGE_HITS})`,
        ].join('; ');
    },
};

/**
 * Lobby F2DDA5: a lock-on whose body touches a claw but whose centre is beyond the claws' reach
 * (`aiSettings.maxRange`). Each strike is aimed due right; the enemy sits off that line near the left
 * claw's tip. It must be hit by the left claw on strikes 1 and 3 (it is a lock-on candidate there),
 * not lost because its centre is out of range.
 */
const FAR_CENTRE_ID = 'claws_far_centre_enemy';
const FAR_CENTRE_POS = { x: CASTER_POS.x + 80, y: CASTER_POS.y + 26 };
const FAR_CENTRE_HITS = 2;

export const bloodyClawsFarCentreLockOnScenario: ScenarioDefinition = {
    id: 'bloody_claws_far_centre_lock_on_e2e',
    title: "Bloody Claws (0306): a lock-on whose centre is past the claws' reach is still hit",
    category: 'ability',
    maxDurationMs: 4000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 16, gridH: 12, localPlayerId: P, grass: true });
        const { player } = placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: CASTER_POS,
            // Parked far away; only the far-centre enemy is in reach.
            dummyWorld: { x: CASTER_POS.x - 300, y: CASTER_POS.y + 150 },
            abilities: [CLAWS_ID],
        });
        addEnemy(engine, FAR_CENTRE_ID, FAR_CENTRE_POS);
        trackClawHits(engine, player.id);
        return engine;
    },

    getInitialOrders(engine) {
        return [buildOrderLikeTheUi(engine, AIM)];
    },

    assertPass(engine) {
        if (engine.gameTime < BLOODY_CLAWS_TIMINGS.xStrikeEnd + 0.05) return false;
        return (clawHits[FAR_CENTRE_ID] ?? 0) === FAR_CENTRE_HITS;
    },

    failureMessage(engine) {
        return `t=${engine.gameTime.toFixed(2)}s; far-centre claw hits=${clawHits[FAR_CENTRE_ID] ?? 0} (expected ${FAR_CENTRE_HITS})`;
    },
};

/**
 * Step lunges: every strike steps toward its own target before it lands, and the steps add up.
 * All three strikes aim straight ahead at an enemy 125px away. Strikes 1 and 2 cannot reach it even
 * after stepping (20px, then 15px); the X strike, after the third step (15px), lands both claws.
 * Without per-strike lunges no claw would reach it.
 */
const FAR_AHEAD_ID = 'claws_far_ahead_enemy';
const FAR_AHEAD_POS = { x: CASTER_POS.x, y: CASTER_POS.y - 125 };
const FAR_AHEAD_AIM = { x: CASTER_POS.x, y: CASTER_POS.y - 300 };
const FAR_AHEAD_HITS = 2;

export const bloodyClawsStepLungesScenario: ScenarioDefinition = {
    id: 'bloody_claws_step_lunges_e2e',
    title: 'Bloody Claws (0306): each strike steps toward its target, so the X strike reaches a far enemy',
    category: 'ability',
    maxDurationMs: 4000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 16, gridH: 12, localPlayerId: P, grass: true });
        const { player } = placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: CASTER_POS,
            dummyWorld: { x: CASTER_POS.x + 300, y: CASTER_POS.y + 150 },
            abilities: [CLAWS_ID],
        });
        addEnemy(engine, FAR_AHEAD_ID, FAR_AHEAD_POS);
        trackClawHits(engine, player.id);
        return engine;
    },

    getInitialOrders(engine) {
        // Strikes 2 and 3 are picked after the earlier steps (20px, then 15px) straight ahead.
        const at = (forward: number) => ({ x: CASTER_POS.x, y: CASTER_POS.y - forward });
        return [buildOrderLikeTheUi(engine, FAR_AHEAD_AIM, [at(0), at(BLOODY_CLAWS_FIRST_STRIKE_LUNGE), at(BLOODY_CLAWS_FIRST_STRIKE_LUNGE + BLOODY_CLAWS_FOLLOW_UP_LUNGE)])];
    },

    assertPass(engine) {
        if (engine.gameTime < BLOODY_CLAWS_TIMINGS.xStrikeEnd + 0.05) return false;
        return (clawHits[FAR_AHEAD_ID] ?? 0) === FAR_AHEAD_HITS;
    },

    failureMessage(engine) {
        const caster = engine.getLocalPlayerUnit();
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `far-ahead claw hits=${clawHits[FAR_AHEAD_ID] ?? 0} (expected ${FAR_AHEAD_HITS})`,
            `caster moved ${caster ? (CASTER_POS.y - caster.y).toFixed(1) : '?'}px forward`,
        ].join('; ');
    },
};

/**
 * Collapse (0905) — cone gather through the real order path.
 *
 * Beat 1 (east): four enemies in the cone around the cursor. Only the 3 nearest the cursor are pulled into an
 * arc in front of the caster, take damage, and are staggered (cannot act) just after landing. The 4th is untouched.
 * Beat 2: a follow-up Strong Punch order issued right after Collapse's cooldown ends is accepted while the pulled
 * enemies are still airborne (validates the follow-up overlap window).
 * Beat 3 (north): a second Collapse over two bosses (one armoured, one pre-Exposed). Neither ever gains `staggered`;
 * the armoured boss's CC armour is not consumed and the Exposed boss stays Exposed.
 *
 * Note: `EXPOSED_DURATION_INCREASES_FROM_CC` is false today, so "Exposed grows" is not asserted here.
 */

import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { UnitTag } from '../../../game/units/unitTag';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { Gravity } from '../../../resources/Gravity';
import { STAGGERED_BUFF_TYPE } from '../../../buffs/StaggeredBuff';
import { ExposedBuff, EXPOSED_BUFF_TYPE } from '../../../buffs/ExposedBuff';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    COLLAPSE_ARC_SPACING,
    COLLAPSE_COOLDOWN_DURATION,
    COLLAPSE_DAMAGE,
    COLLAPSE_FLING_DURATION,
    COLLAPSE_GRAVITY_COST,
    COLLAPSE_PREFIRE_TIME,
    COLLAPSE_RELEASE_DURATION,
} from '../../../card_defs/09_gravity_core/gravityConstants';

const P = TINY_BATTLE_PLAYER_ID;
const COLLAPSE_ID = '0905';
const PUNCH_ID = '0117';

const PLAYER_POS = { x: 3 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 }; // (140, 220)
const EAST_CURSOR = { x: PLAYER_POS.x + 80, y: PLAYER_POS.y };
const NORTH_CURSOR = { x: PLAYER_POS.x, y: PLAYER_POS.y - 80 };
const PUNCH_AIM_WEST = { x: PLAYER_POS.x - 80, y: PLAYER_POS.y };

// Nearest-to-cursor order: near_a, near_b, near_c, far_d (all inside the 110px / 70deg cone).
const NEAR_A = { x: EAST_CURSOR.x, y: EAST_CURSOR.y };
const NEAR_B = { x: EAST_CURSOR.x - 10, y: EAST_CURSOR.y + 20 };
const NEAR_C = { x: EAST_CURSOR.x + 12, y: EAST_CURSOR.y - 24 };
const FAR_D = { x: EAST_CURSOR.x + 26, y: EAST_CURSOR.y + 10 };
const ARMOURED_BOSS_POS = { x: NORTH_CURSOR.x, y: NORTH_CURSOR.y };
const EXPOSED_BOSS_POS = { x: NORTH_CURSOR.x + 20, y: NORTH_CURSOR.y + 10 };

const CAST_END = COLLAPSE_PREFIRE_TIME + COLLAPSE_RELEASE_DURATION + COLLAPSE_COOLDOWN_DURATION;
const LANDING = COLLAPSE_PREFIRE_TIME + COLLAPSE_FLING_DURATION;
/** Follow-up punch is queued one tick after the cast ends (before landing). */
const FOLLOW_UP_TICK = Math.ceil(CAST_END * 60) + 1;
const FOLLOW_UP_CHECK_START = (FOLLOW_UP_TICK + 3) / 60;
const STAGGER_CHECK_START = LANDING + 0.04;
const STAGGER_CHECK_END = LANDING + 0.2;
const SECOND_CAST_TICK = 120;
const SECOND_CAST_TIME = SECOND_CAST_TICK / 60;
const DONE_TIME = SECOND_CAST_TIME + LANDING + 0.2;
const ARC_TOLERANCE = 4;

interface CollapseProbe {
    followUpAcceptedBeforeLanding: boolean;
    staggerOkAtLanding: boolean;
    sawStaggerCheck: boolean;
    bossStaggered: boolean;
}

const probes = new WeakMap<GameEngine, CollapseProbe>();

function getProbe(engine: GameEngine): CollapseProbe {
    let p = probes.get(engine);
    if (!p) {
        p = { followUpAcceptedBeforeLanding: false, staggerOkAtLanding: false, sawStaggerCheck: false, bossStaggered: false };
        probes.set(engine, p);
    }
    return p;
}

function updateProbe(engine: GameEngine): CollapseProbe {
    const probe = getProbe(engine);
    const t = engine.gameTime;
    const player = engine.getLocalPlayerUnit();
    const pulled = ['near_a', 'near_b', 'near_c'].map((id) => engine.getUnit(id));

    if (player && t >= FOLLOW_UP_CHECK_START && t < LANDING
        && player.activeAbilities.some((a) => a.abilityId === PUNCH_ID)
        && pulled.every((u) => !!u?.knockback)) {
        probe.followUpAcceptedBeforeLanding = true;
    }

    if (t >= STAGGER_CHECK_START && t <= STAGGER_CHECK_END) {
        const far = engine.getUnit('far_d');
        const ok = pulled.every((u) => !!u && u.hasBuff(STAGGERED_BUFF_TYPE) && !u.canAct())
            && !!far && !far.hasBuff(STAGGERED_BUFF_TYPE) && far.canAct();
        if (!probe.sawStaggerCheck) probe.staggerOkAtLanding = ok;
        else probe.staggerOkAtLanding = probe.staggerOkAtLanding && ok;
        probe.sawStaggerCheck = true;
    }

    if (t >= SECOND_CAST_TIME) {
        for (const id of ['boss_armoured', 'boss_exposed']) {
            if (engine.getUnit(id)?.hasBuff(STAGGERED_BUFF_TYPE)) probe.bossStaggered = true;
        }
    }
    return probe;
}

function spawnBoss(engine: GameEngine, id: string, pos: { x: number; y: number }) {
    const boss = createUnitFromSpawnConfig(
        {
            id,
            characterId: 'alpha_wolf',
            name: id,
            x: pos.x,
            y: pos.y,
            teamId: 'enemy',
            ownerId: 'ai',
            abilities: [],
            unitAITreeId: 'static_test_no_ai',
            unitTags: [UnitTag.Boss, UnitTag.CrowdSpacingExempt],
        },
        engine.eventBus,
    );
    initializeAbilityRuntimeForUnit(boss);
    engine.addUnit(boss, 'initialGameSpawn');
    return boss;
}

export const gravityCollapseScenario: ScenarioDefinition = {
    id: 'gravity_collapse_cone_gather_e2e',
    title: 'Collapse (0905): pulls 3 nearest into an arc and staggers; follow-up allowed; bosses not staggered',
    category: 'ability',
    maxDurationMs: 6000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 10,
            localPlayerId: P,
            grass: true,
        });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: [COLLAPSE_ID, PUNCH_ID],
        });
        const gravity = new Gravity();
        player.attachResource(gravity, engine.eventBus);
        gravity.add(COLLAPSE_GRAVITY_COST * 4);

        const dummies: Array<[string, { x: number; y: number }]> = [
            ['near_a', NEAR_A],
            ['near_b', NEAR_B],
            ['near_c', NEAR_C],
            ['far_d', FAR_D],
        ];
        for (const [id, pos] of dummies) {
            const dummy = createTargetDummyAtWorld(engine, pos.x, pos.y, { id, hp: 100 });
            initializeAbilityRuntimeForUnit(dummy);
            engine.addUnit(dummy, 'initialGameSpawn');
        }

        spawnBoss(engine, 'boss_armoured', ARMOURED_BOSS_POS);
        const exposedBoss = spawnBoss(engine, 'boss_exposed', EXPOSED_BOSS_POS);
        exposedBoss.addBuff(new ExposedBuff(30), 0, 1);

        // Follow-up attack: only accepted if Collapse's cast has already ended (before the fling lands).
        engine.state.orderMgr.queueOrder(FOLLOW_UP_TICK, {
            unitId: player.id,
            abilityId: PUNCH_ID,
            targets: [{ type: 'pixel', position: PUNCH_AIM_WEST }],
        });
        engine.state.orderMgr.queueOrder(SECOND_CAST_TICK, {
            unitId: player.id,
            abilityId: COLLAPSE_ID,
            targets: [{ type: 'pixel', position: NORTH_CURSOR }],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{
            unitId: player.id,
            abilityId: COLLAPSE_ID,
            targets: [{ type: 'pixel', position: EAST_CURSOR }],
        }];
    },

    assertPass(engine) {
        const probe = updateProbe(engine);
        if (engine.gameTime < DONE_TIME) return false;

        const player = engine.getLocalPlayerUnit();
        const near = ['near_a', 'near_b', 'near_c'].map((id) => engine.getUnit(id));
        const far = engine.getUnit('far_d');
        const armoured = engine.getUnit('boss_armoured');
        const exposed = engine.getUnit('boss_exposed');
        if (!player || near.some((u) => !u) || !far || !armoured || !exposed) return false;

        // Slots are fixed at release; the follow-up punch lunges the caster afterwards, so measure from the cast position.
        const arcRadius = player.radius + near[0]!.radius + COLLAPSE_ARC_SPACING;
        const inArc = near.every((u) => {
            const d = Math.hypot(u!.x - PLAYER_POS.x, u!.y - PLAYER_POS.y);
            return Math.abs(d - arcRadius) <= ARC_TOLERANCE && u!.x > PLAYER_POS.x;
        });
        const damaged = near.every((u) => u!.maxHp - u!.hp >= COLLAPSE_DAMAGE);
        // Not pulled (it may be nudged by the landing crowd, but stays well outside the arc).
        const farUntouched = far.hp === far.maxHp
            && Math.hypot(far.x - PLAYER_POS.x, far.y - PLAYER_POS.y) >= arcRadius + 20;

        return inArc
            && damaged
            && farUntouched
            && probe.staggerOkAtLanding
            && probe.followUpAcceptedBeforeLanding
            && !probe.bossStaggered
            && armoured.ccArmour.hardConsumed === 0
            && exposed.hasBuff(EXPOSED_BUFF_TYPE);
    },

    failureMessage(engine) {
        const probe = getProbe(engine);
        const player = engine.getLocalPlayerUnit();
        const unitInfo = (id: string): string => {
            const u = engine.getUnit(id);
            if (!u) return `${id}=missing`;
            const d = player ? Math.hypot(u.x - player.x, u.y - player.y).toFixed(1) : '?';
            return `${id}(hp=${u.hp}/${u.maxHp} dist=${d} stag=${u.hasBuff(STAGGERED_BUFF_TYPE)})`;
        };
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            ['near_a', 'near_b', 'near_c', 'far_d'].map(unitInfo).join(' '),
            `staggerOk=${probe.staggerOkAtLanding} followUpAccepted=${probe.followUpAcceptedBeforeLanding}`,
            `bossStaggered=${probe.bossStaggered}`,
            `armouredConsumed=${engine.getUnit('boss_armoured')?.ccArmour.hardConsumed}`,
            `exposed=${engine.getUnit('boss_exposed')?.hasBuff(EXPOSED_BUFF_TYPE)}`,
        ].join('; ');
    },
};

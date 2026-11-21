/**
 * Registers the Garden Heart family's named hooks: the Hive Gourd's spawner spec, the Shell-opening node-tree
 * callback, the two burrow callbacks that retire the old tree and grow the next, the Spike Ring's cast rate, and the
 * Heart's node-regrowth callbacks (regrow the missing nodes; the Bared window opening and closing). Imported for its side effects by `abilities/AbilityRegistry.ts`, next to the abilities, so every battle
 * (and every test that loads the registry) has them. Defs refer to these by id (`HIVE_GOURD_SPAWNER_ID`,
 * `SHELL_OPEN_CALLBACK_ID`), never by closure.
 */

import { Effect } from '../../game/effects/Effect';
import { registerNodeTreeCallback } from '../../game/units/components/nodeTreeHooks';
import { registerSpawnerSpec } from '../../game/units/components/spawnerHooks';
import type { SpawnerChildSpec } from '../../game/units/components/spawnerCore';
import { ENEMY_SWARMLING } from '../../constants/enemyConstants';
import { SLIME } from '../../game/units/dark_animals/slime';
import { registerBurrowCallback, registerSproutExclusionSource } from '../../game/units/components/phaseBurrow';
import { peekPhaseState } from '../../game/units/components/phaseComponent';
import { registerCastRateRule } from '../../game/units/components/cadenceCastHooks';
import { hasLivingChildren } from '../../game/units/components/nodeTree';
import { registerNodeRegrowthCallback, registerNodeRegrowthTrickleRule } from '../../game/units/components/nodeRegrowthHooks';
import { getAbility } from '../../abilities/AbilityRegistry';
import { grantAbilityUses } from '../../abilities/abilityUses';
import { executeUnitAbility } from '../../game/units/unitAbilityLifecycle';
import { showUnitBanner } from '../../game/unitBanner';
import type { GameEngine } from '../../game/GameEngine';
import type { EngineContext } from '../../game/EngineContext';
import type { Unit } from '../../game/units/Unit';
import { gardenSpikeRingRate } from './1605_SpikeRing/1605Ability';
import {
    dismissGardenTree,
    emergeGardenTree,
    growGardenTree,
    missingGardenNodeKeys,
    type GardenGrowContext,
} from '../../game/gardenHeart/growGardenTree';
import {
    BLOOM_BURST_ABILITY_ID,
    GARDEN_BARED_BANNER_TEXT,
    GARDEN_BARED_OPENED_CALLBACK_ID,
    GARDEN_DISMISS_TREE_CALLBACK_ID,
    GARDEN_PINWHEEL_ABILITY_BY_PRESET,
    GARDEN_PINWHEEL_PRESET_BY_PHASE,
    GARDEN_REGROW_CALLBACK_ID,
    GARDEN_REGROWN_BANNER_TEXT,
    GARDEN_REGROWN_CALLBACK_ID,
    GARDEN_SPIKE_RING_RATE_RULE_ID,
    GARDEN_STATE_BANNER_SEC,
    GARDEN_GROW_TREE_CALLBACK_ID,
    GARDEN_NODE_EMERGE,
    GARDEN_TRICKLE_REGROW_SEC_BY_PHASE,
    GARDEN_TRICKLE_RULE_ID,
    HIVE_GOURD_SPAWNER_ID,
    NIGHTBLOOM_SECONDARY,
    SHELL_OPEN_CALLBACK_ID,
} from './gardenHeartConstants';
import { GARDEN_BRIAR_EXCLUSION_SOURCE_ID, GARDEN_HEART_RISE_SECONDS } from './gardenHeartPhases';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainType } from '../../terrain/TerrainType';

/** Children a Hive Gourd births, in alternating order: a swarmling, then a slime. */
export const HIVE_GOURD_CHILDREN = [ENEMY_SWARMLING, SLIME] as const;

const CHILD_SPAWN_RADIUS_EXTRA_PX = 40;

function childSpec(def: (typeof HIVE_GOURD_CHILDREN)[number]): SpawnerChildSpec {
    return {
        characterId: def.characterId,
        name: def.name ?? def.characterId,
        abilities: [...def.abilities],
        team: 'inherit',
        aiSettings: def.aiSettings ? { ...def.aiSettings } : null,
        spawnRadiusExtraPx: CHILD_SPAWN_RADIUS_EXTRA_PX,
        inheritInvulnerability: false,
        spawnSource: 'nestSpawn',
    };
}

registerSpawnerSpec(HIVE_GOURD_SPAWNER_ID, {
    child: childSpec(HIVE_GOURD_CHILDREN[0]),
    maxChildren: (cfg) => cfg.maxChildren,
    intervalSec: (cfg) => cfg.intervalSec,
    burstCount: (cfg) => cfg.burstCount ?? 1,
    describeChild(_gourd, livingChildren) {
        // Alternate by how many are alive, so a gourd that has lost a swarmling replaces the kind that is missing.
        const def = HIVE_GOURD_CHILDREN[livingChildren % HIVE_GOURD_CHILDREN.length]!;
        const spec = childSpec(def);
        return {
            unitAITreeId: def.unitAITreeId,
            aiHookup: { kind: 'none' },
            overrides: {
                characterId: spec.characterId,
                name: spec.name,
                abilities: spec.abilities,
                aiSettings: spec.aiSettings,
            },
        };
    },
});

/** A Knot's last child died: its Shell opens (the plates split, the core shows). The state is `!hasLivingChildren`; this is the cue. */
registerNodeTreeCallback(SHELL_OPEN_CALLBACK_ID, (knot, ctx) => {
    ctx.engine.addEffect(
        new Effect({
            x: knot.x,
            y: knot.y,
            duration: 0.8,
            effectType: 'Pulse',
            effectData: { colors: [NIGHTBLOOM_SECONDARY] },
        }),
    );
});

/**
 * Burrow callback for the `sink` stage: the old tree dies with the Heart's retreat and every Stem becomes Briar.
 * Attach with `burrowPreset({ ..., callbacks: { sink: GARDEN_DISMISS_TREE_CALLBACK_ID, rise: GARDEN_GROW_TREE_CALLBACK_ID } })`.
 */
registerBurrowCallback(GARDEN_DISMISS_TREE_CALLBACK_ID, (heart, engine) => {
    dismissGardenTree(engine, heart);
});

/**
 * Burrow callback for the `rise` stage: the Heart has surfaced at its sprout point; grow the tree of the phase it has
 * just entered (phase state `index` counts phases entered, so the next layout is `index + 1`; phase 1 grows at mission
 * start through `growGardenTree` directly). The tree makes an entry: once the Heart is up, each node burrows out to
 * its spot, Knots first, then their Buds (`emergeGardenTree`).
 */
registerBurrowCallback(GARDEN_GROW_TREE_CALLBACK_ID, (heart, engine) => {
    const phase = (peekPhaseState(heart)?.index ?? 0) + 1;
    const grown = growGardenTree(engine as unknown as GardenGrowContext, heart, phase);
    emergeGardenTree(engine, heart, phase, grown, { delaySeconds: GARDEN_HEART_RISE_SECONDS, ...GARDEN_NODE_EMERGE });
});

/** Exclusion source for the retreat: every Briar tile is a zone the Heart must not resurface in (old Stems). */
registerSproutExclusionSource(GARDEN_BRIAR_EXCLUSION_SOURCE_ID, (_heart, engine) => {
    const tm = engine.terrainManager;
    if (!tm) return [];
    const zones: { x: number; y: number; radius: number }[] = [];
    for (let row = 0; row < tm.grid.height; row++) {
        for (let col = 0; col < tm.grid.width; col++) {
            if (tm.getEffectiveTerrainType(col, row) !== TerrainType.Briar) continue;
            zones.push({ x: (col + 0.5) * CELL_SIZE, y: (row + 0.5) * CELL_SIZE, radius: CELL_SIZE / 2 });
        }
    }
    return zones;
});

/**
 * The Spike Ring's rate: the phase's base rate (the growth phase the Heart is in is phase state `index` + 1, the same
 * numbering as its tree layouts) while it has a living node, and none while it is Bared.
 */
registerCastRateRule(GARDEN_SPIKE_RING_RATE_RULE_ID, (heart) => {
    if (!hasLivingChildren(heart)) return 0;
    return gardenSpikeRingRate(gardenGrowthPhaseOf(heart));
});

/** The Heart's trickle interval: phase 2 has its own (`GARDEN_TRICKLE_REGROW_SEC_BY_PHASE`), the rest use the default. */
registerNodeRegrowthTrickleRule(GARDEN_TRICKLE_RULE_ID, (heart) => GARDEN_TRICKLE_REGROW_SEC_BY_PHASE[gardenGrowthPhaseOf(heart)]);

/** The 1-based growth phase `heart` is in (phase state `index` counts phases entered). */
export function gardenGrowthPhaseOf(heart: Unit): number {
    return (peekPhaseState(heart)?.index ?? 0) + 1;
}

/** The nearest living player to `heart`: new nodes grow turned toward them, as the first tree does. */
function nearestPlayerPoint(heart: Unit, units: readonly Unit[]): { x: number; y: number } | undefined {
    let best: Unit | undefined;
    let bestDist = Infinity;
    for (const u of units) {
        if (u.teamId !== 'player' || !u.isAlive()) continue;
        const d = Math.hypot(u.x - heart.x, u.y - heart.y);
        if (d < bestDist) {
            bestDist = d;
            best = u;
        }
    }
    return best ? { x: best.x, y: best.y } : undefined;
}

/**
 * The Heart's regrowth (the `nodeRegrowth` component's `regrowCallback`): grows the missing nodes of the CURRENT
 * phase's tree, turned toward the nearest player. `regrow` grows them all (the Bared window ended) or `only` that many
 * (trickle); `missing` only counts how many slots are empty (it arms the trickle timer).
 */
registerNodeRegrowthCallback(GARDEN_REGROW_CALLBACK_ID, (heart, ctx, request) => {
    const phase = gardenGrowthPhaseOf(heart);
    if (request.event === 'missing') return missingGardenNodeKeys(ctx.engine, heart, phase).length;
    if (request.event !== 'regrow') return 0;
    const grown = growGardenTree(ctx.engine as unknown as GardenGrowContext, heart, phase, {
        onlyMissing: true,
        ...(request.only !== undefined ? { limit: request.only } : {}),
        faceToward: nearestPlayerPoint(heart, ctx.units),
    });
    return grown.size;
});

/** Cast a forced (not on the ability list) ability from the Heart, the way the cadence cast does. */
function castFromHeart(heart: Unit, abilityId: string | undefined, engine: EngineContext): void {
    const ability = abilityId ? getAbility(abilityId) : undefined;
    if (!ability) return;
    grantAbilityUses(heart, ability.id, 1);
    executeUnitAbility(heart, ability, [], engine);
}

/**
 * The Bared window opened (the Heart's last node died): the banner, and the phase's Bared attack: Bloom Burst in phase 1,
 * otherwise the Pinwheel for the phase's preset (`GARDEN_PINWHEEL_PRESET_BY_PHASE`).
 */
registerNodeRegrowthCallback(GARDEN_BARED_OPENED_CALLBACK_ID, (heart, ctx, request) => {
    if (request.event !== 'opened') return;
    showUnitBanner(ctx.engine as unknown as GameEngine, heart.id, GARDEN_BARED_BANNER_TEXT, GARDEN_STATE_BANNER_SEC);
    const phase = gardenGrowthPhaseOf(heart);
    const preset = GARDEN_PINWHEEL_PRESET_BY_PHASE[phase];
    const abilityId = preset ? GARDEN_PINWHEEL_ABILITY_BY_PRESET[preset] : BLOOM_BURST_ABILITY_ID;
    castFromHeart(heart, abilityId, ctx.engine);
});

/** The Bared window ended and the whole tree regrew: the banner. */
registerNodeRegrowthCallback(GARDEN_REGROWN_CALLBACK_ID, (heart, ctx, request) => {
    if (request.event !== 'regrown') return;
    showUnitBanner(ctx.engine as unknown as GameEngine, heart.id, GARDEN_REGROWN_BANNER_TEXT, GARDEN_STATE_BANNER_SEC);
});

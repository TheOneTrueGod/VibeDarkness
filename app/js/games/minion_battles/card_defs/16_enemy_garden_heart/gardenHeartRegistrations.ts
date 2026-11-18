/**
 * Registers the Garden Heart family's named hooks: the Hive Gourd's spawner spec, the Shell-opening node-tree
 * callback, the two burrow callbacks that retire the old tree and grow the next, and the Spike Ring's cast rate. Imported for its side effects by `abilities/AbilityRegistry.ts`, next to the abilities, so every battle
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
import { getNodeChildIds } from '../../game/units/components/nodeTree';
import { gardenTreeLayout } from '../../game/gardenHeart/gardenTreeLayouts';
import type { Unit } from '../../game/units/Unit';
import { gardenSpikeRingRate } from './1605_SpikeRing/1605Ability';
import { dismissGardenTree, growGardenTree, type GardenGrowContext } from '../../game/gardenHeart/growGardenTree';
import {
    GARDEN_DISMISS_TREE_CALLBACK_ID,
    GARDEN_SPIKE_RING_RATE_RULE_ID,
    GARDEN_GROW_TREE_CALLBACK_ID,
    HIVE_GOURD_SPAWNER_ID,
    NIGHTBLOOM_SECONDARY,
    SHELL_OPEN_CALLBACK_ID,
} from './gardenHeartConstants';
import { GARDEN_BRIAR_EXCLUSION_SOURCE_ID } from './gardenHeartPhases';
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
 * start through `growGardenTree` directly).
 */
registerBurrowCallback(GARDEN_GROW_TREE_CALLBACK_ID, (heart, engine) => {
    const entered = peekPhaseState(heart)?.index ?? 0;
    growGardenTree(engine as unknown as GardenGrowContext, heart, entered + 1);
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

/** Living nodes anywhere in `root`'s tree (not counting `root`). */
export function countLivingTreeNodes(root: Unit, getUnit: (id: string) => Unit | undefined): number {
    let n = 0;
    const stack = [...getNodeChildIds(root)];
    while (stack.length > 0) {
        const node = getUnit(stack.pop()!);
        if (!node?.isAlive()) continue;
        n++;
        stack.push(...getNodeChildIds(node));
    }
    return n;
}

/**
 * The Spike Ring's rate: the growth phase the Heart is in (phase state `index` + 1, the same numbering as its tree
 * layouts) and the share of that phase's tree already cut down.
 */
registerCastRateRule(GARDEN_SPIKE_RING_RATE_RULE_ID, (heart, engine) => {
    const phase = (peekPhaseState(heart)?.index ?? 0) + 1;
    const total = gardenTreeLayout(phase)?.length ?? 0;
    if (total === 0) return gardenSpikeRingRate(phase, 1);
    const living = countLivingTreeNodes(heart, (id) => engine.getUnit(id));
    return gardenSpikeRingRate(phase, 1 - Math.min(living, total) / total);
});

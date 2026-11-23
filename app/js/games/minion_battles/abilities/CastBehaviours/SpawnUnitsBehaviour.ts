import type { Unit } from '../../game/units/Unit';
import type { SpawnDefinition } from '../../game/units/spawning/spawnDefinition';
import type { SpawnUnitContext } from '../../game/units/spawning/spawnUnit';
import {
    spawnSpawnerChildren,
    type SpawnerSpec,
    type SpawnerState,
} from '../../game/units/components/spawnerCore';
import type { CastBehaviour, CastBehaviourTickContext } from '../castBehaviourTypes';

export interface SpawnPoint {
    x: number;
    y: number;
}

/** A child to spawn: everything in a `SpawnDefinition` except where (the position picker decides that). */
export type SpawnUnitsTemplate = Omit<SpawnDefinition, 'placement' | 'count'> & Partial<Pick<SpawnDefinition, 'placement' | 'count'>>;

export interface SpawnUnitsConfig {
    /**
     * What each child looks like. A function so it can read the caster (team, AI tree) at fire time.
     * Pass `teamId` explicitly: a summon is not tied to the caster's own team by this block.
     * Required unless `spawnOne` is set.
     */
    template?: SpawnUnitsTemplate | ((ctx: CastBehaviourTickContext) => SpawnUnitsTemplate);
    /**
     * Spawn one child at a point yourself instead of through `template` and the spawner core, e.g. a pet of
     * the caster's owner through `spawnPetForOwner` (pet AI, owner link, copied modifiers). Return undefined
     * when nothing spawned there; that point is skipped. Takes the place of `template`.
     */
    spawnOne?: (ctx: CastBehaviourTickContext, at: SpawnPoint, index: number) => Unit | undefined;
    /**
     * The position picker: one world point per child, in spawn order. Called once per fire, AFTER
     * `replacePrevious` has faded the old batch. Any RNG it draws (use `engine.generateRandomInteger`)
     * happens here, so the draw order is the caller's.
     */
    positions: (ctx: CastBehaviourTickContext) => SpawnPoint[];
    /**
     * "Replace previous batch": returns the living units of the earlier batch. Each is faded out
     * (`ephemeralDespawnAtGameTime = now`, policy `'immediate'` so a mid-cast unit does not linger) before
     * the new batch is placed, so batches never stack.
     */
    replacePrevious?: (ctx: CastBehaviourTickContext) => Unit[];
    /** Called for each child right after it spawns (stat tweaks, AI hookup, VFX at its position). */
    onSpawned?: (ctx: CastBehaviourTickContext, unit: Unit, index: number, at: SpawnPoint) => void;
    /** Called once after the whole batch has spawned, with every child (in spawn order). */
    onBatchSpawned?: (ctx: CastBehaviourTickContext, spawned: Unit[]) => void;
}

/** Placement helper for a fixed ring or formation: offsets from the caster, as a position picker. */
export function offsetsFromCaster(offsets: ReadonlyArray<{ dx: number; dy: number }>) {
    return (ctx: CastBehaviourTickContext): SpawnPoint[] =>
        offsets.map((o) => ({ x: ctx.caster.x + o.dx, y: ctx.caster.y + o.dy }));
}

/**
 * Spawns a batch of units at chosen positions through `spawnSpawnerChildren` (the shared spawner
 * core), once when its timing window is entered. Optionally replaces the previous batch first.
 * Reusable for summoners, boss add waves, decoys and dismounting riders: it holds no ability
 * knowledge, only a template, a position picker and hooks.
 *
 * Usage:
 *   behaviour: new SpawnUnitsBehaviour({ template, positions: offsetsFromCaster([...]) })
 */
/**
 * Spawn one unit from `template` at each point, owned by `spawner`, through the shared spawner core. The
 * building block behind `SpawnUnitsBehaviour`, usable without a cast (e.g. passive `spawn_units`).
 * Returns the spawned units in point order.
 */
export function spawnUnitsAtPoints(
    spawner: Unit,
    template: SpawnUnitsTemplate,
    positions: readonly SpawnPoint[],
    engine: { units: Unit[]; gameTime: number },
): Unit[] {
    if (positions.length === 0) return [];
    // A template taken from a mission-style def carries its own placement and count; the points own both here.
    const { placement: _ignoredPlacement, count: _ignoredCount, ...overrides } = template;
    const spec: SpawnerSpec<null> = {
        child: {
            characterId: template.characterId,
            name: template.name ?? template.characterId,
            abilities: template.abilities,
            team: template.teamId,
            aiSettings: template.aiSettings ?? null,
            spawnRadiusExtraPx: 0,
            inheritInvulnerability: false,
            spawnSource: 'abilitySpawn',
        },
        maxChildren: () => positions.length,
        intervalSec: () => 0,
        burstCount: () => positions.length,
        describeChild: (_spawner, living) => ({
            aiHookup: template.aiHookup ?? { kind: 'none' },
            placement: { kind: 'fixedWorld', x: positions[living]!.x, y: positions[living]!.y },
            // The whole template wins over the generated fields, so nothing is lost or reinterpreted.
            overrides,
        }),
    };
    const state: SpawnerState = { spawnedIds: [], nextSpawnAtGameTime: 0 };
    return spawnSpawnerChildren({
        spawner,
        cfg: null,
        state,
        spec,
        count: positions.length,
        spawnCtx: engine as unknown as SpawnUnitContext,
        env: { units: engine.units, gameTime: engine.gameTime },
    });
}

export class SpawnUnitsBehaviour implements CastBehaviour {
    constructor(private readonly config: SpawnUnitsConfig) {}

    onTick(ctx: CastBehaviourTickContext): void {
        if (!ctx.isFirstTick) return;
        const { config } = this;
        const eng = ctx.engine;

        if (config.replacePrevious) {
            for (const old of config.replacePrevious(ctx)) {
                old.ephemeralDespawnAtGameTime = eng.gameTime;
                // Replaced means gone now: a `'finishCast'` unit does not linger to end its cast.
                old.ephemeralExpiryPolicy = 'immediate';
            }
        }

        const positions = config.positions(ctx);
        if (positions.length === 0) return;

        const placed: { unit: Unit; at: SpawnPoint }[] = [];
        if (config.spawnOne) {
            positions.forEach((at, i) => {
                const unit = config.spawnOne!(ctx, at, i);
                if (unit) placed.push({ unit, at });
            });
        } else if (config.template) {
            const template = typeof config.template === 'function' ? config.template(ctx) : config.template;
            spawnUnitsAtPoints(ctx.caster, template, positions, eng).forEach((unit, i) =>
                placed.push({ unit, at: positions[i]! }),
            );
        }

        placed.forEach(({ unit, at }, i) => config.onSpawned?.(ctx, unit, i, at));
        config.onBatchSpawned?.(ctx, placed.map((p) => p.unit));
    }
}

export function SpawnUnits(config: SpawnUnitsConfig): SpawnUnitsBehaviour {
    return new SpawnUnitsBehaviour(config);
}

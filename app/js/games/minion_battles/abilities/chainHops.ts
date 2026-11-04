/**
 * Chain hops: resolve the path of an effect that leaps from enemy to enemy (chain lightning, ricochets,
 * spreading curses). Pure and deterministic, so the targeting preview and the cast agree exactly.
 *
 * Each leap goes to an unvisited enemy within `jumpRange` of the current point (collected through
 * `CircleHitbox`), choosing the highest `priority` first, then the nearest, then the lowest id. When no
 * enemy is in reach, the chain may **relay** through a point (e.g. a `conductor` deployable) that has an
 * unvisited enemy within reach beyond it. Relays are free: they do not use up a jump.
 */
import type { Unit } from '../game/units/Unit';
import { CircleHitbox, type HitboxEngineContext } from '../hitboxes';

export interface ChainRelayPoint {
    id: string;
    x: number;
    y: number;
}

export type ChainHop =
    | { kind: 'unit'; unit: Unit; x: number; y: number }
    | { kind: 'relay'; relay: ChainRelayPoint; x: number; y: number };

export interface ResolveChainHopsOpts {
    engine: HitboxEngineContext;
    caster: Unit;
    /** The first enemy struck (always the first hop). */
    first: Unit;
    /** Leaps after the first hit. */
    maxJumps: number;
    /** Max reach (px) of one leap; target unit radius is added by the hitbox. */
    jumpRange: number;
    /** Higher goes first (e.g. Conductive stacks). Default 0 for all. */
    priority?: (unit: Unit) => number;
    /** Points the chain may pass through when no enemy is in reach. */
    relays?: readonly ChainRelayPoint[];
    /** Most relays one chain may use. Default 0. */
    maxRelays?: number;
}

function byIdThenDistance(ax: number, ay: number) {
    return (a: Unit, b: Unit): number => {
        const da = Math.hypot(a.x - ax, a.y - ay);
        const db = Math.hypot(b.x - ax, b.y - ay);
        return da - db || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    };
}

function enemiesInReach(opts: ResolveChainHopsOpts, x: number, y: number, visited: ReadonlySet<string>): Unit[] {
    return CircleHitbox.getUnitsInHitbox(opts.engine, opts.caster, x, y, opts.jumpRange)
        .filter((u) => !visited.has(u.id));
}

export function resolveChainHops(opts: ResolveChainHopsOpts): ChainHop[] {
    const priority = opts.priority ?? (() => 0);
    const hops: ChainHop[] = [{ kind: 'unit', unit: opts.first, x: opts.first.x, y: opts.first.y }];
    const visited = new Set<string>([opts.first.id]);
    const usedRelays = new Set<string>();
    let at = { x: opts.first.x, y: opts.first.y };
    let jumps = 0;
    let relays = 0;
    const maxRelays = opts.maxRelays ?? 0;

    while (jumps < opts.maxJumps) {
        const reach = enemiesInReach(opts, at.x, at.y, visited);
        if (reach.length > 0) {
            const distSort = byIdThenDistance(at.x, at.y);
            reach.sort((a, b) => priority(b) - priority(a) || distSort(a, b));
            const next = reach[0]!;
            hops.push({ kind: 'unit', unit: next, x: next.x, y: next.y });
            visited.add(next.id);
            at = { x: next.x, y: next.y };
            jumps++;
            continue;
        }
        if (relays >= maxRelays || !opts.relays) break;
        const relay = opts.relays
            .filter((r) => !usedRelays.has(r.id) && Math.hypot(r.x - at.x, r.y - at.y) <= opts.jumpRange)
            .filter((r) => enemiesInReach(opts, r.x, r.y, visited).length > 0)
            .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y)
                || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
        if (!relay) break;
        hops.push({ kind: 'relay', relay, x: relay.x, y: relay.y });
        usedRelays.add(relay.id);
        at = { x: relay.x, y: relay.y };
        relays++;
    }
    return hops;
}

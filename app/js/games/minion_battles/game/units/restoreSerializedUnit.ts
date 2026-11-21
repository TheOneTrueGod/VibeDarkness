import { createResourceFromId } from '../../resources/createResourceFromId';
import type { EngineContext } from '../EngineContext';
import type { EventBus } from '../EventBus';
import { Unit } from './Unit';

/**
 * Rebuild a unit from its serialized form, resources included. `Unit.fromJSON` alone leaves
 * `resources` empty, so anything reading costs (affordability, the ITS rewind view) must use this.
 * `ctx` primes resource display context (tile / proximity gain rates); omit it for read-only views.
 */
export function restoreSerializedUnit(
    data: Record<string, unknown>,
    eventBus: EventBus,
    currentGameTick: number,
    ctx?: EngineContext,
): Unit {
    const unit = Unit.fromJSON(data, eventBus, currentGameTick);
    const resourceData = data.resources as Record<string, unknown>[] | undefined;
    for (const rd of resourceData ?? []) {
        const resource = createResourceFromId(rd.id as string);
        if (!resource) continue;
        resource.restoreFromJSON(rd);
        unit.attachResource(resource, eventBus);
        // Fresh instances lose tile/proximity context that tooltips read;
        // prime immediately so gain rates show right after restore.
        if (ctx) resource.primeDisplayContext?.(unit, ctx);
    }
    return unit;
}

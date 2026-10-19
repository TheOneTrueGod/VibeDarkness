/**
 * Damage links: a `DamageLinkBuff` on a unit moves part of its HP loss onto another unit.
 *
 * The damage pipeline cannot look units up, so `applyDamageLinks` (called from
 * `applyDamageToUnitDetailed` after shields/armour) emits `damage_redirected` per link.
 * `registerDamageLinkListeners` (wired in `GameEngine`) applies the redirected hit synchronously
 * and marks the event handled; only handled shares are taken off the original unit. It also
 * removes links whose linked unit has died.
 */

import type { Unit } from './Unit';
import type { DamageRedirectedEvent, DamageVisualKind, EventBus } from '../EventBus';
import { DAMAGE_LINK_BUFF_TYPE, type DamageLinkBuff } from '../../buffs/DamageLinkBuff';

/**
 * Split `hpLoss` across the unit's damage links (in buff order; each link takes its fraction of
 * what is left). Emits one `damage_redirected` per link that takes a share. Returns the HP loss the
 * unit itself keeps.
 */
export function applyDamageLinks(
    unit: Unit,
    hpLoss: number,
    sourceUnitId: string | null,
    eventBus: EventBus,
    visualKind?: DamageVisualKind,
): number {
    if (hpLoss <= 0) return hpLoss;
    let kept = hpLoss;
    for (const buff of unit.buffs) {
        if (buff._type !== DAMAGE_LINK_BUFF_TYPE) continue;
        const link = buff as DamageLinkBuff;
        if (link.linkedUnitId === unit.id) continue;
        const redirected = kept * link.redirectFraction;
        if (redirected <= 0) continue;
        const event: DamageRedirectedEvent = {
            fromUnitId: unit.id,
            toUnitId: link.linkedUnitId,
            amount: redirected,
            shieldShare: link.linkedShieldShare,
            sourceUnitId,
            handled: false,
            ...(visualKind !== undefined ? { visualKind } : {}),
        };
        eventBus.emit('damage_redirected', event);
        if (event.handled) kept -= redirected;
    }
    return kept;
}

/** Remove every damage link on `units` that points at `linkedUnitId`. */
export function removeDamageLinksTo(units: readonly Unit[], linkedUnitId: string): void {
    for (const unit of units) {
        if (!unit.buffs.some((b) => b._type === DAMAGE_LINK_BUFF_TYPE)) continue;
        unit.buffs = unit.buffs.filter(
            (b) => b._type !== DAMAGE_LINK_BUFF_TYPE || (b as DamageLinkBuff).linkedUnitId !== linkedUnitId,
        );
    }
}

export interface DamageLinkListenerContext {
    eventBus: EventBus;
    getUnit(id: string): Unit | undefined;
    getUnits(): readonly Unit[];
}

/**
 * Apply redirected hits to the linked unit, and drop links to units that die. A redirected hit
 * never follows the linked unit's own links (`skipDamageLinks`). A dead or missing linked unit
 * leaves the event unhandled, so the original unit keeps that share.
 */
export function registerDamageLinkListeners(ctx: DamageLinkListenerContext): void {
    ctx.eventBus.on('damage_redirected', (event) => {
        if (event.handled) return;
        const linked = ctx.getUnit(event.toUnitId);
        if (!linked?.isAlive()) return;
        event.handled = true;
        linked.takeDamage(event.amount, event.sourceUnitId, ctx.eventBus, {
            ...(event.visualKind !== undefined ? { visualKind: event.visualKind } : {}),
            shieldShare: event.shieldShare,
            skipDamageLinks: true,
        });
    });
    ctx.eventBus.on('unit_died', (event) => {
        removeDamageLinksTo(ctx.getUnits(), event.unitId);
    });
}

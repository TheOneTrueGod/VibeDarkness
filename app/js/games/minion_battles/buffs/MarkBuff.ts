/**
 * MarkBuff — runtime for every mark (`buffs/marks/`). One buff per (unit, mark id). Re-applying adds stacks
 * up to the def's max and refreshes the duration. Consuming removes the mark and returns its stacks, so an
 * ability can scale a payoff by how marked the target was.
 *
 * One entry point per verb: `applyMark`, `getMarkStacks`, `consumeMark`. Abilities apply marks through the
 * `applyMarkToPrimaryTarget` ability-event effect where they can, and call `applyMark` from behaviours
 * otherwise. Serialized as `{ _type: 'mark', markId, stacks }` plus the base buff fields.
 */
import { Buff, type BuffSerialized } from './Buff';
import type { Unit } from '../game/units/Unit';
import type { BuffRenderEmitContext } from '../game/effects/buffParticleAura';
import { getMarkDef, type MarkRenderState } from './marks/markDefs';

export const MARK_BUFF_TYPE = 'mark';

interface MarkBuffSerialized extends BuffSerialized {
    markId: string;
    stacks: number;
}

export class MarkBuff extends Buff {
    readonly _type = MARK_BUFF_TYPE;
    readonly markId: string;
    stacks: number;
    /** Render-only; rebuilt from nothing after a restore. */
    private renderState: MarkRenderState | null = null;

    constructor(markId: string, stacks: number, durationSeconds: number) {
        super({ value: durationSeconds, unit: 'seconds' });
        this.markId = markId;
        this.stacks = stacks;
    }

    renderEmit(unit: Unit, ctx: BuffRenderEmitContext): void {
        const def = getMarkDef(this.markId);
        if (!def?.renderEmit) return;
        this.renderState ??= { stacks: this.stacks, accum: 0, count: 0 };
        this.renderState.stacks = this.stacks;
        def.renderEmit(unit, ctx, this.renderState);
    }

    override toJSON(): MarkBuffSerialized {
        return { ...super.toJSON(), markId: this.markId, stacks: this.stacks };
    }

    static fromSerialized(data: BuffSerialized): MarkBuff {
        const d = data as MarkBuffSerialized;
        const buff = new MarkBuff(d.markId, d.stacks ?? 1, data.durationValue);
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}

export function findMark(unit: Pick<Unit, 'buffs'>, markId: string): MarkBuff | undefined {
    for (const b of unit.buffs) {
        if (b instanceof MarkBuff && b.markId === markId) return b;
    }
    return undefined;
}

/** Stacks of `markId` on the unit (0 when unmarked or the mark has run out). */
export function getMarkStacks(unit: Pick<Unit, 'buffs'>, markId: string, gameTime?: number): number {
    const mark = findMark(unit, markId);
    if (!mark) return 0;
    if (gameTime !== undefined && mark.isExpired(gameTime, Number.MAX_SAFE_INTEGER)) return 0;
    return mark.stacks;
}

/**
 * Add `stacks` of `markId` (capped at the def's max) and refresh its duration. Unknown mark ids are a
 * content bug and do nothing. Returns the unit's stacks after the call.
 */
export function applyMark(
    unit: Unit,
    markId: string,
    stacks: number,
    gameTime: number,
    roundNumber: number,
): number {
    const def = getMarkDef(markId);
    if (!def || stacks <= 0 || !unit.isAlive()) return getMarkStacks(unit, markId);
    const existing = findMark(unit, markId);
    if (existing && !existing.isExpired(gameTime, roundNumber)) {
        existing.stacks = Math.min(def.maxStacks, existing.stacks + stacks);
        existing.appliedAtTime = gameTime;
        existing.appliedAtRound = roundNumber;
        return existing.stacks;
    }
    if (existing) unit.buffs = unit.buffs.filter((b) => b !== existing);
    const mark = new MarkBuff(markId, Math.min(def.maxStacks, stacks), def.durationSeconds);
    unit.addBuff(mark, gameTime, roundNumber);
    return mark.stacks;
}

/** Remove the mark and return how many stacks it had (0 when unmarked). */
export function consumeMark(unit: Pick<Unit, 'buffs'>, markId: string, gameTime?: number): number {
    const mark = findMark(unit, markId);
    if (!mark) return 0;
    const stacks = getMarkStacks(unit, markId, gameTime);
    unit.buffs = unit.buffs.filter((b) => b !== mark);
    return stacks;
}

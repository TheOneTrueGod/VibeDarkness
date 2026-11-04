/**
 * Mark registry. Built-in marks are listed here; content may add its own with `registerMarkDef` before
 * battle (as conjured weapons and deployables do). Lookups by id, so a mark round-trips as plain data.
 */
import type { MarkDef } from './markTypes';
import { CONDUCTIVE_MARK_DEF } from './conductiveMark';

const MARK_DEFS = new Map<string, MarkDef>([[CONDUCTIVE_MARK_DEF.id, CONDUCTIVE_MARK_DEF]]);

export function registerMarkDef(def: MarkDef): void {
    MARK_DEFS.set(def.id, def);
}

export function getMarkDef(markId: string): MarkDef | undefined {
    return MARK_DEFS.get(markId);
}

export type { MarkDef, MarkRenderState } from './markTypes';

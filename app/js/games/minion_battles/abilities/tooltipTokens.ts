/**
 * Named-token tooltip templates for ability descriptions.
 * Authors write `{{TOKEN}}` spans; binders resolve them to coloured segments.
 * Damage kind uses getAbilityDamageForDisplay (same formula as combat, display rounding).
 */

import type { Unit } from '../game/units/Unit';
import type { DamageModifier } from '../game/units/unitTypes';
import { getAbilityDamageForDisplay } from './damageModifiers';

/** Parsed / resolved tooltip span for AbilityTooltip (or bridge encoding). */
export interface TooltipSegment {
    text: string;
    role: 'static' | 'dynamic';
    /** Optional hex colour override (e.g. `#RRGGBB`). */
    color?: string;
}

/** Battle vs out-of-battle inputs for token resolution (no UI imports). */
export interface TooltipResolveContext {
    /** Battle: local player unit (combatSettings.damageModifier + passives). */
    attacker?: Unit;
    /**
     * Out-of-battle: same DamageModifier combat would bake at mission start.
     * Built from character research — no fake Unit required.
     */
    damageModifier?: DamageModifier;
    stackSize?: number;
    abilityId?: string;
    /** From ability.damageModifierMultiplier / overrides table. */
    abilityFlatScale?: number;
}

export type TooltipTokenBinding =
    | { kind: 'damage'; base: number }
    | { kind: 'plain'; value: string | number }
    | { kind: 'knockback'; tier: number };

export type TooltipTokenBindings = Record<string, TooltipTokenBinding>;

/** Intermediate parse result before kind resolution. */
export type ParsedTooltipPart =
    | { type: 'text'; value: string }
    | { type: 'token'; name: string };

const TOKEN_RE = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

/**
 * Display rounding for tooltip numbers (combat still uses integer Math.round).
 * abs ≥ 10 → Math.round; abs < 10 → nearest 0.1.
 */
export function formatTooltipNumber(n: number): string {
    const abs = Math.abs(n);
    const rounded = abs >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
    return String(rounded);
}

/**
 * Resolve a damage token: raw modified value (combat formula, no integer round),
 * then {@link formatTooltipNumber} for display.
 */
export function resolveDamageToken(base: number, ctx: TooltipResolveContext): string {
    return formatTooltipNumber(getAbilityDamageForDisplay(base, ctx));
}

export type TooltipTokenKindResolver = (
    binding: TooltipTokenBinding,
    ctx: TooltipResolveContext,
) => TooltipSegment;

const DEFAULT_KIND_RESOLVERS: Record<TooltipTokenBinding['kind'], TooltipTokenKindResolver> = {
    damage: (binding, ctx) => {
        const base = (binding as { kind: 'damage'; base: number }).base;
        return { text: resolveDamageToken(base, ctx), role: 'dynamic' };
    },
    plain: (binding) => {
        const value = (binding as { kind: 'plain'; value: string | number }).value;
        const text = typeof value === 'number' ? formatTooltipNumber(value) : String(value);
        return { text, role: 'dynamic' };
    },
    knockback: (binding) => {
        const tier = (binding as { kind: 'knockback'; tier: number }).tier;
        return { text: `knockback ${formatTooltipNumber(tier)}`, role: 'dynamic' };
    },
};

/**
 * Split a template into static text and `{{TOKEN}}` spans.
 * Leftover `{{` without a valid close is left as static text (does not crash).
 */
export function parseTooltipTemplate(line: string): ParsedTooltipPart[] {
    const parts: ParsedTooltipPart[] = [];
    TOKEN_RE.lastIndex = 0;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_RE.exec(line)) !== null) {
        if (m.index > lastIndex) {
            parts.push({ type: 'text', value: line.slice(lastIndex, m.index) });
        }
        parts.push({ type: 'token', name: m[1] });
        lastIndex = m.index + m[0].length;
    }
    if (lastIndex < line.length) {
        parts.push({ type: 'text', value: line.slice(lastIndex) });
    }
    return parts;
}

function resolveUnknownToken(name: string): never {
    throw new Error(`Unknown tooltip token: {{${name}}} (no binding)`);
}

/**
 * Parse + resolve one template line into TooltipSegments.
 * Unknown bound tokens throw (dev / tests); production callers should ensure bindings.
 */
export function resolveTooltipLine(
    line: string,
    bindings: TooltipTokenBindings,
    ctx: TooltipResolveContext,
    resolvers: Partial<Record<TooltipTokenBinding['kind'], TooltipTokenKindResolver>> = {},
): TooltipSegment[] {
    const kindResolvers = { ...DEFAULT_KIND_RESOLVERS, ...resolvers };
    const segments: TooltipSegment[] = [];
    for (const part of parseTooltipTemplate(line)) {
        if (part.type === 'text') {
            if (part.value.length > 0) {
                segments.push({ text: part.value, role: 'static' });
            }
            continue;
        }
        const binding = bindings[part.name];
        if (!binding) {
            resolveUnknownToken(part.name);
        }
        const resolveKind = kindResolvers[binding.kind];
        segments.push(resolveKind(binding, ctx));
    }
    return segments;
}

/** Resolve every template line into structured segment rows. */
export function formatTooltipLines(
    lines: readonly string[],
    bindings: TooltipTokenBindings,
    ctx: TooltipResolveContext,
): TooltipSegment[][] {
    return lines.map((line) => resolveTooltipLine(line, bindings, ctx));
}

/**
 * Bridge: encode resolved segments as legacy `{value}` / `{text:#hex}` strings so
 * `getTooltipText(): string[]` callers keep working with AbilityTooltip's string parser.
 */
export function encodeTooltipSegmentsToLegacyLine(segments: TooltipSegment[]): string {
    return segments
        .map((seg) => {
            if (seg.role === 'static') return seg.text;
            if (seg.color) return `{${seg.text}:${seg.color}}`;
            return `{${seg.text}}`;
        })
        .join('');
}

/** Encode each segment row to a legacy tooltip line string. */
export function encodeTooltipSegmentsToLegacyLines(segmentLines: TooltipSegment[][]): string[] {
    return segmentLines.map(encodeTooltipSegmentsToLegacyLine);
}

/**
 * Resolve templates then encode as legacy `{value}` lines for `getTooltipText` return type.
 */
export function formatTooltipLegacyLines(
    lines: readonly string[],
    bindings: TooltipTokenBindings,
    ctx: TooltipResolveContext,
): string[] {
    return encodeTooltipSegmentsToLegacyLines(formatTooltipLines(lines, bindings, ctx));
}

import type { ReactNode } from 'react';

/** One option of a `select` control. */
export interface StorybookSelectOption {
    value: string;
    label: string;
}

/** A setting in the Storybook's bottom control panel. `id` is the key in {@link StorybookControlValues}. */
export type StorybookControl =
    | { kind: 'select'; id: string; label: string; options: readonly StorybookSelectOption[]; defaultValue: string }
    | { kind: 'range'; id: string; label: string; min: number; max: number; step?: number; defaultValue: number; unit?: string }
    | { kind: 'toggle'; id: string; label: string; defaultValue: boolean }
    /** Typeahead text filter: free text, with `suggestions` offered as you type. Match with {@link matchesSearch}. */
    | {
          kind: 'search';
          id: string;
          label: string;
          placeholder?: string;
          suggestions?: readonly string[];
          defaultValue: string;
      }
    /**
     * A string kept in the URL but not drawn in the control panel: state the preview sets itself through
     * `setValue` (e.g. which sections are collapsed), so a link reopens the page the same way.
     */
    | { kind: 'state'; id: string; defaultValue: string };

export type StorybookControlValue = string | number | boolean;
export type StorybookControlValues = Readonly<Record<string, StorybookControlValue>>;
/** Sets one control by `id` (and so the URL). */
export type StorybookSetValue = (id: string, value: StorybookControlValue) => void;

/**
 * One entry in the admin Ideas tab's Storybook view. Add an entry to `STORYBOOK_ENTRIES`
 * (`storybookEntries.ts`) and it shows in the left list with its controls along the bottom.
 */
export interface StorybookEntry {
    /** URL slug: `/campaign/ideas/storybook/:id`. */
    id: string;
    name: string;
    /** One line under the name in the preview header. */
    description?: string;
    controls: readonly StorybookControl[];
    /**
     * Renders the examples for the current control values. `setValue` changes a control from inside the preview
     * (e.g. a "focus this tree" button), the same as editing it in the control panel.
     */
    render: (values: StorybookControlValues, setValue: StorybookSetValue) => ReactNode;
}

export function defaultStorybookValues(controls: readonly StorybookControl[]): Record<string, StorybookControlValue> {
    return Object.fromEntries(controls.map((c) => [c.id, c.defaultValue]));
}

export function controlString(values: StorybookControlValues, id: string): string {
    const v = values[id];
    return typeof v === 'string' ? v : String(v ?? '');
}

export function controlNumber(values: StorybookControlValues, id: string): number {
    const v = values[id];
    return typeof v === 'number' ? v : Number(v ?? 0);
}

export function controlBoolean(values: StorybookControlValues, id: string): boolean {
    return values[id] === true;
}

/** True when `query` is blank or a case-insensitive substring of any of `fields` (for `search` controls). */
export function matchesSearch(query: string, ...fields: readonly string[]): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return fields.some((f) => f.toLowerCase().includes(q));
}

/** URL value for a toggle that is on (`?pin=1`); `true` is also accepted when reading. */
const URL_TOGGLE_ON = '1';

/**
 * Control values from the page URL's query string, e.g. `?tree=training&node=mighty&pin=1`.
 * Each control reads the parameter named after its `id`; a missing or invalid value falls back to the default
 * (a `select` must name one of its options, a `range` is clamped to its bounds).
 */
export function storybookValuesFromSearchParams(
    controls: readonly StorybookControl[],
    params: URLSearchParams,
): Record<string, StorybookControlValue> {
    const values = defaultStorybookValues(controls);
    for (const c of controls) {
        const raw = params.get(c.id);
        if (raw == null) continue;
        switch (c.kind) {
            case 'search':
            case 'state':
                values[c.id] = raw;
                break;
            case 'select':
                if (c.options.some((o) => o.value === raw)) values[c.id] = raw;
                break;
            case 'toggle':
                values[c.id] = raw === URL_TOGGLE_ON || raw.toLowerCase() === 'true';
                break;
            case 'range': {
                const n = Number(raw);
                if (raw.trim() !== '' && Number.isFinite(n)) values[c.id] = Math.min(c.max, Math.max(c.min, n));
                break;
            }
        }
    }
    return values;
}

/** The query string for `values`: only controls that differ from their default, so a default page has a bare URL. */
export function storybookSearchParams(
    controls: readonly StorybookControl[],
    values: StorybookControlValues,
): URLSearchParams {
    const params = new URLSearchParams();
    for (const c of controls) {
        const v = values[c.id];
        if (v === undefined || v === c.defaultValue) continue;
        if (c.kind === 'toggle') {
            if (v === true) params.set(c.id, URL_TOGGLE_ON);
            else params.set(c.id, '0');
        } else {
            params.set(c.id, String(v));
        }
    }
    return params;
}

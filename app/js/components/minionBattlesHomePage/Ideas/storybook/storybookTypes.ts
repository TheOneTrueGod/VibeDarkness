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
      };

export type StorybookControlValue = string | number | boolean;
export type StorybookControlValues = Readonly<Record<string, StorybookControlValue>>;

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
    /** Renders the examples for the current control values. */
    render: (values: StorybookControlValues) => ReactNode;
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

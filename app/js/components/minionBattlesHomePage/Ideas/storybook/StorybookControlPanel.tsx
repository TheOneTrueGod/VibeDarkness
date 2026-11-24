import React from 'react';
import type { StorybookControl, StorybookControlValue, StorybookControlValues } from './storybookTypes';

/** Fixed height of the Storybook control panel, so the preview above never jumps between entries. */
export const STORYBOOK_CONTROL_PANEL_HEIGHT_CLASS = 'h-40';

const FIELD_LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-wide text-muted';
const INPUT_CLASS =
    'rounded border border-border-custom bg-dark-900 px-2 py-1 text-sm text-white focus:border-primary focus:outline-none';

function ControlField({
    control,
    value,
    onChange,
}: {
    control: StorybookControl;
    value: StorybookControlValue;
    onChange: (value: StorybookControlValue) => void;
}) {
    switch (control.kind) {
        case 'select':
            return (
                <label className="flex flex-col gap-1 min-w-[10rem]">
                    <span className={FIELD_LABEL_CLASS}>{control.label}</span>
                    <select value={String(value)} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
                        {control.options.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>
            );
        case 'range':
            return (
                <label className="flex flex-col gap-1 min-w-[12rem]">
                    <span className={FIELD_LABEL_CLASS}>
                        {control.label}{' '}
                        <span className="tabular-nums text-white">
                            {String(value)}
                            {control.unit ?? ''}
                        </span>
                    </span>
                    <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step ?? 1}
                        value={Number(value)}
                        onChange={(e) => onChange(Number(e.target.value))}
                        className="accent-primary"
                    />
                </label>
            );
        case 'search': {
            const listId = `storybook-search-${control.id}`;
            return (
                <label className="flex flex-col gap-1 min-w-[12rem]">
                    <span className={FIELD_LABEL_CLASS}>{control.label}</span>
                    <input
                        type="search"
                        value={String(value)}
                        placeholder={control.placeholder ?? 'Type to filter…'}
                        list={control.suggestions ? listId : undefined}
                        onChange={(e) => onChange(e.target.value)}
                        className={INPUT_CLASS}
                    />
                    {control.suggestions && (
                        <datalist id={listId}>
                            {control.suggestions.map((s) => (
                                <option key={s} value={s} />
                            ))}
                        </datalist>
                    )}
                </label>
            );
        }
        case 'toggle':
            return (
                <label className="flex items-center gap-2 self-end pb-1 text-sm text-gray-200 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={value === true}
                        onChange={(e) => onChange(e.target.checked)}
                        className="accent-primary"
                    />
                    {control.label}
                </label>
            );
        case 'state':
            // Set from the preview itself; only the URL carries it.
            return null;
    }
}

/** Storybook bottom panel: one field per control of the selected entry, plus Reset. */
export default function StorybookControlPanel({
    controls,
    values,
    onChange,
    onReset,
}: {
    controls: readonly StorybookControl[];
    values: StorybookControlValues;
    onChange: (id: string, value: StorybookControlValue) => void;
    onReset: () => void;
}) {
    return (
        <div
            className={`${STORYBOOK_CONTROL_PANEL_HEIGHT_CLASS} shrink-0 border-t border-border-custom bg-dark-900/60 px-4 py-3 overflow-y-auto`}
        >
            <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-300">Controls</span>
                {controls.length > 0 && (
                    <button
                        type="button"
                        onClick={onReset}
                        className="rounded border border-border-custom px-2 py-0.5 text-xs text-gray-300 hover:bg-surface-light hover:text-white"
                    >
                        Reset
                    </button>
                )}
            </div>
            {controls.length === 0 ? (
                <p className="text-sm text-muted">This entry has no controls.</p>
            ) : (
                <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                    {controls.map((control) => (
                        <ControlField
                            key={control.id}
                            control={control}
                            value={values[control.id] ?? control.defaultValue}
                            onChange={(v) => onChange(control.id, v)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

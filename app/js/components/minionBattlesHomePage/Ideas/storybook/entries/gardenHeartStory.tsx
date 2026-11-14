import React, { type ReactNode } from 'react';
import { FxArtTile, FxStyleSheet, type FxBackground, type FxPalette } from '../../ParticleFxPreview';
import {
    GARDEN_HEART_ART,
    GARDEN_HEART_PALETTES,
    GARDEN_HEART_STYLES,
    type GardenHeartPaletteOption,
} from '../../fxArt/gardenHeartArt';
import { controlBoolean, controlString, type StorybookControlValues, type StorybookEntry } from '../storybookTypes';

const ALL = 'all';
const CHOSEN_PALETTE = GARDEN_HEART_PALETTES.find((p) => p.chosen) ?? GARDEN_HEART_PALETTES[0];
const CHOSEN_STYLE = GARDEN_HEART_STYLES.find((s) => s.chosen) ?? GARDEN_HEART_STYLES[0];

/** Art pieces that show the Heart's look itself; the rest are fight pieces drawn in one palette. */
const isHeartPiece = (id: string) => id === 'gh-hearts' || id.startsWith('gh-heart-');
const retreatStyle = (id: string) => /^gh-retreat-(\w+)$/.exec(id)?.[1];

const toPalette = (p: GardenHeartPaletteOption): FxPalette => ({ name: p.name, primary: p.primary, secondary: p.secondary });

function SelectedBadge() {
    return <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[11px] font-semibold text-primary">Selected</span>;
}

function Swatch({ hex, label }: { hex: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-200">
            <span className="h-3.5 w-3.5 shrink-0 rounded-sm border border-white/20" style={{ backgroundColor: hex }} />
            {label}
            <code className="text-[11px] text-muted">{hex}</code>
        </span>
    );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-3">
            <div>
                <h4 className="text-sm font-semibold text-white">{title}</h4>
                {note && <p className="text-xs text-muted">{note}</p>}
            </div>
            {children}
        </section>
    );
}

function render(values: StorybookControlValues) {
    const paletteFilter = controlString(values, 'palette');
    const styleFilter = controlString(values, 'heart');
    const background = controlString(values, 'background') as FxBackground;
    const chosenOnly = controlBoolean(values, 'chosenOnly');

    const palettes = GARDEN_HEART_PALETTES.filter((p) => (chosenOnly ? p.chosen : paletteFilter === ALL || p.name === paletteFilter));
    const styles = GARDEN_HEART_STYLES.filter((s) => (chosenOnly ? s.chosen : styleFilter === ALL || s.id === styleFilter));
    /** Fight pieces use the picked palette, or the chosen one when every palette is shown. */
    const piecePalette = palettes.length === 1 ? palettes[0] : CHOSEN_PALETTE;
    const pieces = GARDEN_HEART_ART.filter((piece) => {
        if (isHeartPiece(piece.id)) return false;
        const style = retreatStyle(piece.id);
        return style === undefined || styles.some((s) => s.id === style);
    });

    return (
        <div className="flex flex-col gap-6">
            <FxStyleSheet />
            <Section title="Selected look" note="The look the plan settled on (plan 0006, The garden boss: The look).">
                <div className="flex flex-wrap items-start gap-4 rounded-md border border-primary bg-surface-light px-4 py-3">
                    <FxArtTile id={`gh-heart-${CHOSEN_STYLE.id}`} palette={toPalette(CHOSEN_PALETTE)} background={background} scale={1.3} />
                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-semibold text-white">
                            {CHOSEN_PALETTE.name} · {CHOSEN_STYLE.name}
                        </p>
                        <Swatch hex={CHOSEN_PALETTE.primary} label={`Primary: ${CHOSEN_PALETTE.primaryLabel}`} />
                        <Swatch hex={CHOSEN_PALETTE.secondary} label={`Secondary: ${CHOSEN_PALETTE.secondaryLabel}`} />
                        <p className="max-w-md text-xs text-gray-400">{CHOSEN_STYLE.note}</p>
                    </div>
                </div>
            </Section>

            <Section title="Palettes × Heart styles" note="Every option the artbook offered. The selected ones are marked.">
                <div className="overflow-x-auto">
                    <table className="border-separate border-spacing-2">
                        <thead>
                            <tr>
                                <th />
                                {styles.map((s) => (
                                    <th key={s.id} className="text-left align-bottom text-xs font-semibold text-muted">
                                        <span className="inline-flex items-center gap-2">
                                            {s.name}
                                            {s.chosen && <SelectedBadge />}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {palettes.map((p) => (
                                <tr key={p.name}>
                                    <td className="w-56 align-top pr-2">
                                        <p className="flex items-center gap-2 text-sm font-semibold text-white">
                                            {p.name}
                                            {p.chosen && <SelectedBadge />}
                                        </p>
                                        <div className="mt-1 flex flex-col gap-1">
                                            <Swatch hex={p.primary} label={p.primaryLabel} />
                                            <Swatch hex={p.secondary} label={p.secondaryLabel} />
                                        </div>
                                        <p className="mt-1 text-xs leading-snug text-gray-400">{p.note}</p>
                                    </td>
                                    {styles.map((s) => {
                                        const chosen = p.chosen && s.chosen;
                                        return (
                                            <td key={s.id} className="align-top">
                                                <div
                                                    data-chosen={chosen ? 'true' : undefined}
                                                    className={`rounded-md border p-1.5 ${chosen ? 'border-primary' : 'border-transparent'}`}
                                                >
                                                    <FxArtTile id={`gh-heart-${s.id}`} palette={toPalette(p)} background={background} />
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>

            <Section
                title={`Fight pieces in ${piecePalette.name}`}
                note="Pick a single palette to repaint these. Every piece draws the Heart in the selected style except the retreat variants."
            >
                <div className="flex flex-wrap items-start gap-4">
                    {pieces.map((piece) => (
                        <FxArtTile key={piece.id} id={piece.id} palette={toPalette(piecePalette)} background={background} />
                    ))}
                </div>
            </Section>
        </div>
    );
}

/** Every look the garden boss artbook offered, with the selected palette and Heart style marked. */
export const GARDEN_HEART_STORY: StorybookEntry = {
    id: 'garden-heart',
    name: 'Garden Heart',
    description: 'Garden boss looks: every palette and Heart style from the artbook, the selected pair marked, and the fight pieces.',
    controls: [
        {
            kind: 'select',
            id: 'palette',
            label: 'Palette',
            options: [{ value: ALL, label: 'All' }, ...GARDEN_HEART_PALETTES.map((p) => ({ value: p.name, label: p.chosen ? `${p.name} (selected)` : p.name }))],
            defaultValue: ALL,
        },
        {
            kind: 'select',
            id: 'heart',
            label: 'Heart',
            options: [{ value: ALL, label: 'All' }, ...GARDEN_HEART_STYLES.map((s) => ({ value: s.id, label: s.chosen ? `${s.name} (selected)` : s.name }))],
            defaultValue: ALL,
        },
        {
            kind: 'select',
            id: 'background',
            label: 'Background',
            options: [
                { value: 'dark', label: 'Darkness' },
                { value: 'ground', label: 'Lit ground' },
            ],
            defaultValue: 'dark',
        },
        { kind: 'toggle', id: 'chosenOnly', label: 'Selected only', defaultValue: false },
    ],
    render,
};

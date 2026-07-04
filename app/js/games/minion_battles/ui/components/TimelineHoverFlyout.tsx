import React from 'react';
import type { AbilityStatic } from '../../abilities/Ability';
import type { Unit } from '../../game/units/Unit';
import { getUnitUiDescription } from '../../game/units/unit_defs/unitDef';
import { getAbilityUseConfig } from '../../abilities/abilityUses';

function ensureSvgViewBox(svg: string): string {
    if (svg.includes('viewBox')) return svg;
    const w = svg.match(/width="(\d+(?:\.\d+)?)"/)?.[1];
    const h = svg.match(/height="(\d+(?:\.\d+)?)"/)?.[1];
    if (!w || !h) return svg;
    return svg.replace('<svg ', `<svg viewBox="0 0 ${w} ${h}" `);
}

function AbilityIconInBox({ html, className = '' }: { html: string; className?: string }) {
    return (
        <div
            className={`flex min-h-0 min-w-0 items-center justify-center [&>img]:max-h-full [&>img]:max-w-full [&>img]:min-h-0 [&>img]:min-w-0 [&>img]:h-full [&>img]:w-full [&>img]:object-contain [&>svg]:block [&>svg]:h-full [&>svg]:w-full [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:min-h-0 [&>svg]:min-w-0 ${className}`}
            dangerouslySetInnerHTML={{ __html: ensureSvgViewBox(html) }}
        />
    );
}

function hpBarColor(ratio: number): string {
    if (ratio > 0.5) return '#22c55e';
    if (ratio > 0.25) return '#eab308';
    return '#ef4444';
}

function TimelineUnitCard({ unit }: { unit: Unit }) {
    const ratio = unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.maxHp)) : 0;
    const injuryRatio = unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hpInjury / unit.maxHp)) : 0;
    const description = getUnitUiDescription(unit.characterId);

    return (
        <div className="w-[220px] rounded-lg border border-dark-500 bg-dark-800/95 px-3 py-2 shadow-lg ring-1 ring-black/40">
            <div className="text-sm font-semibold text-gray-100">{unit.name}</div>
            <div className="mt-1.5 flex items-center gap-2">
                <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-dark-900">
                    <div
                        className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-150"
                        style={{
                            width: `${ratio * 100}%`,
                            backgroundColor: hpBarColor(ratio),
                        }}
                    />
                    {injuryRatio > 0 && (
                        <div
                            className="absolute right-0 top-0 h-full rounded-full bg-black"
                            style={{ width: `${injuryRatio * 100}%` }}
                        />
                    )}
                </div>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-gray-300">
                    {Math.max(0, Math.floor(unit.hp))}/{Math.floor(unit.getEffectiveMaxHp())}
                </span>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-gray-400">{description}</p>
        </div>
    );
}

function TimelineAbilityPreviewCard({ ability, unit }: { ability: AbilityStatic; unit: Unit }) {
    const config = getAbilityUseConfig(ability.id);
    const maxDurability = Math.max(1, config.maxUses);
    const usesLeft = unit.abilityRuntime[ability.id]?.currentUses ?? maxDurability;

    return (
        <div className="w-[104px] shrink-0 rounded-lg border-2 border-dark-500 bg-dark-700 p-2 shadow-lg ring-1 ring-black/30">
            <div className="flex h-16 w-full items-center justify-center">
                <AbilityIconInBox html={ability.image} className="h-full w-full" />
            </div>
            <span className="mt-1 block text-center text-[13px] font-medium leading-tight text-white">
                {ability.name}
            </span>
            <div className="mt-1 flex w-full items-center gap-1">
                <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-gray-600 bg-black" aria-hidden />
                    <span className="relative z-10 font-mono text-[11px] font-semibold text-white tabular-nums">
                        {usesLeft}
                    </span>
                </div>
                <div className="flex min-w-0 flex-1 gap-0.5">
                    {Array.from({ length: maxDurability }, (_, i) => (
                        <div
                            key={i}
                            className="h-2 min-w-0 flex-1 overflow-hidden rounded-[2px] border border-gray-600 bg-dark-800"
                        >
                            <div
                                className={`h-full w-full rounded-[1px] ${i < usesLeft ? 'bg-gray-500' : 'bg-transparent'}`}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export interface TimelineHoverFlyoutProps {
    unit: Unit;
    ability: AbilityStatic;
    /** Timeline phase strip (player rows): label/description from the hovered segment. */
    phaseLabel?: string;
    phaseDescription?: string;
}

/** Unit summary + hand-style ability card; hangs off the right of the battle timeline panel. */
export function TimelineHoverFlyout({ unit, ability, phaseLabel, phaseDescription }: TimelineHoverFlyoutProps) {
    const showPhase = !!(phaseLabel?.trim() || phaseDescription?.trim());

    return (
        <div className="flex flex-col items-start gap-2">
            {showPhase && (
                <div className="w-[220px] rounded-lg border border-primary/35 bg-dark-800/95 px-3 py-2 shadow-lg ring-1 ring-black/40">
                    {phaseLabel?.trim() ? (
                        <div className="text-sm font-semibold text-gray-100">{phaseLabel.trim()}</div>
                    ) : null}
                    {phaseDescription?.trim() ? (
                        <div className="mt-1 text-[11px] leading-snug text-gray-300">{phaseDescription.trim()}</div>
                    ) : null}
                </div>
            )}
            <TimelineUnitCard unit={unit} />
            <TimelineAbilityPreviewCard ability={ability} unit={unit} />
        </div>
    );
}

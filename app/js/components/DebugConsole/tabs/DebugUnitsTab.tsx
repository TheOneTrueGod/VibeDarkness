import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameStatePayload } from '../../../types';
import { DebugButton } from '../DebugButton';

interface MouseDebugBridge {
    __minionBattlesDebugSetUnitHover?: (unitId: string | null) => void;
    __minionBattlesDebugGameState?: Record<string, unknown> | null;
}

interface DebugUnitsTabProps {
    isActive: boolean;
    inBattle: boolean;
    gameState: GameStatePayload | null;
}

type DebugUnit = Record<string, unknown> & {
    id: string;
    name?: unknown;
    characterId?: unknown;
    teamId?: unknown;
    ownerId?: unknown;
    hp?: unknown;
    maxHp?: unknown;
    cooldownRemaining?: unknown;
    corruptionProgress?: unknown;
    radius?: unknown;
    aiContext?: {
        aiStateSerialized?: Record<string, unknown> | undefined;
        defensePointTargetId?: string;
        aiTargetUnitId?: string;
        corruptingTargetId?: string;
        corruptingStartedAt?: number;
        [k: string]: unknown;
    };
    activeAbilities?: unknown[];
    abilities?: string[];
    abilityNote?: unknown;
    movement?: unknown;
};

export default function DebugUnitsTab({ isActive, inBattle, gameState }: DebugUnitsTabProps) {
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
    const [unitStateOpen, setUnitStateOpen] = useState(false);
    const [aiStateOpen, setAiStateOpen] = useState(false);
    const [abilitiesOpen, setAbilitiesOpen] = useState(false);

    // Lazy-load portrait assets only when the user opens the Units debug tab.
    const [getPortraitFn, setGetPortraitFn] = useState<((id: string) => { picture: string } | undefined) | null>(null);
    const portraitUriCacheRef = useRef<Map<string, string>>(new Map());

    // Lazy-load ability registry for ability names and metadata.
    const [getAbilityFn, setGetAbilityFn] = useState<
        ((id: string) => { name: string; cooldownTime: number; prefireTime: number } | undefined) | null
    >(null);

    // Poll live engine state when in battle so Units tab stays up to date
    const [liveGameState, setLiveGameState] = useState<Record<string, unknown> | null>(null);
    useEffect(() => {
        if (!isActive || !inBattle) return;
        const id = window.setInterval(() => {
            const live = (window as unknown as MouseDebugBridge).__minionBattlesDebugGameState;
            setLiveGameState(live ?? null);
        }, 100);
        return () => window.clearInterval(id);
    }, [isActive, inBattle]);

    const units = useMemo(() => {
        const source = liveGameState ?? (gameState?.game as Record<string, unknown> | undefined);
        if (!source) return [];
        const raw = (source as { units?: unknown }).units;
        if (!Array.isArray(raw)) return [];
        return raw.filter(
            (u): u is DebugUnit => typeof u === 'object' && u !== null && typeof (u as any).id === 'string',
        );
    }, [gameState, liveGameState]);

    useEffect(() => {
        // When not in battle, units are irrelevant; clear selection and any hover highlight.
        if (!inBattle) {
            setSelectedUnitId(null);
            setHoveredUnitId(null);
            setUnitStateOpen(false);
            setAiStateOpen(false);
            setAbilitiesOpen(false);
            (window as unknown as MouseDebugBridge).__minionBattlesDebugSetUnitHover?.(null);
            return;
        }

        // When leaving the tab, clear any unit hover outline in the Pixi world.
        if (!isActive) {
            setHoveredUnitId(null);
            (window as unknown as MouseDebugBridge).__minionBattlesDebugSetUnitHover?.(null);
        }
    }, [inBattle, isActive]);

    useEffect(() => {
        if (!isActive || !inBattle || getPortraitFn) return;
        void import('../../../games/minion_battles/character_defs/portraits')
            .then((mod) => {
                setGetPortraitFn(
                    () =>
                        (mod as unknown as { getPortrait: (id: string) => unknown }).getPortrait as (id: string) => { picture: string } | undefined,
                );
            })
            .catch(() => {
                // Non-fatal: units will fall back to placeholders.
                setGetPortraitFn(null);
            });
    }, [inBattle, getPortraitFn, isActive]);

    useEffect(() => {
        if (!isActive || !inBattle || getAbilityFn) return;
        void import('../../../games/minion_battles/abilities/AbilityRegistry')
            .then((mod) => {
                setGetAbilityFn(
                    () => (mod as { getAbility: (id: string) => { name: string; cooldownTime: number; prefireTime: number } | undefined }).getAbility,
                );
            })
            .catch(() => setGetAbilityFn(null));
    }, [inBattle, getAbilityFn, isActive]);

    const getPortraitDataUri = useCallback(
        (characterId: unknown): string | null => {
            if (!getPortraitFn) return null;
            const cid = typeof characterId === 'string' ? characterId : null;
            if (!cid) return null;

            const cached = portraitUriCacheRef.current.get(cid);
            if (cached) return cached;

            const portrait = getPortraitFn(cid) as unknown as { picture?: string } | undefined;
            const picture = portrait?.picture;
            if (!picture) return null;

            const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(picture)}`;
            portraitUriCacheRef.current.set(cid, uri);
            return uri;
        },
        [getPortraitFn],
    );

    const findUnitById = useCallback(
        (id: string | null) => {
            if (!id) return null;
            return units.find((u) => u.id === id) ?? null;
        },
        [units],
    );

    const selectedUnit = useMemo(() => findUnitById(selectedUnitId), [findUnitById, selectedUnitId]);

    useEffect(() => {
        // Collapse expanders when switching which unit is being inspected.
        setUnitStateOpen(false);
        setAiStateOpen(false);
        setAbilitiesOpen(false);
    }, [selectedUnitId]);

    if (!isActive) return null;

    return (
        <div className="flex flex-1 min-h-0 gap-3 h-full overflow-hidden">
            <div className="flex flex-col shrink-0 w-56 border-r border-border-custom pr-2 min-h-0 overflow-hidden">
                <div className="px-2 py-1 text-[11px] text-muted font-mono border-b border-border-custom">
                    Units ({units.length})
                </div>
                <div className="flex-1 overflow-auto">
                    {units.length === 0 ? (
                        <p className="m-0 text-muted text-sm">No units in state.</p>
                    ) : (
                        <div className="flex flex-col">
                            {units.map((u) => {
                                const unitId = u.id as string;
                                const name = typeof u.name === 'string' ? u.name : unitId;
                                const characterId = typeof u.characterId === 'string' ? u.characterId : undefined;
                                const portraitSrc = characterId ? getPortraitDataUri(characterId) : null;
                                const isSelected = selectedUnitId === unitId;
                                const isHovered = hoveredUnitId === unitId;

                                return (
                                    <button
                                        key={unitId}
                                        type="button"
                                        className={`text-left px-2 py-1.5 rounded text-sm truncate ${
                                            isSelected
                                                ? 'bg-primary/30 text-primary border border-primary/60'
                                                : isHovered
                                                  ? 'bg-primary/20 text-primary border border-primary/30'
                                                  : 'text-white hover:bg-border-custom'
                                        }`}
                                        onMouseEnter={() => {
                                            setHoveredUnitId(unitId);
                                            (window as unknown as MouseDebugBridge).__minionBattlesDebugSetUnitHover?.(unitId);
                                        }}
                                        onMouseLeave={() => {
                                            setHoveredUnitId(null);
                                            (window as unknown as MouseDebugBridge).__minionBattlesDebugSetUnitHover?.(null);
                                        }}
                                        onClick={() => setSelectedUnitId(unitId)}
                                        title={name}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-6 h-6 rounded border border-border-custom bg-surface-light/20 overflow-hidden flex items-center justify-center shrink-0">
                                                {portraitSrc ? (
                                                    <img src={portraitSrc} alt={name} className="w-6 h-6 block" />
                                                ) : (
                                                    <span className="text-[10px] text-muted font-mono">
                                                        {name.charAt(0).toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="truncate">
                                                {name}{' '}
                                                <span className="text-[11px] text-muted">({unitId})</span>
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 min-w-0 overflow-auto min-h-0">
                {!selectedUnit ? (
                    <p className="m-0 text-muted text-sm">Select a unit to inspect.</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded border border-border-custom bg-surface-light/20 overflow-hidden flex items-center justify-center shrink-0">
                                {(() => {
                                    const characterId = typeof selectedUnit.characterId === 'string' ? selectedUnit.characterId : undefined;
                                    const portraitSrc = characterId ? getPortraitDataUri(characterId) : null;
                                    if (portraitSrc) {
                                        const name = typeof selectedUnit.name === 'string' ? selectedUnit.name : selectedUnit.id;
                                        return <img src={portraitSrc} alt={String(name)} className="w-10 h-10 block" />;
                                    }
                                    const name = typeof selectedUnit.name === 'string' ? selectedUnit.name : String(selectedUnit.id);
                                    return <span className="text-sm text-muted font-mono">{name.charAt(0).toUpperCase()}</span>;
                                })()}
                            </div>
                            <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">
                                    {typeof selectedUnit.name === 'string' ? selectedUnit.name : String(selectedUnit.id)}
                                </div>
                                <div className="text-[11px] text-muted font-mono truncate">{String(selectedUnit.id)}</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                            <span className="text-muted">characterId</span>
                            <span className="text-white">{typeof selectedUnit.characterId === 'string' ? selectedUnit.characterId : '-'}</span>

                            <span className="text-muted">teamId</span>
                            <span className="text-white">{typeof selectedUnit.teamId === 'string' ? selectedUnit.teamId : '-'}</span>

                            <span className="text-muted">ownerId</span>
                            <span className="text-white">{typeof selectedUnit.ownerId === 'string' ? selectedUnit.ownerId : '-'}</span>

                            <span className="text-muted">HP</span>
                            <span className="text-white">
                                {typeof selectedUnit.hp === 'number' ? selectedUnit.hp : '-'} / {typeof selectedUnit.maxHp === 'number' ? selectedUnit.maxHp : '-'}
                            </span>

                            <span className="text-muted">cooldown</span>
                            <span className="text-white">
                                {typeof selectedUnit.cooldownRemaining === 'number' ? selectedUnit.cooldownRemaining : '-'}
                            </span>

                            <span className="text-muted">corruption</span>
                            <span className="text-white">
                                {typeof selectedUnit.corruptionProgress === 'number' ? selectedUnit.corruptionProgress : '-'}
                            </span>

                            <span className="text-muted">movement.pathLen</span>
                            <span className="text-white">
                                {selectedUnit.movement && typeof (selectedUnit.movement as any).path !== 'undefined'
                                    ? (selectedUnit.movement as any)?.path?.length ?? '-'
                                    : '-'}
                            </span>

                            <span className="text-muted">movement.dest</span>
                            <span className="text-white">
                                {(() => {
                                    const movement = selectedUnit.movement as any;
                                    const path = Array.isArray(movement?.path)
                                        ? (movement.path as Array<{ col: number; row: number }>)
                                        : null;
                                    if (!path || path.length === 0) return '-';
                                    const last = path[path.length - 1];
                                    if (typeof last?.col !== 'number' || typeof last?.row !== 'number') return '-';
                                    return `(${last.col},${last.row})`;
                                })()}
                            </span>

                            <span className="text-muted">activeAbilities</span>
                            <span className="text-white">
                                {Array.isArray((selectedUnit as any).activeAbilities)
                                    ? (selectedUnit as any).activeAbilities.length
                                    : '-'}
                            </span>
                        </div>

                        <DebugButton onClick={() => setAbilitiesOpen((v) => !v)}>Abilities</DebugButton>
                        {abilitiesOpen && (
                            <div className="border border-border-custom rounded bg-surface-light/20 p-2 overflow-auto max-h-72">
                                {(() => {
                                    const abilityIds = Array.isArray(selectedUnit.abilities) ? (selectedUnit.abilities as string[]) : [];
                                    const activeList = Array.isArray((selectedUnit as any).activeAbilities)
                                        ? ((selectedUnit as any).activeAbilities as Array<{
                                              abilityId: string;
                                              startTime: number;
                                              targets: unknown[];
                                              fired?: boolean;
                                          }>)
                                        : [];
                                    const activeMap = new Map(activeList.map((a) => [a.abilityId, a]));

                                    return (
                                        <div className="flex flex-col gap-3">
                                            {abilityIds.length === 0 ? (
                                                <p className="m-0 text-muted text-sm">No abilities.</p>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    {abilityIds.map((abilityId) => {
                                                        const def = getAbilityFn?.(abilityId);
                                                        const active = activeMap.get(abilityId);
                                                        return (
                                                            <div
                                                                key={abilityId}
                                                                className="border-b border-border-custom/50 pb-2 last:border-0 last:pb-0"
                                                            >
                                                                <div className="font-mono text-xs font-semibold text-white">
                                                                    {def?.name ?? abilityId}
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs mt-1">
                                                                    <span className="text-muted">status</span>
                                                                    <span className="text-white">{active ? 'active' : 'ready'}</span>
                                                                    {def && (
                                                                        <>
                                                                            <span className="text-muted">cooldownTime</span>
                                                                            <span className="text-white">{def.cooldownTime}s</span>
                                                                            <span className="text-muted">prefireTime</span>
                                                                            <span className="text-white">{def.prefireTime}s</span>
                                                                        </>
                                                                    )}
                                                                    {active && (
                                                                        <>
                                                                            <span className="text-muted">startTime</span>
                                                                            <span className="text-white">{active.startTime.toFixed(2)}</span>
                                                                            <span className="text-muted">fired</span>
                                                                            <span className="text-white">{active.fired ? 'yes' : 'no'}</span>
                                                                            <span className="text-muted">targets</span>
                                                                            <span className="text-white">{JSON.stringify(active.targets)}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {(selectedUnit as any).abilityNote && (
                                                <div className="mt-2 pt-2 border-t border-border-custom">
                                                    <div className="text-muted text-xs">abilityNote</div>
                                                    <pre className="m-0 font-mono text-xs text-white whitespace-pre-wrap break-all">
                                                        {JSON.stringify((selectedUnit as any).abilityNote, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        <DebugButton onClick={() => setAiStateOpen((v) => !v)}>AI state</DebugButton>
                        {aiStateOpen && (
                            <div className="border border-border-custom rounded bg-surface-light/20 p-2 overflow-auto max-h-72">
                                {(() => {
                                    const aiContext = selectedUnit.aiContext as any | undefined;
                                    const aiState = aiContext?.aiStateSerialized as Record<string, unknown> | undefined;
                                    const stateId = typeof aiState?.stateId === 'string' ? aiState.stateId : '-';
                                    return (
                                        <div className="flex flex-col gap-2">
                                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                                                <span className="text-muted">stateId</span>
                                                <span className="text-white">{stateId}</span>
                                            </div>
                                            <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
                                                <code>{aiState ? JSON.stringify(aiState, null, 2) : '{ }'}</code>
                                            </pre>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        <DebugButton onClick={() => setUnitStateOpen((v) => !v)}>unitState</DebugButton>
                        {unitStateOpen && (
                            <div className="border border-border-custom rounded bg-surface-light/20 p-2 overflow-auto max-h-72">
                                <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
                                    <code>{JSON.stringify(selectedUnit, null, 2)}</code>
                                </pre>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}


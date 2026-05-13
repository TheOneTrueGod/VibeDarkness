import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameStatePayload } from '../../../types';
import type { LobbyClient } from '../../../LobbyClient';
import type { BattleOrderRecord } from '../../../types';
import DebugExpandableOrder from './DebugExpandableOrder';

interface DebugOrdersTabProps {
    isActive: boolean;
    inBattle: boolean;
    gameState: GameStatePayload | null;
    /** Live battle order log (when in a Minion Battles lobby). */
    battleOrdersDebug?: {
        lobbyClient: LobbyClient;
        lobbyId: string;
        gameId: string | null;
        playerId: string;
    } | null;
}

/** Orders list from the synced lobby game payload (checkpoint merge), not a debug-only overlay. */
function ordersFromGameState(gameState: GameStatePayload | null): unknown[] {
    const game = gameState?.game as Record<string, unknown> | undefined;
    if (!game) return [];
    const raw = game.orders;
    return Array.isArray(raw) ? raw : [];
}

function unitsFromGameState(gameState: GameStatePayload | null): { id: string; name: string }[] {
    const game = gameState?.game as Record<string, unknown> | undefined;
    if (!game) return [];
    const raw = game.units;
    if (!Array.isArray(raw)) return [];
    const out: { id: string; name: string }[] = [];
    for (const u of raw) {
        if (u == null || typeof u !== 'object') continue;
        const rec = u as Record<string, unknown>;
        const id = rec.id;
        if (typeof id !== 'string') continue;
        const n = rec.name;
        const name = typeof n === 'string' && n.length > 0 ? n : id;
        out.push({ id, name });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return out;
}

function orderUnitId(entry: unknown): string | null {
    if (entry == null || typeof entry !== 'object') return null;
    const order = (entry as { order?: unknown }).order;
    if (order == null || typeof order !== 'object') return null;
    const uid = (order as Record<string, unknown>).unitId;
    return typeof uid === 'string' ? uid : null;
}

function innerOrder(entry: unknown): Record<string, unknown> | null {
    if (entry == null || typeof entry !== 'object') return null;
    const raw = (entry as Record<string, unknown>).order;
    if (raw == null || typeof raw !== 'object') return null;
    return raw as Record<string, unknown>;
}

/** Persisted rows use `atTick`; checkpoint `game.orders` uses `gameTick`. */
function orderEntryTick(entry: unknown): number {
    if (entry == null || typeof entry !== 'object') return -1;
    const e = entry as Record<string, unknown>;
    if (typeof e.atTick === 'number' && !Number.isNaN(e.atTick)) return e.atTick;
    if (typeof e.gameTick === 'number' && !Number.isNaN(e.gameTick)) return e.gameTick;
    return -1;
}

function unitIndexFromGameState(gameState: GameStatePayload | null): Map<string, { name: string; ownerId: string }> {
    const game = gameState?.game as Record<string, unknown> | undefined;
    if (!game) return new Map();
    const raw = game.units;
    if (!Array.isArray(raw)) return new Map();
    const map = new Map<string, { name: string; ownerId: string }>();
    for (const u of raw) {
        if (u == null || typeof u !== 'object') continue;
        const rec = u as Record<string, unknown>;
        const id = rec.id;
        if (typeof id !== 'string') continue;
        const n = rec.name;
        const name = typeof n === 'string' && n.length > 0 ? n : id;
        const ownerRaw = rec.ownerId;
        const ownerId = typeof ownerRaw === 'string' ? ownerRaw : '?';
        map.set(id, { name, ownerId });
    }
    return map;
}

function resolveOwnerPlayerId(entry: unknown, unitById: Map<string, { ownerId: string }>): string | null {
    if (entry == null || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.playerId === 'string') return e.playerId;
    const uid = orderUnitId(entry);
    if (uid == null) return null;
    return unitById.get(uid)?.ownerId ?? null;
}

function formatMoveSummary(entry: unknown): string {
    const ord = innerOrder(entry);
    if (!ord) return '—';
    const path = ord.movePath;
    if (path == null) return '—';
    if (!Array.isArray(path) || path.length === 0) return '—';
    const cells: { col: number; row: number }[] = [];
    for (const c of path) {
        if (c == null || typeof c !== 'object') continue;
        const r = c as Record<string, unknown>;
        const col = r.col;
        const row = r.row;
        if (typeof col === 'number' && typeof row === 'number') cells.push({ col, row });
    }
    if (cells.length === 0) return '—';
    const fmt = (p: { col: number; row: number }) => `[${p.col}, ${p.row}]`;
    if (cells.length <= 4) return cells.map(fmt).join(', ');
    return `${cells.slice(0, 2).map(fmt).join(', ')}, …, ${cells.slice(-2).map(fmt).join(', ')}`;
}

function stableOrderListKey(entry: unknown, index: number): string {
    if (entry != null && typeof entry === 'object') {
        const h = (entry as Record<string, unknown>).idHash;
        if (typeof h === 'string' && h.length > 0) return h;
    }
    const tick = orderEntryTick(entry);
    const uid = orderUnitId(entry) ?? '?';
    return `${tick}-${uid}-${index}`;
}

const DEFAULT_SWATCH = '#22c55e';

export default function DebugOrdersTab({
    isActive,
    inBattle,
    gameState,
    battleOrdersDebug = null,
}: DebugOrdersTabProps) {
    const ordersLegacy = useMemo(() => ordersFromGameState(gameState), [gameState]);
    const unitOptions = useMemo(() => unitsFromGameState(gameState), [gameState]);

    const [ordersLive, setOrdersLive] = useState<BattleOrderRecord[]>([]);
    const [liveError, setLiveError] = useState<string | null>(null);

    const [filterUnitId, setFilterUnitId] = useState<string | null>(null);
    const [unitMenuOpen, setUnitMenuOpen] = useState(false);
    const [unitSearch, setUnitSearch] = useState('');
    const unitMenuRef = useRef<HTMLDivElement | null>(null);

    const usesLiveOrders = battleOrdersDebug != null && battleOrdersDebug.gameId != null;
    const sourceOrders: unknown[] = usesLiveOrders ? ordersLive : ordersLegacy;

    const filteredOrders = useMemo(() => {
        if (filterUnitId == null) return sourceOrders;
        return sourceOrders.filter((o) => orderUnitId(o) === filterUnitId);
    }, [sourceOrders, filterUnitId]);

    useEffect(() => {
        if (!isActive || !inBattle || !usesLiveOrders || !battleOrdersDebug) {
            return;
        }
        const { lobbyClient, lobbyId, gameId, playerId } = battleOrdersDebug;
        let cancelled = false;

        const tick = async () => {
            try {
                const range = await lobbyClient.getBattleOrdersRange(lobbyId, gameId!, {
                    playerId,
                });
                if (!cancelled) {
                    setOrdersLive(range.orders);
                    setLiveError(null);
                }
            } catch (e) {
                if (!cancelled) {
                    setLiveError(e instanceof Error ? e.message : String(e));
                }
            }
        };

        void tick();
        const id = window.setInterval(() => void tick(), 2000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [battleOrdersDebug, inBattle, isActive, usesLiveOrders]);

    useEffect(() => {
        if (!unitMenuOpen) return;
        const onDown = (e: MouseEvent) => {
            const el = unitMenuRef.current;
            if (el && !el.contains(e.target as Node)) {
                setUnitMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [unitMenuOpen]);

    useEffect(() => {
        if (filterUnitId != null && !unitOptions.some((u) => u.id === filterUnitId)) {
            setFilterUnitId(null);
        }
    }, [filterUnitId, unitOptions]);

    const sortedOrderCards = useMemo(() => {
        const unitById = unitIndexFromGameState(gameState);
        const players = gameState?.players ?? {};
        const sorted = [...filteredOrders].sort((a, b) => orderEntryTick(b) - orderEntryTick(a));
        return sorted.map((entry, index) => {
            const tick = orderEntryTick(entry);
            const uid = orderUnitId(entry);
            const uinfo = uid != null ? unitById.get(uid) : undefined;
            const unitName = uinfo?.name ?? uid ?? '—';
            const ownerPid = resolveOwnerPlayerId(entry, unitById);
            const ownerPlayer = ownerPid != null ? players[ownerPid] : undefined;
            const ownerDisplay = ownerPid != null ? (ownerPlayer?.name ?? ownerPid) : '—';
            const swatch =
                ownerPlayer != null &&
                typeof ownerPlayer.color === 'string' &&
                ownerPlayer.color.length > 0
                    ? ownerPlayer.color
                    : DEFAULT_SWATCH;
            const ord = innerOrder(entry);
            const abilityId =
                ord != null && typeof ord.abilityId === 'string' ? ord.abilityId : '—';
            const moveSummary = formatMoveSummary(entry);
            return (
                <DebugExpandableOrder
                    key={stableOrderListKey(entry, index)}
                    entry={entry}
                    unitName={unitName}
                    ownerDisplay={ownerDisplay}
                    tick={tick}
                    abilityId={abilityId}
                    moveSummary={moveSummary}
                    swatchColor={swatch}
                />
            );
        });
    }, [filteredOrders, gameState]);

    if (!isActive) return null;

    const searchLower = unitSearch.trim().toLowerCase();
    const visibleUnits = unitOptions.filter((u) => u.id.toLowerCase().includes(searchLower));

    const filterLabel =
        filterUnitId == null
            ? 'All units'
            : (() => {
                  const u = unitOptions.find((x) => x.id === filterUnitId);
                  if (!u) return filterUnitId;
                  return u.name === u.id ? u.id : `${u.name} · ${u.id}`;
              })();

    const openMenu = () => {
        setUnitSearch('');
        setUnitMenuOpen(true);
    };

    const selectUnit = (id: string | null) => {
        setFilterUnitId(id);
        setUnitMenuOpen(false);
        setUnitSearch('');
    };

    const ordersSourceLabel = usesLiveOrders
        ? 'GET …/games/{gameId}/orders (persisted battle log)'
        : 'gameState.game.orders';

    return (
        <div className="flex flex-col gap-2">
            {!inBattle ? (
                <p className="text-xs text-muted m-0">Orders are only available during battle.</p>
            ) : (
                <>
                    {usesLiveOrders && liveError && (
                        <p className="text-[11px] text-red-400 m-0">Orders fetch: {liveError}</p>
                    )}

                    <div className="flex flex-col gap-1 shrink-0">
                        <span className="text-xs text-muted">Unit filter</span>
                        <div ref={unitMenuRef} className="relative max-w-md">
                            <button
                                type="button"
                                className="w-full text-left px-2 py-1.5 text-xs bg-surface-light text-white border border-border-custom rounded hover:bg-border-custom/80 transition-colors flex items-center justify-between gap-2"
                                onClick={() => (unitMenuOpen ? setUnitMenuOpen(false) : openMenu())}
                                aria-expanded={unitMenuOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="truncate">{filterLabel}</span>
                                <span className="text-muted shrink-0">{unitMenuOpen ? '▲' : '▼'}</span>
                            </button>
                            {unitMenuOpen && (
                                <div className="absolute left-0 right-0 top-full mt-1 z-20 flex flex-col rounded border border-border-custom bg-surface-light shadow-lg overflow-hidden min-w-[220px]">
                                    <input
                                        type="search"
                                        value={unitSearch}
                                        onChange={(e) => setUnitSearch(e.target.value)}
                                        placeholder="Filter by unit ID…"
                                        className="w-full px-2 py-1.5 text-xs bg-surface-light border-b border-border-custom text-white placeholder:text-muted outline-none focus:ring-1 focus:ring-primary/50 appearance-none"
                                        autoFocus
                                        onMouseDown={(e) => e.stopPropagation()}
                                    />
                                    <ul className="max-h-48 overflow-auto py-1 m-0 list-none" role="listbox">
                                        <li>
                                            <button
                                                type="button"
                                                className={`w-full text-left px-2 py-1.5 text-xs hover:bg-surface ${
                                                    filterUnitId == null ? 'text-primary' : 'text-white'
                                                }`}
                                                onClick={() => selectUnit(null)}
                                            >
                                                All units
                                            </button>
                                        </li>
                                        {visibleUnits.length === 0 ? (
                                            <li className="px-2 py-1.5 text-xs text-muted">No matching units</li>
                                        ) : (
                                            visibleUnits.map((u) => (
                                                <li key={u.id}>
                                                    <button
                                                        type="button"
                                                        className={`w-full text-left px-2 py-1.5 text-xs hover:bg-surface flex items-baseline justify-between gap-2 min-w-0 ${
                                                            filterUnitId === u.id ? 'text-primary' : 'text-white'
                                                        }`}
                                                        onClick={() => selectUnit(u.id)}
                                                    >
                                                        <span className="truncate min-w-0">{u.name}</span>
                                                        <span className="shrink-0 font-mono text-[10px] text-muted">{u.id}</span>
                                                    </button>
                                                </li>
                                            ))
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="text-xs text-muted">
                        Orders from <span className="text-white/80">{ordersSourceLabel}</span> — showing{' '}
                        <span className="text-white/90">{filteredOrders.length}</span>
                        {filterUnitId != null && sourceOrders.length !== filteredOrders.length ? (
                            <>
                                {' '}
                                of <span className="text-white/90">{sourceOrders.length}</span>
                            </>
                        ) : null}{' '}
                        {filteredOrders.length === 1 ? 'entry' : 'entries'}
                    </div>
                    {filteredOrders.length === 0 ? (
                        <p className="text-xs text-muted m-0">
                            {filterUnitId != null && sourceOrders.length > 0
                                ? 'No orders for this unit in the current list.'
                                : usesLiveOrders
                                  ? 'No rows in persisted orders.jsonl yet.'
                                  : 'No orders in game state yet.'}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-1.5 max-h-[min(60vh,28rem)] min-h-0 overflow-y-auto overflow-x-auto pr-0.5">
                            {sortedOrderCards}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

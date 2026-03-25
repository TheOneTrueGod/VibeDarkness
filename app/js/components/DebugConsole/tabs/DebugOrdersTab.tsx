import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameStatePayload } from '../../../types';
import DebugJsonBlock from '../DebugJsonBlock';

interface DebugOrdersTabProps {
    isActive: boolean;
    inBattle: boolean;
    gameState: GameStatePayload | null;
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

export default function DebugOrdersTab({ isActive, inBattle, gameState }: DebugOrdersTabProps) {
    const orders = useMemo(() => ordersFromGameState(gameState), [gameState]);
    const unitOptions = useMemo(() => unitsFromGameState(gameState), [gameState]);

    const [filterUnitId, setFilterUnitId] = useState<string | null>(null);
    const [unitMenuOpen, setUnitMenuOpen] = useState(false);
    const [unitSearch, setUnitSearch] = useState('');
    const unitMenuRef = useRef<HTMLDivElement | null>(null);

    const filteredOrders = useMemo(() => {
        if (filterUnitId == null) return orders;
        return orders.filter((o) => orderUnitId(o) === filterUnitId);
    }, [orders, filterUnitId]);

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

    return (
        <div className="flex flex-col gap-2">
            {!inBattle ? (
                <p className="text-xs text-muted m-0">Orders are only available during battle.</p>
            ) : (
                <>
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
                                    <ul
                                        className="max-h-48 overflow-auto py-1 m-0 list-none"
                                        role="listbox"
                                    >
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
                        Received orders in <span className="text-white/80">gameState.game.orders</span> — showing{' '}
                        <span className="text-white/90">{filteredOrders.length}</span>
                        {filterUnitId != null && orders.length !== filteredOrders.length ? (
                            <>
                                {' '}
                                of <span className="text-white/90">{orders.length}</span>
                            </>
                        ) : null}{' '}
                        {filteredOrders.length === 1 ? 'entry' : 'entries'}
                    </div>
                    <DebugJsonBlock
                        value={filteredOrders}
                        emptyText={
                            filterUnitId != null && orders.length > 0
                                ? 'No orders for this unit in the current game state.'
                                : 'No orders in game state yet.'
                        }
                    />
                </>
            )}
        </div>
    );
}

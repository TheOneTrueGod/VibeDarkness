import { AUTO_END_TURN } from './gameConstants';

type Listener = () => void;

const AUTO_END_TURN_STORAGE_KEY = 'minionBattles.autoEndTurn';

function loadStoredAutoEndTurn(): boolean {
    if (typeof localStorage === 'undefined') return AUTO_END_TURN;
    const stored = localStorage.getItem(AUTO_END_TURN_STORAGE_KEY);
    return stored === null ? AUTO_END_TURN : stored === 'true';
}

/**
 * Runtime override for {@link AUTO_END_TURN}, toggleable via the ITS timeline "Auto End"
 * checkbox. Persisted to localStorage once the user changes it; until then it falls back to
 * the {@link AUTO_END_TURN} default on page refresh.
 */
let autoEndTurn: boolean = loadStoredAutoEndTurn();
const listeners = new Set<Listener>();

export function getAutoEndTurn(): boolean {
    return autoEndTurn;
}

export function setAutoEndTurn(value: boolean): void {
    if (autoEndTurn === value) return;
    autoEndTurn = value;
    if (typeof localStorage !== 'undefined') localStorage.setItem(AUTO_END_TURN_STORAGE_KEY, String(value));
    listeners.forEach((listener) => listener());
}

export function subscribeAutoEndTurn(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

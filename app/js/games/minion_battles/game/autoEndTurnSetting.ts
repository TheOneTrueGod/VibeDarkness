import { AUTO_END_TURN } from './gameConstants';

type Listener = () => void;

/**
 * Runtime override for {@link AUTO_END_TURN}, toggleable via the ITS timeline "Auto End"
 * checkbox. Lives only in memory for this game session — resets to the {@link AUTO_END_TURN}
 * default on page refresh.
 */
let autoEndTurn: boolean = AUTO_END_TURN;
const listeners = new Set<Listener>();

export function getAutoEndTurn(): boolean {
    return autoEndTurn;
}

export function setAutoEndTurn(value: boolean): void {
    if (autoEndTurn === value) return;
    autoEndTurn = value;
    listeners.forEach((listener) => listener());
}

export function subscribeAutoEndTurn(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

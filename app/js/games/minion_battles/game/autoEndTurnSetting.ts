import { AUTO_END_TURN } from './gameConstants';

type Listener = () => void;

/**
 * Runtime value of {@link AUTO_END_TURN}. There is no player-facing toggle any more (Auto End is
 * always on); the setter remains for tests and debug tooling and is intentionally not persisted,
 * so a value stored by the old checkbox can never switch it off again.
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

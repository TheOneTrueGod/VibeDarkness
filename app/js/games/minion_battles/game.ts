/**
 * Minion Battles - game entrypoint. The gameContainer will contain the UI & entrypoint for the game.
 * Extends BaseGame with createInitialState (lobbyId, players, hands) and instance getters for state.
 */

import { BaseGame } from '../base.js';
import type { MinionBattlesState, MinionBattlesGameOptions } from './state.js';

export interface MinionBattlesInitialState extends MinionBattlesState {
    lobbyId: string;
    players: string[];
    hands: Record<string, string[]>;
}

export default class MinionBattlesGame extends BaseGame {
    private container: HTMLElement;
    private state: MinionBattlesState;

    constructor(container: HTMLElement, options: MinionBattlesGameOptions = {}) {
        super();
        this.container = container;
        this.container.classList.add('minion-battles-game');
        const raw = options.gameData ?? {};
        this.state = {
            lobbyId: (raw.lobby_id as string) ?? (raw.lobbyId as string),
            lobby_id: raw.lobby_id as string | undefined,
            players: (raw.players as string[]) ?? [],
            hands: (raw.hands as Record<string, string[]>) ?? {},
        };
        this.render();
    }

    /** Initial state shape for a new Minion Battles game (server uses this shape). */
    static createInitialState(lobbyId: string, playerIds: string[]): MinionBattlesInitialState {
        const base = super.createInitialState(lobbyId, playerIds);
        const hands: Record<string, string[]> = {};
        for (const pid of playerIds) {
            hands[pid] = [];
        }
        return {
            ...base,
            hands,
        };
    }

    get lobbyId(): string {
        return this.state.lobbyId ?? this.state.lobby_id ?? '';
    }

    get players(): string[] {
        return this.state.players ?? [];
    }

    get hands(): Record<string, string[]> {
        return this.state.hands ?? {};
    }

    private render(): void {
        this.container.innerHTML = `
            <div class="game-container minion-battles">
                <h2>Minion Battles</h2>
                <p>Game UI will go here.</p>
            </div>
        `;
    }

    /** Optional: cleanup when game is unmounted */
    destroy(): void {
        this.container.innerHTML = '';
        this.container.classList.remove('minion-battles-game');
    }
}

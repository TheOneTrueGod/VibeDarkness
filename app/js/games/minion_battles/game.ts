/**
 * Minion Battles - game entrypoint. The gameContainer will contain the UI & entrypoint for the game.
 */
export default class MinionBattlesGame {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.container.classList.add('minion-battles-game');
        this.render();
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

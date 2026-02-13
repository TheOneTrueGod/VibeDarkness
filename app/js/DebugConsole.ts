/**
 * Debug mode: press tilde (~) three times to enable, press again to disable.
 * When enabled, a console panel appears in the top left with a "Debug" button;
 * clicking it expands the panel to 1/4 of the screen with tabs (Game State, etc.).
 */

import type { GameStatePayload } from './types.js';

export let DEBUG_MODE = false;

let tildeCount = 0;
let debugConsole: DebugConsolePanel | null = null;

function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== '`' && e.key !== '~') return;
    if (DEBUG_MODE) {
        tildeCount++;
        if (tildeCount >= 1) {
            DEBUG_MODE = false;
            tildeCount = 0;
            debugConsole?.hide();
        }
    } else {
        tildeCount++;
        if (tildeCount >= 3) {
            DEBUG_MODE = true;
            tildeCount = 0;
            if (!debugConsole) {
                debugConsole = new DebugConsolePanel();
            }
            debugConsole.show();
        }
    }
}

document.addEventListener('keydown', onKeyDown);

export class DebugConsolePanel {
    private root: HTMLElement;
    private expanded = false;
    private gameStateContent: HTMLElement;
    private gameState: GameStatePayload | null = null;

    constructor() {
        this.root = document.createElement('div');
        this.root.id = 'debug-console';
        this.root.className = 'debug-console debug-console-collapsed';
        this.root.innerHTML = `
            <div class="debug-console-header">
                <button type="button" class="debug-console-toggle btn btn-small">Debug</button>
            </div>
            <div class="debug-console-body">
                <div class="debug-console-tabs">
                    <button type="button" class="debug-tab active" data-tab="game-state">Game State</button>
                </div>
                <div class="debug-console-tab-panels">
                    <div class="debug-tab-panel active" data-panel="game-state">
                        <div class="debug-game-state-scroll">
                            <pre class="debug-game-state-json"><code>No game state yet.</code></pre>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.gameStateContent = this.root.querySelector('.debug-game-state-json')!;
        const toggleBtn = this.root.querySelector('.debug-console-toggle');
        toggleBtn?.addEventListener('click', () => this.toggleExpanded());
        this.root.querySelectorAll('.debug-tab').forEach((tab) => {
            tab.addEventListener('click', () => this.switchTab((tab as HTMLElement).dataset.tab!));
        });
    }

    show(): void {
        if (!this.root.parentElement) {
            document.body.appendChild(this.root);
        }
        this.root.classList.remove('hidden');
    }

    hide(): void {
        this.root.classList.add('hidden');
    }

    setGameState(state: GameStatePayload | null): void {
        this.gameState = state;
        this.renderGameState();
    }

    private toggleExpanded(): void {
        this.expanded = !this.expanded;
        this.root.classList.toggle('debug-console-collapsed', !this.expanded);
        this.root.classList.toggle('debug-console-expanded', this.expanded);
    }

    private switchTab(tabId: string): void {
        this.root.querySelectorAll('.debug-tab').forEach((t) => {
            (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.tab === tabId);
        });
        this.root.querySelectorAll('.debug-tab-panel').forEach((p) => {
            (p as HTMLElement).classList.toggle('active', (p as HTMLElement).dataset.panel === tabId);
        });
    }

    private renderGameState(): void {
        const code = this.gameStateContent.querySelector('code');
        if (!code) return;
        if (this.gameState == null) {
            code.textContent = 'No game state yet.';
            return;
        }
        try {
            code.textContent = JSON.stringify(this.gameState, null, 2);
        } catch {
            code.textContent = 'Unable to serialize game state.';
        }
    }
}

/**
 * Call this to update the debug console with the latest game state from the server.
 * No-op if debug mode is off or the panel is not created.
 */
export function updateDebugGameState(state: GameStatePayload | null): void {
    debugConsole?.setGameState(state);
}

/**
 * Character Select Phase - displays character selection UI
 */

import type { PlayerState } from '../../../types.js';

export class CharacterSelectPhase {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.render();
    }

    private render(): void {
        this.container.innerHTML = `
            <div class="character-select-phase">
                <h2 class="phase-title">Select your character</h2>
                <p class="phase-description">Character selection UI will be implemented here.</p>
            </div>
        `;
    }

    destroy(): void {
        this.container.innerHTML = '';
    }
}

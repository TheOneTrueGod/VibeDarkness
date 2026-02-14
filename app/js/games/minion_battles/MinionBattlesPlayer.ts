/**
 * MinionBattlesPlayer - wraps a PlayerState with game-specific helpers.
 */
import type { PlayerState } from '../../types';

export class MinionBattlesPlayer {
    readonly player: PlayerState;

    constructor(player: PlayerState) {
        this.player = player;
    }

    get id(): string {
        return this.player.id;
    }

    get name(): string {
        return this.player.name;
    }

    get color(): string {
        return this.player.color;
    }

    get isHost(): boolean {
        return this.player.isHost ?? false;
    }

    /**
     * Determines whether a character is unlocked for this player.
     * For now, all characters are unlocked for all players.
     */
    isCharacterUnlocked(_characterId: string): boolean {
        return true;
    }
}

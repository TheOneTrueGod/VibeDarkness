import { defaultLoadoutAfterPrepChange } from '../../../../storylines/questPrepLoadout';

/** Writes `lastMissionAbilityIds` on the character (e.g. `api.updateCharacter`). */
export type SaveDefaultLoadout = (lastMissionAbilityIds: string[]) => Promise<unknown>;

export interface DefaultLoadoutSaver {
    /**
     * Save the player's prep picks as the character's default loadout right away, so it survives
     * leaving the lobby before the mission starts. Resolves once this save (and earlier ones) ran.
     */
    save(selectedPrimaryIds: readonly string[]): Promise<void>;
}

/**
 * Saves the character's default loadout on each player pick or reorder. Saves run one at a time
 * so a quick pick-then-reorder cannot land out of order, and unchanged loadouts are skipped.
 */
export function createDefaultLoadoutSaver(
    write: SaveDefaultLoadout,
    storedDefault: readonly string[],
): DefaultLoadoutSaver {
    let saved = storedDefault;
    let chain: Promise<void> = Promise.resolve();
    return {
        save(selectedPrimaryIds) {
            const next = defaultLoadoutAfterPrepChange(saved, selectedPrimaryIds);
            if (!next) return chain;
            saved = next;
            chain = chain.then(async () => {
                try {
                    await write(next);
                } catch (e) {
                    console.warn('Failed to save default loadout:', e);
                }
            });
            return chain;
        },
    };
}

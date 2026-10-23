import { STORY_BACKGROUNDS } from '../../../../assets/story';
import type { QuestDef } from '../../../../storylines/questTypes';

/**
 * What differs between the prep screens (Quest Prep for side quests, Prepare Carefully for
 * regular missions). Everything else — slots, picker, sync, reorder — is one shared stack.
 */
export interface PrepLoadoutConfig {
    /** Lobby game-state map holding in-progress primary picks by player id. */
    lobbyField: 'questPrepLoadoutsByPlayer' | 'missionPrepLoadoutsByPlayer';
    /** Picks to start from when the lobby has none yet (prior quest run / last mission). */
    rememberedAbilityIds: readonly string[];
    /** When true, Ready waits until the loadout is complete (`isMissionPrepAbilityReady`). */
    requireCompleteLoadout: boolean;
    /** Center-slot background behind the ability picker. */
    backgroundImage: string;
}

/** Default prep background: the story campfire. */
export function campfireBackgroundForPrep(): string {
    return STORY_BACKGROUNDS.campfire;
}

/** Quest Prep center background: the quest's own static background, else the campfire. */
export function questPrepBackgroundImage(quest: Pick<QuestDef, 'prepBackgroundImage'> | undefined): string {
    return quest?.prepBackgroundImage ?? campfireBackgroundForPrep();
}

/** Quest Prep (side quest, first slot / prep run): picks are frozen into the quest run on Ready. */
export function questPrepConfig(
    quest: Pick<QuestDef, 'prepBackgroundImage'> | undefined,
    rememberedAbilityIds: readonly string[] = [],
): PrepLoadoutConfig {
    return {
        lobbyField: 'questPrepLoadoutsByPlayer',
        rememberedAbilityIds,
        requireCompleteLoadout: false,
        backgroundImage: questPrepBackgroundImage(quest),
    };
}

/** Prepare Carefully (regular mission): starts from the character's last mission picks. */
export function missionPrepConfig(lastMissionAbilityIds: readonly string[] = []): PrepLoadoutConfig {
    return {
        lobbyField: 'missionPrepLoadoutsByPlayer',
        rememberedAbilityIds: lastMissionAbilityIds,
        requireCompleteLoadout: true,
        backgroundImage: campfireBackgroundForPrep(),
    };
}

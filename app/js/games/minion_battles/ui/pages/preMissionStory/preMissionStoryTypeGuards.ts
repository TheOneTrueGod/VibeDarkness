import type {
    ChoicePhrase,
    DialoguePhrase,
    GrantEquipmentRandomPhrase,
    GroupVotePhrase,
    PreMissionPhrase,
    StoryChoiceActionGrantResources,
} from '../../../storylines/storyTypes';

export function isDialogue(phrase: PreMissionPhrase | undefined): phrase is DialoguePhrase {
    return !!phrase && phrase.type === 'dialogue';
}

export function isChoice(phrase: PreMissionPhrase | undefined): phrase is ChoicePhrase {
    return phrase?.type === 'choice';
}

export function isGrantEquipmentRandom(phrase: PreMissionPhrase | undefined): phrase is GrantEquipmentRandomPhrase {
    return phrase?.type === 'grant_equipment_random';
}

export function isGroupVote(phrase: PreMissionPhrase | undefined): phrase is GroupVotePhrase {
    return phrase?.type === 'groupVote';
}

export function isGrantResources(action: { type: string } | undefined): action is StoryChoiceActionGrantResources {
    return !!action && action.type === 'grant_resources';
}

/**
 * Runtime-only post-mission choice options for missions whose rewards depend on equipment.
 * See ChoicePhrase.resolverId in storyTypes.ts.
 */
import type { ChoicePhrase, PostMissionChoiceResolverId, StoryChoiceAction } from './storyTypes';
import { CRYSTAL_ROCKS_TREE_ID } from '../../../researchTrees/trees/crystal_rocks';
import { STICK_SWORD_TREE_ID } from '../../../researchTrees/trees/stick_sword';
import { TECH_SHIELD_TREE_ID, techShieldTree } from '../../../researchTrees/trees/tech_shield';
import { TRAINING_TREE_ID, TRAINING_NODE_CORE } from '../../../researchTrees/trees/training';

const ITEM_ROCKS = '001';
const ITEM_STICK = '002';
const ITEM_POT_SHIELD = '003';

/** Canonical node id from `researchTrees/trees/tech_shield.ts`. Kept centralized for safety. */
const CRYSTAL_EMBEDDED_SHIELD_NODE_ID =
    techShieldTree.nodes.find((n) => n.id === 'crystal_embedded_shield')?.id ?? '';

function disabledPlaceholderAction(): StoryChoiceAction {
    return {
        type: 'grant_research_to_player',
        treeId: CRYSTAL_ROCKS_TREE_ID,
        nodeId: '__unavailable_choice__',
    };
}

export function getComputedPostMissionChoiceOptions(params: {
    missionId: string;
    choiceId: string;
    resolverId?: PostMissionChoiceResolverId | undefined;
    equippedItemIds: readonly string[];
}): ChoicePhrase['options'] | null {
    const { missionId, choiceId, resolverId, equippedItemIds } = params;

    if (resolverId !== 'towards_the_light') {
        return null;
    }
    if (missionId !== 'towards_the_light' || choiceId !== 'towards_the_light_cave_choice') {
        return null;
    }

    const eq = new Set(equippedItemIds);
    const has = (id: string) => eq.has(id);

    // Crystal: rocks → charged_rocks; else pot shield → crystal embedded shield (tech_shield).
    let crystalAction: StoryChoiceAction;
    let crystalDisabledLabel: string | undefined;
    if (has(ITEM_ROCKS)) {
        crystalAction = {
            type: 'grant_research_to_player',
            treeId: CRYSTAL_ROCKS_TREE_ID,
            nodeId: 'charged_rocks',
        };
    } else if (has(ITEM_POT_SHIELD) && CRYSTAL_EMBEDDED_SHIELD_NODE_ID !== '') {
        crystalAction = {
            type: 'grant_research_to_player',
            treeId: TECH_SHIELD_TREE_ID,
            nodeId: CRYSTAL_EMBEDDED_SHIELD_NODE_ID,
        };
    } else {
        crystalDisabledLabel = `Requires Rocks (${ITEM_ROCKS}) or Pot Shield (${ITEM_POT_SHIELD}).`;
        crystalAction = disabledPlaceholderAction();
    }

    // Metal: rocks → throwing knives; else stick → craft sword.
    let metalAction: StoryChoiceAction;
    let metalDisabledLabel: string | undefined;
    if (has(ITEM_ROCKS)) {
        metalAction = {
            type: 'grant_research_to_player',
            treeId: CRYSTAL_ROCKS_TREE_ID,
            nodeId: 'throwing_knives',
        };
    } else if (has(ITEM_STICK)) {
        metalAction = {
            type: 'grant_research_to_player',
            treeId: STICK_SWORD_TREE_ID,
            nodeId: 'craft_sword',
        };
    } else {
        metalDisabledLabel = `Requires Rocks (${ITEM_ROCKS}) or Stick / Torch (${ITEM_STICK}).`;
        metalAction = disabledPlaceholderAction();
    }

    const trainingAction: StoryChoiceAction = {
        type: 'grant_research_to_player',
        treeId: TRAINING_TREE_ID,
        nodeId: TRAINING_NODE_CORE,
    };

    return [
        {
            id: 'crystal_track',
            label: 'Crystal path',
            loreTitle: 'Veins of the Hollow',
            loreDescription:
                "Trace the cave's restless gleam—shape brittle stone into a spark that refuses to gutter out.",
            disabledLabel: crystalDisabledLabel,
            action: crystalAction,
        },
        {
            id: 'metal_track',
            label: 'Metal path',
            loreTitle: 'Iron in the Dark',
            loreDescription:
                'Salvage edge from scrap and nerve; let the next thrown thing carry your conviction.',
            disabledLabel: metalDisabledLabel,
            action: metalAction,
        },
        {
            id: 'training_track',
            label: 'Core Training',
            loreTitle: 'The Still Ember',
            loreDescription:
                'No relic—only breath, stance, and the quiet refusal to break when the dark presses close.',
            action: trainingAction,
        },
    ];
}

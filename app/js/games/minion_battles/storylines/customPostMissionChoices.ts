/**
 * Runtime-only post-mission choice options for missions whose rewards depend on equipment.
 * See ChoicePhrase.resolverId in storyTypes.ts.
 */
import type { ChoicePhrase, PostMissionChoiceResolverId, StoryChoiceAction } from './storyTypes';
import { CRYSTAL_ROCKS_TREE_ID } from '../../../researchTrees/trees/crystal_rocks';
import {
    STICK_SWORD_NODE_EXTRA_TARGET,
    STICK_SWORD_NODE_EXTRA_USES,
    STICK_SWORD_TREE_ID,
} from '../../../researchTrees/trees/stick_sword';
import {
    TECH_SHIELD_TREE_ID,
    TECH_SHIELD_NODE_STRENGTHENING_LIGHT,
    techShieldTree,
} from '../../../researchTrees/trees/tech_shield';
import {
    TRAINING_TREE_ID,
    TRAINING_NODE_CHARGING_PUNCH,
    TRAINING_NODE_CORE,
    TRAINING_NODE_DOUBLE_PUNCH,
    TRAINING_NODE_SNEAKY_PUNCH,
    TRAINING_NODE_STRONG_PUNCH,
} from '../../../researchTrees/trees/training';

const ITEM_ROCKS = '001';
const ITEM_STICK = '002';
const ITEM_POT_SHIELD = '003';

/** Canonical node id from `researchTrees/trees/tech_shield.ts`. Kept centralized for safety. */
const CRYSTAL_EMBEDDED_SHIELD_NODE_ID =
    techShieldTree.nodes.find((n) => n.id === 'crystal_embedded_shield')?.id ?? '';

const NODE_THROWING_CRYSTAL_SHIELD = 'throwing_crystal_shield';
const NODE_CHARGED_ROCKS = 'charged_rocks';
const NODE_THROWING_KNIVES = 'throwing_knives';
const NODE_MORE_POWER = 'more_power';
const NODE_MORE_ROCK = 'more_rock';
const NODE_CRAFT_SWORD = 'craft_sword';

function disabledPlaceholderAction(): StoryChoiceAction {
    return {
        type: 'grant_research_to_player',
        treeId: CRYSTAL_ROCKS_TREE_ID,
        nodeId: '__unavailable_choice__',
    };
}

function hasResearched(trees: Record<string, string[]> | undefined, treeId: string, nodeId: string): boolean {
    return (trees?.[treeId] ?? []).includes(nodeId);
}

/** Training punch picks for mission 4 (`cave_respite_punch_choice`), before weapon/research options. */
function getLightEmpoweredPunchChoiceRows(): ChoicePhrase['options'] {
    const grantPunch = (nodeId: string): StoryChoiceAction => ({
        type: 'grant_research_to_player',
        treeId: TRAINING_TREE_ID,
        nodeId,
    });
    return [
        {
            id: TRAINING_NODE_CHARGING_PUNCH,
            label: 'Charging Punch',
            loreTitle: 'Crystal Rhythm',
            loreDescription:
                'The cave crystals answer a steady rhythm. Channel their stored light through your strike so each hit builds 1 Light Charge for your next move.',
            action: grantPunch(TRAINING_NODE_CHARGING_PUNCH),
        },
        {
            id: TRAINING_NODE_SNEAKY_PUNCH,
            label: 'Sneaky Punch',
            loreTitle: 'Strike the Opening',
            loreDescription:
                'You learned to wait for clean openings in wolf packs. Punch deals extra damage to stunned enemies.',
            action: grantPunch(TRAINING_NODE_SNEAKY_PUNCH),
        },
        {
            id: TRAINING_NODE_STRONG_PUNCH,
            label: 'Strong Punch',
            loreTitle: 'Brace and Hit',
            loreDescription:
                'Hunting in rough ground taught you to plant your feet and drive through. Punch hits harder and can knock enemies back with a stun.',
            action: grantPunch(TRAINING_NODE_STRONG_PUNCH),
        },
        {
            id: TRAINING_NODE_DOUBLE_PUNCH,
            label: 'Double Punch',
            loreTitle: 'Two Quick Blows',
            loreDescription:
                'Fighting in tight cave paths trained fast follow-ups. Punch can target two enemies in sequence.',
            action: grantPunch(TRAINING_NODE_DOUBLE_PUNCH),
        },
    ];
}

/** When no weapon-branch research applies for `cave_respite_research_choice` (punch already chosen earlier). */
function getCaveRespiteResearchFallbackRows(): ChoicePhrase['options'] {
    return [
        {
            id: TRAINING_NODE_CORE,
            label: 'Core Training',
            loreTitle: 'The Still Ember',
            loreDescription:
                'No relic—only breath, stance, and the quiet refusal to break when the dark presses close.',
            action: {
                type: 'grant_research_to_player',
                treeId: TRAINING_TREE_ID,
                nodeId: TRAINING_NODE_CORE,
            },
        },
    ];
}

export function getComputedPostMissionChoiceOptions(params: {
    missionId: string;
    choiceId: string;
    resolverId?: PostMissionChoiceResolverId | undefined;
    equippedItemIds: readonly string[];
    /** Local player's researched nodes by tree (campaign character). Used by `cave_respite`. */
    playerResearchTrees?: Record<string, string[]>;
}): ChoicePhrase['options'] | null {
    const { missionId, choiceId, resolverId, equippedItemIds, playerResearchTrees } = params;

    if (resolverId === 'cave_respite') {
        if (missionId !== 'cave_respite') {
            return null;
        }
        if (choiceId === 'cave_respite_punch_choice') {
            return getLightEmpoweredPunchChoiceRows();
        }
        if (choiceId !== 'cave_respite_research_choice') {
            return null;
        }
        const trees = playerResearchTrees ?? {};
        const grant = (treeId: string, nodeId: string): StoryChoiceAction => ({
            type: 'grant_research_to_player',
            treeId,
            nodeId,
        });

        if (hasResearched(trees, TECH_SHIELD_TREE_ID, 'crystal_embedded_shield')) {
            return [
                {
                    id: NODE_THROWING_CRYSTAL_SHIELD,
                    label: 'Shooting Shield',
                    loreTitle: 'Crystal Bolt',
                    loreDescription:
                        'Lean into the shield’s new geometry—let a shard answer the dark at range.',
                    action: grant(TECH_SHIELD_TREE_ID, NODE_THROWING_CRYSTAL_SHIELD),
                },
                {
                    id: TECH_SHIELD_NODE_STRENGTHENING_LIGHT,
                    label: 'Strengthening Light',
                    loreTitle: 'Fortified Gleam',
                    loreDescription: 'Weave the cave-light into your guard; each block carries a little healing onward.',
                    action: grant(TECH_SHIELD_TREE_ID, TECH_SHIELD_NODE_STRENGTHENING_LIGHT),
                },
            ];
        }

        if (hasResearched(trees, CRYSTAL_ROCKS_TREE_ID, NODE_CHARGED_ROCKS)) {
            return [
                {
                    id: NODE_MORE_POWER,
                    label: 'More Power',
                    loreTitle: 'Heavier Impact',
                    loreDescription: 'Practice putting the charged weight of a throw behind every impact.',
                    action: grant(CRYSTAL_ROCKS_TREE_ID, NODE_MORE_POWER),
                },
                {
                    id: NODE_MORE_ROCK,
                    label: 'More Rock',
                    loreTitle: 'Split Intent',
                    loreDescription: 'Train your aim so one motion can threaten two threats.',
                    action: grant(CRYSTAL_ROCKS_TREE_ID, NODE_MORE_ROCK),
                },
            ];
        }

        if (hasResearched(trees, CRYSTAL_ROCKS_TREE_ID, NODE_THROWING_KNIVES)) {
            return [
                {
                    id: NODE_MORE_ROCK,
                    label: 'More Rock',
                    loreTitle: 'Second Line',
                    loreDescription: 'Hone the follow-through so your knives can find another mark.',
                    action: grant(CRYSTAL_ROCKS_TREE_ID, NODE_MORE_ROCK),
                },
            ];
        }

        if (hasResearched(trees, STICK_SWORD_TREE_ID, NODE_CRAFT_SWORD)) {
            return [
                {
                    id: STICK_SWORD_NODE_EXTRA_TARGET,
                    label: '+1 Swing Sword Target',
                    loreTitle: 'Wider Arc',
                    loreDescription: 'Drill cleaving lines that catch one more foe in the same breath.',
                    action: grant(STICK_SWORD_TREE_ID, STICK_SWORD_NODE_EXTRA_TARGET),
                },
                {
                    id: STICK_SWORD_NODE_EXTRA_USES,
                    label: '+2 Swing Sword Uses',
                    loreTitle: 'Endurance Edge',
                    loreDescription: 'Oil the wrists and lungs—squeeze two more full swings from the same stance.',
                    action: grant(STICK_SWORD_TREE_ID, STICK_SWORD_NODE_EXTRA_USES),
                },
            ];
        }

        return getCaveRespiteResearchFallbackRows();
    }

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

import type { ScenarioDefinition } from '../types';
import {
    pathAroundRockScenario,
    pathShortCommuteScenario,
    pathStraightMoveScenario,
    dodgeIFrameProtectionScenario,
    dodgeIFrameVsThornbinderScenario,
    pathOpenFieldStraightScenario,
    pathCornerNoBacktrackScenario,
    pathGroupSpreadsScenario,
    pathChokePointSlideScenario,
    pathTerrainChangeRerouteScenario,
    pathStress200Scenario,
} from './general/pathfinding';
import { MOVEMENT_SHOWCASE_SCENARIOS } from './general/movementShowcase';
import { crowdSpacingPackAndAnchorsScenario } from './general/crowdSpacing';
import { swingSwordAppliesBleedScenario } from './general/buffs';
import {
    bossStunMechanicsScenario,
    alphaWolfTripleChargeScenario,
    alphaWolfEnrageTriggersScenario,
    alphaWolfSummonScenario,
    alphaWolfScratchScenario,
    exposedDurationExtensionScenario,
    enemyArcherShotScenario,
} from './general/enemies';
import { npcControlScenario } from './general/npcControl';
import { empoweredSpiritsScenario } from './general/darknessUpgrades';
import {
    punchChargingScenario,
    punchDoubleScenario,
    punchNEWBaselineScenario,
    punchSneakyScenario,
    punchStrongScenario,
    bashRangeBoundaryHitScenario,
    bashRangeBoundaryMissScenario,
    doublePunchTwoTargetsScenario,
    doublePunchMovementReplanScenario,
} from './abilities/punchResearch';
import { doublePunchDeathFallbackScenario } from './abilities/doublePunchScenario';
import {
    throwRockMorePowerScenario,
    throwRockMoreRockScenario,
    throwRockNoResearchScenario,
} from './abilities/throwRockResearch';
import {
    swingSwordBleedScenario,
    swingSwordExtraUsesScenario,
    swingSwordNoneScenario,
    swingSwordHitsTwoTargetsScenario,
} from './abilities/swingSwordResearch';
import { laserSwordHitsTwoTargetsScenario } from './abilities/laserSwordScenarios';
import { throwTorchHitsDummyScenario } from './abilities/throwTorchScenario';
import { beastClawFrontHitBackMissScenario } from './abilities/beastClawScenarios';
import { swingBatHitsThreeTargetsScenario } from './abilities/swingBatScenarios';
import { swingBatSequentialAimPixelScenario } from './abilities/swingBatSequentialAim';
import { lightImbuementAndImbuedBatScenario } from './abilities/lightImbuementScenario';
import { lightBlastCommittedScenario, lightBlastRangeCapScenario, lightBlastHitCapScenario } from './abilities/lightBlastScenario';
import {
    gatherLightCommittedScenario,
    gatherLightDevourScenario,
    gatherLightNoDevourScenario,
    gatherLightDevourOwnTorchOnlyScenario,
} from './abilities/gatherLightScenario';
import {
    deployableBrambleFoundAndConsumedScenario,
    deployableCheckpointRoundtripScenario,
} from './abilities/deployableScenarios';
import { shieldOfLightScenario } from './abilities/shieldOfLightScenario';
import {
    layHandsPunchAndBlastScenario,
    layHandsNoEmitterScenario,
    layHandsMissStillDetonatesScenario,
    layHandsIgnoresStoryCampfireScenario,
    layHandsIgnoresEnemyLightScenario,
} from './abilities/layHandsScenarios';
import { throwKnifePiercingBleedScenario } from './abilities/throwKnifeScenarios';
import { clawMovementDistanceScenario } from './abilities/clawScenarios';
import { pistolHitsDummyScenario, smgHitsDummyScenario, shotgunHitsDummyScenario } from './abilities/gunScenarios';
import { absorptionShieldEnergyChargeScenario } from './abilities/absorptionShieldScenario';
import {
    raiseShieldBlocksScenario,
    shiningBlockRetaliationScenario,
    shiningBlockStrengtheningLightScenario,
} from './abilities/techShieldScenarios';
import { lanterniteNestBuildScenario, lanterniteNestDualSpawnScenario, lanterniteSharedConstructionScenario, lanterniteDefenderAttackScenario, lanterniteDefenderTracksMovingTargetScenario, lanterniteNestThornSpreadScenario } from './general/lanternites';
import { lanterniteDeathBehaviorsScenario, lanterniteNestOwnedNoRespawnScenario } from './general/lanterniteDeath';
import { petAutoEngageScenario, petHeelScenario, petSicEmPounceScenario } from './general/pets';
import {
    swarmlingHuntAndBiteScenario,
    swarmlingSharedConstructionScenario,
    swarmlingContestsOccupiedNestScenario,
} from './general/swarmlings';
import { aiPlanHoldStabilityScenario } from './ai/ai_plan_hold_stability';
import { aiTerrainInterruptScenario } from './ai/ai_terrain_interrupt';
import { aiReplanStaggerScenario } from './ai/ai_replan_stagger';
import { aiSerializationRoundtripScenario } from './ai/ai_serialization_roundtrip';
import { lightingIlluminatesAreaScenario, lightDelayedFadeScenario, campfireDecayScenario, lightingBaseOverlapScenario } from './general/lightingSystem';
import { worldModifierDarkSwarmScenario, worldModifierMidBattleAddScenario, worldEffectVisualEffectsFireScenario } from './general/worldModifiers';
import {
    dsEnemyHardenedRaisesEnemyHpScenario,
    dsSwarmReinforcementsOverRoundsScenario,
} from './general/darknessStrength';
import { deathVfxUnitDefEffectsFireScenario, deathVfxAlphaWolfUnchangedScenario } from './general/deathVfx';
import { abilityTimingEmitterVisualEffectsFireScenario } from './general/abilityTimingEmitterVfx';
import { EQUIPMENT_LOADOUT_SCENARIOS } from './general/equipmentLoadout';
import { directEffectVfxDefTargetPositionScenario } from './general/directEffectVfxDefPosition';
import { gravityGrazeScenario } from './abilities/gravityGrazeScenario';
import { gravityLocusScenario } from './abilities/gravityLocusScenario';
import { forcePushScenario } from './abilities/forcePushScenario';
import { gravityInversionScenario } from './abilities/gravityInversionScenario';
import { gravityCollapseScenario } from './abilities/gravityCollapseScenario';
import { gravityShieldScenario } from './abilities/gravityShieldScenario';
import {
    energyBlastStrictPriorityFillScenario,
    imbuedBatConeStrictFillScenario,
    liftStrictPriorityFillScenario,
    lightBlastStrictPriorityFillScenario,
} from './abilities/strictLockOnScenarios';
import { bloodMendScenario } from './abilities/bloodMendScenario';
import { burstScenario } from './abilities/burstScenario';
import { bloodShardSplintersScenario } from './abilities/bloodShardScenarios';
import {
    bloodyClawsEdgeLockOnScenario,
    bloodyClawsFarCentreLockOnScenario,
    bloodyClawsStepLungesScenario,
} from './abilities/bloodyClawsScenarios';
import {
    earthCoreEarthernPunchScenario,
    earthCoreShakingGroundScenario,
    earthCoreShatterScenario,
    earthCoreStoneTombScenario,
    earthCoreRockSlideScenario,
    earthCoreKnockScenario,
    earthCoreAnchoredTremorScenario,
    earthCoreStoneyPunchBaselineScenario,
    earthCoreStoneyPunchArmourScenario,
    earthCoreDiggingClawsScenario,
    earthCoreDiggingClawsThrowRockEntombScenario,
    earthCoreImpactConversionScenario,
    earthCoreBedrockScavengerScenario,
    earthCoreDeepResonanceScenario,
    earthCoreGatherStoneRockHarvestScenario,
    earthCoreGatherStoneRubbleStrikeScenario,
    earthCoreGatherStoneNoRubbleStrikeWithoutResearchScenario,
    earthCoreStoneTombCentreEscapeScenario,
    earthCoreRockSlideLandsOnEnemyScenario,
    earthCoreRockSlideScoursGroundScenario,
    earthCoreStoneTombScoursGroundScenario,
} from './abilities/earthCoreScenarios';
import { rapidThrowComboScenario } from './abilities/rapidThrowComboScenario';
import { CAST_ENDED_EARLY_SCENARIOS } from './general/castEndedEarly';
import { TIME_DILATION_SCENARIOS } from './general/timeDilation';
import { HUNGER_SCENARIOS } from './general/hunger';

export const ALL_ABILITY_TEST_SCENARIOS: ScenarioDefinition[] = [
    pathStraightMoveScenario,
    pathAroundRockScenario,
    pathShortCommuteScenario,
    pathOpenFieldStraightScenario,
    pathCornerNoBacktrackScenario,
    pathGroupSpreadsScenario,
    pathChokePointSlideScenario,
    pathTerrainChangeRerouteScenario,
    pathStress200Scenario,
    ...MOVEMENT_SHOWCASE_SCENARIOS,
    dodgeIFrameProtectionScenario,
    dodgeIFrameVsThornbinderScenario,
    crowdSpacingPackAndAnchorsScenario,
    swingSwordAppliesBleedScenario,
    punchStrongScenario,
    punchDoubleScenario,
    punchSneakyScenario,
    punchChargingScenario,
    punchNEWBaselineScenario,
    bashRangeBoundaryHitScenario,
    bashRangeBoundaryMissScenario,
    doublePunchTwoTargetsScenario,
    doublePunchMovementReplanScenario,
    doublePunchDeathFallbackScenario,
    throwRockNoResearchScenario,
    throwRockMorePowerScenario,
    throwRockMoreRockScenario,
    swingSwordNoneScenario,
    swingSwordBleedScenario,
    swingSwordHitsTwoTargetsScenario,
    swingSwordExtraUsesScenario,
    bossStunMechanicsScenario,
    alphaWolfTripleChargeScenario,
    alphaWolfEnrageTriggersScenario,
    alphaWolfSummonScenario,
    alphaWolfScratchScenario,
    npcControlScenario,
    exposedDurationExtensionScenario,
    enemyArcherShotScenario,
    empoweredSpiritsScenario,
    swarmlingHuntAndBiteScenario,
    swarmlingSharedConstructionScenario,
    swarmlingContestsOccupiedNestScenario,
    absorptionShieldEnergyChargeScenario,
    raiseShieldBlocksScenario,
    shiningBlockRetaliationScenario,
    shiningBlockStrengtheningLightScenario,
    lanterniteNestBuildScenario,
    lanterniteNestDualSpawnScenario,
    lanterniteSharedConstructionScenario,
    lanterniteDefenderAttackScenario,
    lanterniteDefenderTracksMovingTargetScenario,
    lanterniteNestThornSpreadScenario,
    lanterniteDeathBehaviorsScenario,
    lanterniteNestOwnedNoRespawnScenario,
    lightingIlluminatesAreaScenario,
    lightDelayedFadeScenario,
    campfireDecayScenario,
    lightingBaseOverlapScenario,
    earthCoreEarthernPunchScenario,
    earthCoreShakingGroundScenario,
    earthCoreShatterScenario,
    earthCoreStoneTombScenario,
    earthCoreStoneTombCentreEscapeScenario,
    earthCoreRockSlideScenario,
    earthCoreRockSlideLandsOnEnemyScenario,
    earthCoreStoneTombScoursGroundScenario,
    earthCoreRockSlideScoursGroundScenario,
    earthCoreKnockScenario,
    earthCoreAnchoredTremorScenario,
    earthCoreStoneyPunchBaselineScenario,
    earthCoreStoneyPunchArmourScenario,
    earthCoreDiggingClawsScenario,
    earthCoreDiggingClawsThrowRockEntombScenario,
    earthCoreImpactConversionScenario,
    earthCoreBedrockScavengerScenario,
    earthCoreDeepResonanceScenario,
    earthCoreGatherStoneRockHarvestScenario,
    earthCoreGatherStoneRubbleStrikeScenario,
    earthCoreGatherStoneNoRubbleStrikeWithoutResearchScenario,
    rapidThrowComboScenario,
    laserSwordHitsTwoTargetsScenario,
    throwTorchHitsDummyScenario,
    beastClawFrontHitBackMissScenario,
    swingBatHitsThreeTargetsScenario,
    swingBatSequentialAimPixelScenario,
    lightImbuementAndImbuedBatScenario,
    lightBlastCommittedScenario,
    lightBlastRangeCapScenario,
    lightBlastHitCapScenario,
    gatherLightCommittedScenario,
    gatherLightDevourScenario,
    gatherLightNoDevourScenario,
    gatherLightDevourOwnTorchOnlyScenario,
    shieldOfLightScenario,
    layHandsPunchAndBlastScenario,
    layHandsNoEmitterScenario,
    layHandsMissStillDetonatesScenario,
    layHandsIgnoresStoryCampfireScenario,
    layHandsIgnoresEnemyLightScenario,
    deployableBrambleFoundAndConsumedScenario,
    deployableCheckpointRoundtripScenario,
    gravityGrazeScenario,
    gravityLocusScenario,
    forcePushScenario,
    gravityInversionScenario,
    gravityCollapseScenario,
    gravityShieldScenario,
    liftStrictPriorityFillScenario,
    lightBlastStrictPriorityFillScenario,
    energyBlastStrictPriorityFillScenario,
    imbuedBatConeStrictFillScenario,
    bloodMendScenario,
    burstScenario,
    bloodShardSplintersScenario,
    bloodyClawsEdgeLockOnScenario,
    bloodyClawsFarCentreLockOnScenario,
    bloodyClawsStepLungesScenario,
    throwKnifePiercingBleedScenario,
    clawMovementDistanceScenario,
    pistolHitsDummyScenario,
    smgHitsDummyScenario,
    shotgunHitsDummyScenario,
    petAutoEngageScenario,
    petHeelScenario,
    petSicEmPounceScenario,
    aiPlanHoldStabilityScenario,
    aiTerrainInterruptScenario,
    aiReplanStaggerScenario,
    aiSerializationRoundtripScenario,
    worldModifierDarkSwarmScenario,
    worldModifierMidBattleAddScenario,
    worldEffectVisualEffectsFireScenario,
    dsEnemyHardenedRaisesEnemyHpScenario,
    dsSwarmReinforcementsOverRoundsScenario,
    deathVfxUnitDefEffectsFireScenario,
    deathVfxAlphaWolfUnchangedScenario,
    abilityTimingEmitterVisualEffectsFireScenario,
    directEffectVfxDefTargetPositionScenario,
    ...EQUIPMENT_LOADOUT_SCENARIOS,
    ...CAST_ENDED_EARLY_SCENARIOS,
    ...TIME_DILATION_SCENARIOS,
    ...HUNGER_SCENARIOS,
];

export function getScenarioById(id: string): ScenarioDefinition | undefined {
    return ALL_ABILITY_TEST_SCENARIOS.find((s) => s.id === id);
}

export interface AbilityTreeSidebarGroup {
    treeId: string;
    label: string;
    selectorKey: string;
    /** Ability IDs as returned by inferScenarioAbilityId — used to collect scenarios for this tree. */
    abilityIds: string[];
}

const ABILITY_TREE_GROUPS: AbilityTreeSidebarGroup[] = [
    { treeId: 'lightbearer',   label: 'Torch',          selectorKey: 'tree:lightbearer',   abilityIds: ['0601'] },
    { treeId: 'training',      label: 'Training',      selectorKey: 'tree:training',      abilityIds: ['0116', '0117', '0118', '0119'] },
    { treeId: 'crystal_rocks', label: 'Rocks',          selectorKey: 'tree:crystal_rocks', abilityIds: ['throw_rock'] },
    { treeId: 'stick_sword',   label: 'Stick & Sword',  selectorKey: 'tree:stick_sword',   abilityIds: ['0112', '0105', '0115'] },
    { treeId: 'tech_shield',   label: 'Tech Shield',    selectorKey: 'tree:tech_shield',   abilityIds: ['0104', '0110', '0113'] },
    { treeId: 'earth_core',    label: 'Earth Core',     selectorKey: 'tree:earth_core',    abilityIds: ['earth_core'] },
    { treeId: 'light',         label: 'Light Core',     selectorKey: 'tree:light',         abilityIds: ['0801', '0803', '0804', '0805', '0806'] },
    { treeId: 'gravity_core',  label: 'Gravity',        selectorKey: 'tree:gravity_core',  abilityIds: ['0901', '0902', '0903', '0904', '0905', 'gravity_core'] },
    { treeId: 'blood_mage',    label: 'Blood Mage',     selectorKey: 'tree:blood_mage',    abilityIds: ['0301', '0302'] },
];

export function getAbilityTreeSidebarGroups(): AbilityTreeSidebarGroup[] {
    return ABILITY_TREE_GROUPS.filter(({ abilityIds }) =>
        ALL_ABILITY_TEST_SCENARIOS.some(
            (s) => s.category === 'ability' && abilityIds.includes(inferScenarioAbilityId(s) ?? ''),
        ),
    );
}

export function isRegisteredTreeGroupSelectorKey(key: string): boolean {
    return ABILITY_TREE_GROUPS.some((g) => g.selectorKey === key);
}

export function getGeneralTestScenarios(): ScenarioDefinition[] {
    return ALL_ABILITY_TEST_SCENARIOS.filter((s) => s.category === 'general');
}

/** Ordered general-test groups for the Ability Test sidebar (`general:<slug>`). */
const GENERAL_GROUP_ORDER: { slug: string; section: string }[] = [
    { slug: 'movement', section: 'Movement' },
    { slug: 'debuffs', section: 'Debuffs' },
    { slug: 'enemies', section: 'Enemies' },
    { slug: 'lanternites', section: 'Lanternites' },
    { slug: 'lighting', section: 'Lighting' },
    { slug: 'pets', section: 'Pets' },
    { slug: 'ai', section: 'AI' },
    { slug: 'world-modifiers', section: 'World Modifiers' },
    { slug: 'darkness-strength', section: 'Darkness Strength' },
    { slug: 'darkness-upgrades', section: 'Darkness Upgrades' },
    { slug: 'death-vfx', section: 'Death VFX' },
    { slug: 'ability-emitter-vfx', section: 'Ability Emitter VFX' },
    { slug: 'equipment', section: 'Equipment' },
    { slug: 'cast-ended-early', section: 'Cast Ended Early' },
    { slug: 'time-dilation', section: 'Time Dilation' },
    { slug: 'hunger', section: 'Hunger' },
];

export interface GeneralTestSidebarGroup {
    slug: string;
    label: string;
    /** Same key used in URL `selected` and `getScenariosForSelectorKey`. */
    selectorKey: string;
}

export function getGeneralTestSidebarGroups(): GeneralTestSidebarGroup[] {
    const general = getGeneralTestScenarios();
    return GENERAL_GROUP_ORDER.filter(({ section }) => general.some((s) => s.generalSection === section)).map(
        ({ slug, section }) => ({
            slug,
            label: section,
            selectorKey: `general:${slug}`,
        }),
    );
}

export function isRegisteredGeneralGroupSelectorKey(key: string): boolean {
    if (!key.startsWith('general:')) return false;
    const slug = key.slice('general:'.length).toLowerCase();
    return GENERAL_GROUP_ORDER.some((g) => g.slug === slug);
}

/** Map scenario → primary ability id for grouping on the Ability Test page (heuristic by scenario id). */
export function inferScenarioAbilityId(scenario: ScenarioDefinition): string | null {
    if (scenario.category !== 'ability') return null;
    const id = scenario.id;
    if (id.startsWith('light_blast_')) return '0801';
    if (id.startsWith('light_imbuement_')) return '0804';
    if (id.startsWith('imbued_bat_')) return '0803';
    if (id.startsWith('gather_light_')) return '0804';
    if (id.startsWith('shield_of_light_')) return '0805';
    if (id.startsWith('lay_hands_')) return '0806';
    if (id.startsWith('throw_torch_')) return '0601';
    if (id === 'punch_research_strong') return '0117';
    if (id === 'punch_research_double' || id === 'double_punch_two_targets' || id === 'double_punch_death_fallback' || id === 'double_punch_movement_replan') return '0116';
    if (id === 'punch_research_sneaky') return '0118';
    if (id === 'punch_research_charging') return '0119';
    if (id === 'punch_new_baseline' || id.startsWith('bash_')) return '0120';
    if (id.startsWith('pistol_')) return '0203';
    if (id.startsWith('smg_')) return '0204';
    if (id.startsWith('shotgun_')) return '0205';
    if (id.startsWith('throw_rock') || id.includes('throw_rock')) return 'throw_rock';
    if (id.startsWith('claw_')) return '0111';
    if (id.startsWith('laser_sword')) return '0105';
    if (id.startsWith('beast_claw')) return '0611';
    if (id.startsWith('swing_sword') || id.includes('buff_swing')) return '0112';
    if (id.startsWith('swing_bat')) return '0115';
    if (id.startsWith('absorption_shield')) return '0113';
    if (id.startsWith('tech_shield_raise_shield')) return '0104';
    if (id.startsWith('tech_shield_shining_block')) return '0110';
    if (id.startsWith('earth_core_')) return 'earth_core';
    if (id.startsWith('gravity_graze_')) return 'gravity_core';
    if (id.startsWith('gravity_locus_')) return '0901';
    if (id.startsWith('force_push_')) return '0902';
    if (id.startsWith('gravity_inversion_')) return '0903';
    if (id.startsWith('gravity_shield_')) return '0904';
    if (id.startsWith('gravity_collapse_')) return '0905';
    if (id.startsWith('blood_mend_')) return '0301';
    if (id.startsWith('burst_')) return '0302';
    if (id.startsWith('blood_shard_')) return '0304';
    if (id.startsWith('bloody_claws_')) return '0306';
    return null;
}

/**
 * Selector key from the Ability Test page: `tree:<treeId>` (e.g. `tree:training`),
 * `general:<groupSlug>` (e.g. `general:movement`), or legacy ability id / `general:<scenarioId>`.
 */
export function getScenariosForSelectorKey(key: string): ScenarioDefinition[] {
    if (key.startsWith('tree:')) {
        const treeId = key.slice('tree:'.length);
        const group = ABILITY_TREE_GROUPS.find((g) => g.treeId === treeId);
        if (!group) return [];
        return ALL_ABILITY_TEST_SCENARIOS.filter(
            (s) => s.category === 'ability' && group.abilityIds.includes(inferScenarioAbilityId(s) ?? ''),
        );
    }
    if (key.startsWith('general:')) {
        const rest = key.slice('general:'.length);
        const slug = rest.toLowerCase();
        const group = GENERAL_GROUP_ORDER.find((g) => g.slug === slug);
        if (group) {
            return getGeneralTestScenarios().filter((s) => s.generalSection === group.section);
        }
        const s = getScenarioById(rest);
        return s && s.category === 'general' ? [s] : [];
    }
    return ALL_ABILITY_TEST_SCENARIOS.filter((s) => inferScenarioAbilityId(s) === key);
}

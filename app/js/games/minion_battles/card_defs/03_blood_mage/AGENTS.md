# Blood Mage (Ability group 03)

Ranged/mid-range archetype that spends its own HP as a resource to hit and shield allies.
Every ability costs HP to cast — see `abilities/Ability.ts`'s `hpCost`/`hpCostGate`; deduct it with
`abilities/hpCost.ts` (`payHpCost` / `payHpCostBehaviour`), never by hand.

**Visual identity:** black + red, always **blended/misty** — never a stark two-tone split. The
mist reads as life, blood, and death together, not "good half / bad half."

**Mechanical feel:** deliberately risky — longer windups than the typical ~0.2-0.4s norm, so
casting exposes the Blood Mage. Blood Shard is the deliberate exception: a cheap, quick poke
(`QUICK_THROW_PROFILE`) that fills the gaps between the slow, risky casts.

Blood Mend's `floorAtOne` HP gate exists specifically so a
dying Blood Mage can still land one last desperate save (it can never be blocked by the HP
cost, only clamped so it can't kill the caster).

| Path | Purpose |
|---|---|
| `0301_BloodMend/` | Ally blood shield (30 HP, fades over 7s, heals half of what fades via `ShieldBuff.decayHealFraction`) costing HP (`hpCostGate: 'floorAtOne'`); `{Rend 4}` around the ally adds +4 shield per enemy hit (keyword use + `perRendHit`). Subdued VFX: circles stay within unit radius + 20 px (`subduedBurstRadius` / `subduedImpactRadius`). Replaced Protect (0303) |
| `0302_Burst/` | Cone damage costing HP, modeled on `card_defs/0121_ConeOfLight/` |
| `0304_BloodShard/` | Quick-throw blood projectile costing a little HP; 2 uses per round (`roundCharge`). Research "Blood Splinters" (tier 13, `blood_mage_shard_splinters`, via `getAbilityTimings`): on release, each bleeding enemy within range bursts a shard (`ProjectileLaunch.withEmergeFrom`): 4 damage to it, `consumeBleedStacks` up to 4, then the shard flies at the cursor for 4. Hosts come from `findBloodSplinterHosts`, shared with the aim preview |
| `0305_BloodPact/` | Links an ally to the caster for 2 rounds (`buffs/DamageLinkBuff.ts`): half the ally's life loss moves to the caster. HP cost paid over time (`buffs/HpDrainBuff.ts`); tether drawn by `buffs/tetherVisual.ts` |
| `0306_BloodyClaws/` | Three-strike melee combo (left, right, X) built from `hitboxes/AimFrameSegmentHitbox.ts` claws; strikes 2-3 use `SelectTargetDef.turnLimit`; each strike steps toward its own target first (`SelectTargetDef.lunge`, `abilities/stepLunge.ts`); each claw hit adds bleed (`applyBleedToPrimaryTarget`) |
| `../../abilities/bloodMageAllySplash.ts` | Ally-target hover preview hitbox that draws Rend's area (keyword `rend`, `abilities/keywords/rendKeyword.ts`) for Blood Mend |
| `../../abilities/bloodMageVfx.ts` | Shared blood-mist VFX helpers (windup burst, travel, impact flash) — reused by every Blood Mage ability instead of bespoke one-offs |
| `../../game/effect_defs/bloodMageEffects.ts` | Effect visuals the helpers above spawn (`BloodMistBurst`, `BloodMistImpact`, `BloodConeFlash`) |
| `../../game/ShieldShimmerFilter.ts` | Shield shimmer visual filter (black/red/transparent) rendered on units carrying a `ShieldBuff` |

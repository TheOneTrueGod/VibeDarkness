# Blood Mage (Ability group 03)

Ranged/mid-range archetype that spends its own HP as a resource to heal, hit, and shield allies.
All three abilities cost HP to cast — see `abilities/Ability.ts`'s `hpCost`/`hpCostGate`.

**Visual identity:** black + red, always **blended/misty** — never a stark two-tone split. The
mist reads as life, blood, and death together, not "good half / bad half."

**Mechanical feel:** deliberately risky — longer windups than the typical ~0.2-0.4s norm, so
casting exposes the Blood Mage. Blood Mend's `floorAtOne` HP gate exists specifically so a
dying Blood Mage can still land one last desperate save (it can never be blocked by the HP
cost, only clamped so it can't kill the caster).

| Path | Purpose |
|---|---|
| `0301_BloodMend/` | Ally heal costing HP (`hpCostGate: 'floorAtOne'`) |
| `0302_Burst/` | Cone damage costing HP, modeled on `card_defs/0121_ConeOfLight/` |
| `0303_Protect/` | Ally shield buff (`buffs/ShieldBuff.ts`) costing HP |
| `../../abilities/bloodMageVfx.ts` | Shared blood-mist VFX helpers (windup burst, travel, impact flash) — reused by all three abilities instead of bespoke one-offs |
| `../../game/effect_defs/bloodMageEffects.ts` | Effect visuals the helpers above spawn (`BloodMistBurst`, `BloodMistImpact`, `BloodConeFlash`) |
| `../../game/ShieldShimmerFilter.ts` | Shield shimmer visual filter (black/red/transparent) rendered on units carrying a `ShieldBuff` |

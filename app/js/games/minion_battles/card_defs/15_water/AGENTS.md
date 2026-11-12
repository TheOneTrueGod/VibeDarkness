# Water (Ability group 15)

Water is its own skill tree. Its cards spend the **Water** resource (`resources/Water.ts`), which a caster draws from nearby water tiles, draining them a level at a time. The first slice overlaps the Blood Mage; a standalone Water core comes later.

**Visual identity:** Tidewater (`WATER_THEME` in `themes/abilityThemes.ts`): deep navy for mass (ice bodies, the field, the research border), seafoam for the event (edges, frost trails, splashes, the resource). Every card is an **ice** card: frost crystals, shards and droplets. Long windups draw the `water` spell circle (`SPELL_CIRCLE_STYLE_WATER` in `game/spellCircles/spellCircles.ts`): a navy ring with turning seafoam rune dashes, shedding ice shards and falling droplets. The look was chosen in the Ideas → Plans artbook `docs/ideas/plans/0005_2026-11-11_water-tree.md`, whose studio art (`components/minionBattlesHomePage/Ideas/fxArt/waterArt.tsx`) is the visual spec.

**Mechanical feel:** long, committed casts for big effects. The caster stands still through the windup and is paid back with a large area or a strong hit.

**The Blood Mage overlap:** each ice card **swaps into its blood card's slot while castable**, meaning while the caster has the Water and the uses to pay for it. When either runs out, the blood card is back in the slot. This is the generic `whileCastable` swap trigger (`abilities/AGENTS.md`); no engine code names Water or a card id. The cards are granted by Blood Mage research nodes for now (see `card_defs/03_blood_mage/AGENTS.md`).

Build plan: `docs/plans/water-tree-blood-mage-overlap.md`.

| Path | Purpose |
|---|---|
| `1501_IceClaws/` | Ice version of Bloody Claws (`0306`): same combo from `abilities/clawCombo.ts` with longer, wider claws (16, -60) -> (92, 26), 6 damage, keeps the bleed; costs 3 Water instead of HP. Tidewater slash via `ClawSlashStyle` (frost trail, ice-shard chips on hit). Icon `iceClaws.svg` |
| `1502_IceShards/` | Ice version of Blood Shard (`0304`): two throws, each at its own target (`buildMoreRockTimings` with `dualThrowPacing(QUICK_THROW_PROFILE)`: releases at 0.2 s and 0.5 s), 12 damage, each `withPierce(1)`; costs 4 Water; 3 uses. Frost-trailed `assets/projectiles/ice_shard.svg`. Blood Splinters (Blood Shard's shared `bloodSplinterLaunch`) on each throw's release. Icon `iceShards.svg` (its frozen-blood bead is a `PER_FILE_ALLOW` exception in `themes/svgPalette.test.ts`) |
| `1503_FrozenField/` | Ice version of Blood Burst (`0302`): 0.8 s `water` spell circle, then a `pickAtEntry` select (0.8 s) with `orientedRectAtPointHitbox` 160 x 120, centre within 140 px; the pick raises a `SpikesRise` effect across the rectangle; at 1.0 s `landAreaStrike` deals 10 + 0.6 s stun to enemies inside and `GroundPatch` (`cells` = the hitbox's `resolveCells`, `jitterSec: 0`) lays `frozen_field` for 3 s (4 damage + re-stun every 0.5 s, damage scaled into the record's `params.damage`). Costs 16 Water (refunded if cut before the impact); 2 uses as Burst. Mode strip `frozen` / `blood` (`modeAbilityIds.blood` = `0302`). Icon `frozenField.svg` |

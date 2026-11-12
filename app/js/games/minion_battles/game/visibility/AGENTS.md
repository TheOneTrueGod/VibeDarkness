# game/visibility/

What the local team can perceive: unit senses and the derived team perception that decides how each enemy is drawn. **Presentation-only:** simulation code (abilities, AI, managers) must never read perception. AI keeps its own perception range.

| File | Owns |
|------|------|
| `senses.ts` | Sense data: profiles, grants, merge rules, presets, the `SENSE_DEFS` registry (priority, wall and darkness rules, indicator style) and the darkness vision cost curve. No engine runtime imports, so research trees can import the presets. |
| `teamPerception.ts` | Pure `computeTeamPerception`, its per-engine cache, and `getUnitDetection`, the single entry point renderers and UI ask. Debug settings (dark overlay off, "Reveal all units") are honoured there only. |

## Tiers

Each enemy is perceived at the strongest tier any allied living unit reaches: **seen > glimpsed > heard > felt > hidden**. Seen and glimpsed units are drawn; heard and felt units show pulse indicators; hidden units are not drawn. Non-enemies are always seen, and everything is seen when the mission's light system is off.

- **Seen:** the enemy's tile is in the team's vision mask. A tile is in a viewer's vision when it is within vision range, a **forgiving sight line** to it is clear of `blocksVision` terrain, and the darkness cost summed along the centre line stays within the viewer's darkness budget (penetration plus darkvision). The forgiving line (`isTileLineClearPermissive` in `terrain/tileLine.ts`) passes when the centre-to-centre line is clear or any segment between sample points inside the two tiles (centre plus four inset corners) is clear, so a lone pillar that only clips the line does not hide what is behind it. Endpoints are exempt, so wall faces are visible. Light occlusion keeps the strict centre line (`isTileLineClear`), so pillars still cast full shadows.
- **Glimpsed:** not seen, but the enemy stands on a lit tile and some viewer with `glimpseLit` has a clear forgiving sight line to it. No range cap.
- **Heard / felt:** a range-only sense (hearing, tremorsense) reaches the enemy's tile; walls do not block them.

## Where senses come from

`getUnitSenses` merges the unit def baseline (`UnitDefEntry.senses`; players use the player preset), instance grants on the unit (serialized; research `grantSense` effects apply them at mission start, abilities may add more) and grants carried by active buffs.

## Adding a sense

Add the id and profile field in `senses.ts`, a `SENSE_DEFS` entry (its priority sets precedence), merge handling in `mergeSenseGrants` and the JSON parser, and a detector in `teamPerception.ts` (a ranged sense reuses the ranged detector). An indicator style needs a matching `PULSE_STYLES` entry in `GameRenderer/senseIndicatorStyles.ts`.

## Rendering

- `GameRenderer/renderers/visibilityRenderRules.ts`: enemy alpha per tier (`enemyUnitAlpha`), the overlay cap on dark tiles in vision, and `isEffectConcealed`. Tune the constants there.
- `UnitRenderer` hides invisible units (and their shadow and hover juice); a hit on one draws a standalone red flash. `OverlayRenderer` lifts the darkness on the local team's `visibleTiles`. `SenseIndicatorRenderer` draws the heard / felt pulses on wall time. `EffectRenderer` skips `Effect.concealedWithOwner` effects (spell circles) while their owner is invisible.
- Darkness-only styling is gated on `isPerceptionActive(engine)`, since a `'seen'` detection alone can't tell "seen" from "perception off".

---
name: artbook
description: Makes an "artbook" - visual concept art drawn before implementation so the user can confirm it. Two kinds - a mechanic artbook (inline SVG diagram of an ability, attack pattern, unit or mechanic) and a look artbook (colour palettes applied to animated SVG mock-ups of particle effects, spell circles, trails and units, published as an Ideas-tab browser plan). Use when the user asks for an artbook, a diagram of what an ability or mechanic will look like, colour palette options, or particle/VFX concepts, or when a new Minion Battles ability has spatial behaviour worth confirming before building. Implementation pauses until the user approves the artbook.
---

# Artbook

An **artbook** is a visual spec drawn from the user's description *before* any code is written. It
catches misreadings while they are still cheap to fix. There are two kinds:

| Kind | Answers | Lives in |
|---|---|---|
| **Mechanic artbook** | Shape, angle, timing, targeting: "how does it play?" | An inline SVG widget in chat (below) |
| **Look artbook** | Colours and visual effects: "how does it feel?" | A browser plan in the Ideas tab, with animated SVG previews (see "Look artbooks") |

Pick by the question. A new ability with a hitbox wants a mechanic artbook; a re-theme, a new tree
identity, or "brainstorm some palettes / particle effects" wants a look artbook. A big feature can
have both.

## Hard rule: pause until approved

After presenting an artbook, **stop**. Do not edit code, write plan files, scaffold folders, or
start sessions for the feature until the user **explicitly approves** the artbook in chat (e.g.
"approved", "looks good, build it"). Feedback that asks for changes is not approval: redraw and
pause again. Answers to open questions are not approval either unless the user also says to proceed.

Reading code to ground the drawing is fine (and encouraged) while paused.

## Workflow

1. **Ground it.** Briefly check what already exists (e.g. hitbox specs, targeting options, similar
   abilities under `card_defs/`) so the drawing uses real ranges/constants where they exist and
   you can say which parts are new engine work.
2. **Draw** the artbook (see Content and Display below).
3. **Reply** with: your interpretation in a few bullets, which parts reuse existing systems vs need
   new ones, and numbered open questions with a suggested default for each.
4. **Pause** (see hard rule). On feedback, redraw the *whole* artbook, not a patch.
5. **On approval**, the artbook is the spec: carry its geometry, ordering and numbers into the
   implementation and tests, and say if implementation forced any deviation.

## Content

Draw the mechanism, not a flowchart about it.

- **Top-down battlefield view**, caster at the bottom of each panel facing **up**, so "forward"
  is always up the page. If behaviour depends on facing (shapes that rotate with aim), add a
  panel showing the same move at a different facing.
- **One panel per beat** (windup, each strike, each hitbox wave), left to right in cast order.
  Label each panel with a short name and a ≤5-word subtitle under it.
- **Consistent visual language** (keep it across artbooks):
  - Caster: purple circle. Enemies: gray circles. Allies: teal circles.
  - Damage hitboxes: translucent red fill with a thin darker red outline; add texture that matches
    the theme (claw marks, wave lines).
  - Allowed zones (aim limits, retarget arcs, ranges): amber, translucent, dashed outline.
  - Aim lines: thin solid for the current pick, dashed for the previous pick.
  - Clicked target / lock-on point: small crosshair.
  - Movement: arrows; tethers/links: curved lines.
- **Roughly to scale.** Keep relative sizes honest (unit radius vs hitbox length vs range) so
  angles and overlaps read correctly; note when something is exaggerated for clarity.
- **Card icon concept** when the feature adds a card: draw the proposed icon at small size in a
  corner panel.
- **Legend** for every symbol used. Text stays out of the drawing area (labels below panels or in
  the legend); never let strokes cross text.

## Display

- Prefer the inline widget: load the `diagram` guidance with `mcp__visualize__read_me` (silently,
  once per conversation) and render with `mcp__visualize__show_widget`. That guidance owns the SVG
  rules (viewBox, colour classes, dark mode, text sizes); follow it rather than restating it here.
  Give the widget a stable snake_case title per feature (e.g. `<feature>_artbook`) and reuse it
  for redraws.
- Keep it to **one SVG per call**. Split into several artbook calls (with a line of prose between)
  when one image would get crowded, e.g. a sequence sheet plus a facing/rotation sheet.
- No inline widget available (e.g. another editor): write the SVG to a file in the session folder
  and send or link it, then pause the same way.
- Put all explanation and questions in the chat reply, not inside the SVG.

## Look artbooks (palettes and visual effects)

The reference is plan `docs/ideas/plans/0004_2026-11-08_command-core-spirit-animal.md` (the
Command Core spirit animal): five palettes, four particle styles, each shown in a ring, a projectile
trail and off a unit, with the user picking the winner in the browser.

1. **Ground it.** Read the tree's current theme in `themes/abilityThemes.ts`, the role rules in
   `themes/AGENTS.md` (primary = mass, secondary = event), and list which hues other trees already
   own, so each option can say what it collides with.
2. **Write a browser plan** (**jp-browser-plan** for the file format) with:
   - One `> [!FX_PALETTE] Name` card per palette (`primary:` / `secondary:` lines plus a short
     note: the mood in a sentence, then the honest risk - which tree it blurs with, where it loses
     contrast). Offer about five, including the shipped colours as a baseline.
   - One `> [!FX_STUDIO] Title` block. It renders every FX palette in the plan against every
     particle style in every context, with colour pickers and a dark / lit-ground toggle.
   - `[!DECISION]` cards for the palette and the style, each with a recommendation, then items for
     the engine work the choice unlocks.
3. **Add styles or contexts** in `app/js/components/minionBattlesHomePage/Ideas/ParticleFxPreview.tsx`
   when the existing ones don't cover the request: a style is one `STYLES` entry (keyframe stops plus
   a shape), a context is a spawn rule in `makeParticles` plus a base drawing in `FxScene`. Keep
   per-particle SVG filters out (use the soft radial gradients): hundreds of filtered, animated
   particles stall the page. `Armory`-style static previews use `> [!PALETTE]` (`PalettePreview.tsx`).
4. **Verify** the plan page renders (the Ideas tab is admin-only; a throwaway page under `tmp/` that
   renders `PlanDetail` for the plan works without logging in), then point the user to
   Ideas -> Plans and **pause** as for any artbook.
5. **On a decision**, replace each `[!DECISION]` card with a `**Decided:**` line and mark the item
   `[x]`. The chosen pair goes into the tree's theme; the chosen style becomes engine data, not a
   one-off painter.

## Related

- New abilities: **creating-an-ability** (and `app/js/games/minion_battles/card_defs/SKILL.md`)
  once the artbook is approved.
- Hitbox shapes you are drawing: **working-with-hitboxes**.

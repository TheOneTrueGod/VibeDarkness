---
name: artbook
description: Makes an "artbook" - an inline SVG concept diagram of a gameplay feature (ability, attack pattern, unit, mechanic) drawn before implementation so the user can confirm the interpretation. Use when the user asks for an artbook, a diagram of what an ability or mechanic will look like, or when a new Minion Battles ability has spatial behaviour (hitbox shapes, aim, arcs, sequences) worth confirming before building. Implementation pauses until the user approves the artbook.
---

# Artbook

An **artbook** is a visual spec: a top-down sketch of how a feature looks and plays, drawn from
the user's description *before* any code is written. It catches misreadings of shape, angle,
timing and targeting while they are still cheap to fix.

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

## Related

- New abilities: **creating-an-ability** (and `app/js/games/minion_battles/card_defs/SKILL.md`)
  once the artbook is approved.
- Hitbox shapes you are drawing: **working-with-hitboxes**.

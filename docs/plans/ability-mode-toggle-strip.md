# Ability mode toggle strip

## Goal

Per-cast ability modes (Gravity Locus push/pull, Lift push/pull, Throw Charged Rock charged/basic)
are currently only visible as a small "cycle" button shown on hover/select (`AbilitySlot.tsx`).
Players miss it. Replace it with an always-visible **toggle strip** rendered directly under the card,
inside the card's existing height budget:

```
[ card art + uses + cost + name ]   <- shorter card body
[ Pull       ] [ Push       ]       <- toggle strip, full card width, minimal height
```

- Cards **without** `abilityModes` keep the full `ABILITY_SLOT_HEIGHT_PX` (150) card — no change.
- Cards **with** modes: card body + gap + strip together = `ABILITY_SLOT_HEIGHT_PX`, so the bottom bar
  layout (`battleBottomBarLayout.ts` and its test) does not move.
- Strip shows **every** mode side by side (segmented buttons, equal flex widths), the current mode
  highlighted. Must lay out cleanly with **three** modes in a 108px card (short labels, ~10px font).
- Each segment has a tooltip with a succinct per-mode description.

## Engine / def changes (build the engine, not the feature)

`app/js/games/minion_battles/abilities/Ability.ts` — `AbilityModesConfig`:

- Add `modeDescriptions?: Readonly<Record<string, string>>` (mode id → one short sentence, used as the
  segment tooltip). Document it next to `modeLabels`.
- Remove `togglePosition` (and its only user in `0108Ability.ts`) — the strip replaces both positions.
  `toggleStyle: 'segmentedAbove'` (Wait) is unchanged; the hand strip applies to `cycle`/undefined style.
- Gravity cards currently rely on a hard-coded `'pull' → 'Pull'` fallback in `AbilitySlot.tsx`. Move the
  labels into data: export shared `GRAVITY_ABILITY_MODE_LABELS` from `card_defs/09_gravity_core/gravityConstants.ts`
  and set `modeLabels` on 0901 and 0903; delete the fallback in `AbilitySlot.tsx` (fallback to the raw mode id is fine).

Descriptions (keep this terse style):

| Ability | Mode | Label | Description |
|---|---|---|---|
| Gravity Locus (0901) | pull | Pull | Pull enemies towards the center |
| Gravity Locus (0901) | push | Push | Push enemies from the center |
| Lift (0903) | push | Push | Slam enemies straight down |
| Lift (0903) | pull | Pull | Slam enemies in front of you |
| Throw Charged Rock (0108) | charged | Charged | Throw an explosive charged rock |
| Throw Charged Rock (0108) | basic | Basic | Throw a plain rock |

(Verify Lift/Charged Rock wording against each card's existing tooltip text and adjust if wrong.)

## UI changes

### `ui/components/battleUiSlots/battleBottomBarLayout.ts`
Add constants (no change to `ABILITY_SLOT_HEIGHT_PX`):
- `ABILITY_MODE_STRIP_HEIGHT_PX` ≈ 18
- `ABILITY_MODE_STRIP_GAP_PX` ≈ 4
Extend `battleBottomBarLayout.test.ts` with a sanity check that card body + gap + strip == `ABILITY_SLOT_HEIGHT_PX`
and the body still fits the 56px icon + uses row + 2-line name.

### `ui/components/AbilityModeStrip.tsx` (new, small component)
Props: `modes`, `currentMode`, `labels?`, `descriptions?`, `onSelectMode(mode)`, `interactive: boolean`.
- Row of `<button>`s, `flex-1` each, `gap` ~2–4px, full parent width, `aria-pressed` on the selected one,
  `role="group"`. Selected style: violet (matches current toggle palette, e.g. `border-violet-400 bg-violet-700/80 text-white`);
  unselected: dim (`border-violet-400/30 bg-violet-950/70 text-violet-300/70`).
- Every click/keydown calls `e.stopPropagation(); e.preventDefault()` so it never selects the card.
- Non-interactive (not my turn): still rendered so the current mode is always visible, but buttons are
  `disabled`/dimmed and do nothing.
- Tooltip: use the project's existing tooltip component if a lightweight one fits (see the
  `editing-and-creating-components` skill); otherwise `title` + `aria-label` = `"<Label>: <description>"`.
  Hovering a segment must not hide/flicker the card's own `AbilityTooltip` badly — acceptable either way,
  but don't break card hover.
- Add `data-testid`s following the Wait toggle pattern in `CornerSlotMiscControls.tsx`.

### `ui/components/AbilitySlot.tsx`
- Replace `showModeToggle` / `onCycleAbilityMode` / the cycle button with:
  `abilityModes`, `currentAbilityMode`, `onSetAbilityMode?: (mode) => void`, `modeStripInteractive?: boolean`.
- When the slot has a hand-strip-style `abilityModes` (`toggleStyle` not `segmentedAbove`) **and** `onSetAbilityMode`
  is provided: card `height = heightPx - STRIP - GAP`, render `<AbilityModeStrip>` below the card box (outside the
  bordered card, inside the outer wrapper), width `ABILITY_SLOT_WIDTH_PX`.
- Tighten the card body slightly so the shorter card still looks balanced (e.g. icon area padding); the 56px icon
  and 2-line name must still fit — don't shrink the icon.
- The strip should move with hover/select lift (`-translate-y-*`) or stay put — pick whichever looks right, but the
  card and strip must not overlap.

### `ui/components/battleUiSlots/RowSlotAbilities.tsx` + `ui/pages/battlePhase/BattleAbilityBar.tsx`
- Pass `onSetAbilityMode={(mode) => onSetAbilityMode(card.slotAbilityId, mode)}` using the existing
  `handleSetAbilityMode` from `useInteractionManagerBridge.ts` (already exported, already refreshes the
  nonconfirmed order). Add an `onSetAbilityMode` prop to `RowSlotAbilities`.
- `modeStripInteractive = isMyTurn`. Drop the hover/select gating — the strip is always shown.
- Remove `onCycleAbilityMode` plumbing if nothing else uses it (check `handleCycleAbilityMode` users and
  keyboard shortcuts in `PlayerInteractionManager` first; keep it if anything still cycles).

### Other `AbilitySlot` callers
Character select / Quest Prep (`heightPx = ABILITY_SLOT_PREP_HEIGHT_PX`) don't pass `onSetAbilityMode`, so they
keep the full-height card with no strip. Confirm no caller breaks after the prop change.

## Docs
- Update `abilities/AGENTS.md` (or wherever `abilityModes` is documented — grep `modeLabels`) with `modeDescriptions`
  and the strip behaviour; note new abilities with modes must supply labels + descriptions.
- Add `AbilityModeStrip` to the `components-for-the-ui` skill list.

## Verification
- `npx tsc --noEmit`
- `npx vitest run app/js/games/minion_battles/ui/components/battleUiSlots/battleBottomBarLayout.test.ts`
- `npx vitest run --changed` for anything touching ability defs / mode resolution.
- Optional: a small RTL test for `AbilityModeStrip` (renders N buttons, click calls `onSelectMode`, does not
  propagate, disabled when non-interactive) if the repo has React component tests nearby.
- Visual check in the app: a hand with Gravity Locus + Lift + a plain card — plain card full height, mode cards
  show strip, clicking a segment switches mode without selecting the card, tooltips show descriptions.

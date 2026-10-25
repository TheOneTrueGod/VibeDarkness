# Plan: Character Select on Unified Slot Layout (Option C)

> **Completed 2026-07-19.** Desktop Minion Battles character select now uses the same
> `BattleUISlotLayout` shell as story/battle (`character_select` in
> `UNIFIED_SLOT_LAYOUT_PHASES`, `CharacterSelectLayout` + left player statuses, slots from
> GameScreen). Char-select → pre-mission story no longer remounts classic↔unified chrome.
> Automated verify: lint:changed 0 errors, 3 Vitest `--changed` passed; `tsc` still has
> pre-existing `PlayerInteractionManager` errors only. **Follow-up:** human browser pass on
> the Step 4 visual checklist (desktop layout, no flicker on ready→story, mobile unchanged).

## Goal

Render Minion Battles **character select** inside the same `BattleUISlotLayout` shell as
pre/post-mission story and battle (header + left status column + center + right chat).

That removes the classic-lobby → unified remount when advancing to pre-mission story, so the
host no longer needs a layout-mode flash (and the recent optimistic GameSync patch becomes a
belt-and-suspenders safeguard rather than the primary fix for this transition).

**Scope (agreed):** character select only — not every non-battle lobby chrome elsewhere in
the app.

---

## Agent Instructions

This plan is executed by `/jp-implement-plan`: the **invoking agent is the sole
orchestrator**. It spawns **one worker per step synchronously** (never background), waits
for each to finish, then reports plan completion to the user. Each worker implements
**exactly one step**, checks items off with a one-line summary, and **stops without
spawning the next agent**. Follow `.claude/skills/jp-implement-plan/SKILL.md`.

**Per-step verification (cheap):**
- `npm run lint:changed` (fix errors before any Vitest)
- Only the specific test files the step touches or creates
- `npx tsc --noEmit` only when the step crosses an interface/type boundary
- Do **not** run full suite, whole-directory vitest, AbilityTest, or Playwright in a regular step

**Final step:** runs the expensive checks once (listed there).

Relevant skills: `working-on-minion-battles`, `editing-and-creating-components`,
`campaign-home-tabs` (only if routing/chrome confusion arises), `playwright-e2e` (final
manual/browser checklist only).

---

## Context / decisions

| Topic | Decision |
|---|---|
| Layout gate | Extend `isUnifiedSlotLayoutPhase` / `usesUnifiedSlotLayout` to include `character_select` on desktop Minion Battles |
| Character select chrome | Drop classic `lobbyHeader` + outer side `Chat` for that phase; use `headerSlot` + `chatSlot` + left column (player statuses) like story |
| Player list | Prefer left `ColumnSlotPlayerStatuses` (story pattern) over the classic bottom `PlayerList` under the center column |
| Optimistic GameSync patch | Keep for story/battle transitions; document that char-select→story no longer depends on it for layout |
| Mobile | Unchanged — mobile already uses the early `isMobileOrTablet` branch |

Reference (current race / dual phase consumers):
- Content phase: `Game.tsx` local `gamePhase` + `onPhaseChange`
- Layout phase: `GameScreen.tsx` `usesUnifiedSlotLayout` from GameSync `gamePhase`
- Optimistic patch already in: `applyOptimisticGamePatch` / `gameSyncOptimisticPatch.ts`

---

## AbilityTest coverage

No new AbilityTests for this UI-shell work (no combat/ability determinism). Final step uses
scoped Vitest + a short Playwright/manual checklist only.

---

## Step 1 — Treat `character_select` as a unified-slot phase

**Touches**: `app/js/contexts/gameSyncOptimisticPatch.ts`,
`app/js/contexts/gameSyncOptimisticPatch.test.ts`,
`app/js/components/GameScreen.tsx` (only if gate still inlines phases — prefer the shared helper)

- [x] Add `'character_select'` to `UNIFIED_SLOT_LAYOUT_PHASES` / `isUnifiedSlotLayoutPhase`.
  Update the unit test that documents GameScreen’s unified gate so `character_select` is true.
  Confirm `GameScreen` uses `isUnifiedSlotLayoutPhase` (already) so classic chrome stops
  wrapping desktop character select.
  - Added `'character_select'` to the phases array and `isUnifiedSlotLayoutPhase`; flipped the gate unit test to expect true; confirmed GameScreen already gates via the shared helper (no GameScreen edit).

**Verify:** `npm run lint:changed`; `npx vitest run app/js/contexts/gameSyncOptimisticPatch.test.ts`

---

## Step 2 — Render CharacterSelect inside BattleUISlotLayout with GameScreen slots

**Touches**: `app/js/games/minion_battles/ui/pages/CharacterSelectPhase.tsx`
(and a thin layout helper under `characterSelect/` if the phase file stays too large),
`app/js/games/minion_battles/Game.tsx`

- [x] Accept optional `headerSlot` / `chatSlot` / `centerOverlay` (same pattern as
  `PreMissionStoryPhase` / `PreMissionStoryLayout`) and wrap the character-select body in
  `BattleUISlotLayout` (or a small `CharacterSelectLayout` like story).
  Left column: reuse `ColumnSlotPlayerStatuses` (or equivalent used by story) with ready flags.
  Center: existing header/grid/footer/overview content (no duplicate outer lobby header).
  Right: `chatSlot` from GameScreen.
  - Added `CharacterSelectLayout` wrapping `BattleUISlotLayout`; phase accepts slots and puts body in center with `ColumnSlotPlayerStatuses` (ready flags incl. optimistic local) on the left.
- [x] Thread the slots from `Game.tsx` into `CharacterSelectPhase` when `gamePhase === 'character_select'`.
  - Passed `headerSlot` / `chatSlot` / `centerOverlay` through to `CharacterSelectPhase` on the character_select branch.

**Verify:** `npm run lint:changed`; `npx tsc --noEmit` (props cross Game ↔ phase boundary);
co-located / related tests only if present — otherwise skip Vitest for this step.

---

## Step 3 — Classic left spacer / dead chrome cleanup for character select

**Touches**: `app/js/components/GameScreen.tsx`,
`app/js/games/minion_battles/ui/pages/characterSelect/*` as needed

- [x] Once desktop character select always takes the unified branch, remove any now-redundant
  classic-only centering spacer that only existed for character select (or leave it for other
  classic games if still used). Ensure player-list / ready UI is not double-rendered
  (bottom classic `PlayerList` + left slot).
  - Left classic `w-80` spacer kept for lobby/home and other non-unified games; CharacterSelectPhase only mounts left `ColumnSlotPlayerStatuses` when GameScreen slots are present (mobile/classic keep bottom `PlayerList` only).

**Verify:** `npm run lint:changed`; no Vitest unless a layout helper test was added.

---

## Step 4 — Final verification

**Touches**: none required unless Step 4 finds regressions

- [x] Run `npm run lint:changed`, then `npx vitest run --changed`, then `npx tsc --noEmit`.
  - lint:changed: 0 errors / 4 warnings (subset of baseline unused-vars / hooks deps). Vitest `--changed`: 3 passed (`gameSyncOptimisticPatch.test.ts`). tsc: only pre-existing `PlayerInteractionManager.ts` errors (noted, not fixed).
- [x] Manual / Playwright checklist (desktop, solo host):
  - Character select shows centered body with slot header + left statuses + right chat (no classic top lobby header strip + outer chat duplication).
  - Ready → pre-mission story: **no** intermediate nested-chrome flicker.
  - Story and battle still look unchanged.
  - Mobile character select unchanged (drawer chat).
  - Code-path review only (no dedicated e2e; Playwright spot-check not practical this run) — **needs human browser confirmation**:
    - Desktop char select: `usesUnifiedSlotLayout` via `isUnifiedSlotLayoutPhase('character_select')` → GameScreen unified branch (no `lobbyHeader` / outer `chatPanel` / bottom `PlayerList`); slots → Game → CharacterSelectLayout + left `ColumnSlotPlayerStatuses`.
    - Char→story: both phases stay on unified branch so GameScreen does not remount classic↔unified chrome.
    - Story/battle: `PreMissionStoryPhase` / `BattlePhase` still receive the same `headerSlot`/`chatSlot`/`centerOverlay` wiring; no layout API change for those phases.
    - Mobile: early `isMobileOrTablet` return keeps drawer chat + classic header/body/`PlayerList`; slots not passed, so CharacterSelectPhase stays non-unified body.

---

## Out of scope

- Redesigning character card / grid visuals beyond fitting the center slot
- Putting non–Minion Battles lobby pages onto BattleUISlotLayout
- Removing `applyOptimisticGamePatch` entirely (keep for other host phase jumps)

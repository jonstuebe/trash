# Agent Development Notes

This is a Foldkit app. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing any code in this project. It covers the architecture, the APIs, and the conventions the project is built on.

Foldkit owns `FOLDKIT.md` and replaces it whole on upgrade. This file is yours. Anything you want an agent to know about this project goes below, where an upgrade won't touch it.

`FOLDKIT.md` reads the line below to decide whether it has already offered to vendor the Foldkit source. Leave it in place.

subtree_prompted: false

## Project Notes

Trash is a card game PWA (Vite + Foldkit, no XState: turn logic is pure and lives in `update`).

- `src/domain/card.ts` and `src/domain/game.ts`: pure rules. All game transitions are `Game => Game` functions, tested in `src/domain/game.test.ts`.
- `src/main.ts`: Foldkit update and Commands. Randomness (`ShuffleDeck`, `ReshuffleDiscard`) and bot pacing (`WaitBeforeBotStep`) are Commands.
- `Game.sequence` increments on every transition. Command results carry the sequence they were issued for and are ignored if it no longer matches, so stale bot timers can't act on a newer state.
- House rules: Jacks are wild and can later be swapped out by the real card. Queens and Kings are trash. The discard can be taken only if it fits. When someone finishes, everyone else gets one more turn. Finishers play one fewer card next round; finishing a one-card round wins.
- Vocabulary: a *spot* or *slot* is one of a player's Ace through Ten positions; the *target* is how many slots a player has this round; the *closer* is the first player to finish a round.
- Sheets: How to play is a `@foldkit/ui` Dialog (`guideDialog` in the Model), so it gets enter and leave transitions, Escape and focus handling. `src/sheetGesture.ts` is a Mount for drag-to-dismiss: it moves the sheet directly in the DOM while dragging and sends only `SwipedDownGuide`.
- Layout: every screen is exactly `--app-h` (`100dvh`) tall and never scrolls. Card size is derived from both width and height in `src/styles.css`; if you add chrome to the table, update `--table-fixed`.
- Updates: the service worker uses `registerType: 'prompt'`. `src/subscription.ts` turns a waiting worker into `FoundAppUpdate`, the banner's Update button runs `ApplyAppUpdate` (posts `SKIP_WAITING`), and the page reloads when the new worker takes over. `virtual:pwa-register` is imported only there, because it doesn't exist under Vitest.
- Icons: `public/icon.svg` is the source; `vite-plugin-pwa` generates PNGs at build time from `pwa-assets.config.ts`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `jonstuebe/trash` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

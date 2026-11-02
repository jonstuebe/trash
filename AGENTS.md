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
- Vocabulary: a _spot_ or _slot_ is one of a player's Ace through Ten positions; the _target_ is how many slots a player has this round; the _closer_ is the first player to finish a round.
- Sheets: How to play is a `@foldkit/ui` Dialog (`guideDialog` in the Model), so it gets enter and leave transitions, Escape and focus handling. `src/sheetGesture.ts` is a Mount for drag-to-dismiss: it moves the sheet directly in the DOM while dragging and sends only `SwipedDownGuide`.
- Layout: every screen is exactly `--app-h` (`100dvh`) tall and never scrolls. Card size is derived from both width and height in `src/styles.css`; if you add chrome to the table, update `--table-fixed`. A Home Screen app on iOS opens with a viewport one status bar short of the screen and grows it to fit the document, so `body` has a `min-height` of `100vh` plus the top inset; check full-screen layout changes in a Home Screen app, not just Safari.
- Updates: the service worker uses `registerType: 'prompt'`. `src/subscription.ts` turns a waiting worker into `FoundAppUpdate`, the banner's Update button runs `ApplyAppUpdate` (posts `SKIP_WAITING`), and the page reloads when the new worker takes over. `virtual:pwa-register` is imported only there, because it doesn't exist under Vitest.
- Friend games: two players on two devices, turn by turn over hours or days. `worker/index.ts` is the Worker; each invite code (`/r/K7QXMP`) is one `Room` Durable Object holding the Game in SQLite storage, with hibernatable WebSockets. The Worker reaches it through `ctx.exports.Room`, not an env binding, so each preview deploy gets its own rooms. The Room runs the same rules as the client through `src/domain/room.ts` (seating, `applyMove`, `settle`), which is pure and tested. The Room shuffles, checks turns and `sequence`, and sends each device `redact`ed Games, so face-down cards and the draw pile never leave the server. Seats are tied to a random device ID in localStorage (`src/storage.ts`); the client never applies a friend Move itself, it sends it (`SendMove`) and renders what comes back.
- Bot games are one bot and never touch the network, so they keep working offline. Only `/api/*` reaches the Worker (`runWorkerFirst`).
- The socket is a ManagedResource (`src/roomSocket.ts`) that queues messages from the moment it opens; the Subscription drains that queue only once the screen is `Connected`. Coming back to the app (`ReturnedToApp`) reconnects a dropped socket.
- Turn alerts (Web Push): a device that taps "Alert me" asks for notification permission (inside the tap, from the `AskForTurnAlerts` Mount, because iOS refuses the prompt otherwise), subscribes, and POSTs its subscription to `/api/rooms/CODE/push`; the Room keeps one per seat and re-receives it on every connection (`RegisterTurnAlerts`). After each change the Room sends `alertsFor` (`src/domain/push.ts`, pure and tested) to seats with no open socket. The app drops its socket when hidden (`LeftApp`), because a phone suspends a backgrounded app without closing it. Encryption and VAPID signing are hand-rolled on WebCrypto in `worker/webPush.ts`. The public key is `VAPID_PUBLIC_KEY` in `src/domain/push.ts`; the private key is the Worker secret `VAPID_PRIVATE_KEY` (`.dev.vars` locally; `scripts/vapid.ts` makes a pair). The service worker gets its push handlers from `public/push-sw.js` through Workbox `importScripts`; it names the notification icon by its versioned file name, so bump it there too when icons change. iPhones only allow push from the Home Screen app, so the lobby says so (`NeedsHomeScreen`).
- The view never assumes seat 0 is the person: table views take a `Table` with the `viewer` seat.
- Icons: `public/icon.svg` is the source; `vite-plugin-pwa` generates PNGs at build time from `pwa-assets.config.ts`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `jonstuebe/trash` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
